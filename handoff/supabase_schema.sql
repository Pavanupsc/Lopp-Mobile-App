-- ============================================================================
-- Loop — Supabase schema (v1, symbolic money)
-- Run as one migration: supabase/migrations/0001_init.sql
-- Postgres + Row Level Security. Money is symbolic: amounts are plain integers,
-- no payment processor is involved.
-- ============================================================================

-- ---------- enums ----------
create type goal_kind        as enum ('goal', 'micro');
create type submission_state as enum ('todo', 'pending', 'approved', 'rejected');
create type proof_kind       as enum ('photo', 'oath', 'link');
create type ledger_state     as enum ('at_risk', 'locked', 'lost', 'redeemed');
create type money_model      as enum ('all_or_nothing', 'pro_rata');
create type pair_state       as enum ('pending', 'active', 'revoked');

-- ============================================================================
-- profiles  (1:1 with auth.users)
-- ============================================================================
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null default 'New user',
  initial       text not null default '?',
  avatar_color  text not null default '#46f08a',
  timezone      text not null default 'UTC',
  level         int  not null default 1,
  level_name    text not null default 'Starting',
  xp            int  not null default 0,
  xp_next       int  not null default 200,
  streak        int  not null default 0,
  best_streak   int  not null default 0,
  tokens        int  not null default 2,
  consistency   int  not null default 0,   -- 0..100, derived/cached
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- pairs  (directed verification edge: verifier approves subject's proof)
-- A subject has at most ONE active verifier; a verifier can have MANY subjects.
-- ============================================================================
create table pairs (
  id          uuid primary key default gen_random_uuid(),
  verifier_id uuid not null references profiles(id) on delete cascade,
  subject_id  uuid not null references profiles(id) on delete cascade,
  status      pair_state not null default 'active',
  created_at  timestamptz not null default now(),
  check (verifier_id <> subject_id)
);
-- one active verifier per subject:
create unique index pairs_one_active_verifier
  on pairs(subject_id) where status = 'active';
create index pairs_verifier_idx on pairs(verifier_id);

-- ============================================================================
-- invites  (share a code/link to become someone's verifier or subject)
-- ============================================================================
create table invites (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique default encode(gen_random_bytes(6),'hex'),
  inviter_id  uuid not null references profiles(id) on delete cascade,
  -- role the inviter will play once accepted:
  inviter_is_verifier boolean not null default true,
  accepted_by uuid references profiles(id),
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- contracts  (one active period per user; symbolic stake)
-- ============================================================================
create table contracts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  stake         int  not null default 1000,   -- symbolic dollars
  daily_target  int  not null default 15,     -- points
  days_in_month int  not null default 30,
  model         money_model not null default 'all_or_nothing',
  period_start  date not null default current_date,
  period_end    date not null default (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index contracts_one_active on contracts(user_id) where active;

-- ============================================================================
-- goals  (goals + micro-goals; a user's recurring daily targets)
-- ============================================================================
create table goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  title      text not null,
  meta       text default '',          -- e.g. "6:30 AM"
  points     int  not null default 5,
  kind       goal_kind not null default 'goal',
  active     boolean not null default true,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
create index goals_user_idx on goals(user_id) where active;

-- ============================================================================
-- submissions  (one row per goal per day: the daily instance + its proof)
-- ============================================================================
create table submissions (
  id          uuid primary key default gen_random_uuid(),
  goal_id     uuid not null references goals(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,  -- the subject
  reviewer_id uuid references profiles(id),                              -- the verifier (denormalized for RLS + realtime filter)
  day         date not null default current_date,
  status      submission_state not null default 'todo',
  points      int not null default 5,           -- snapshot of goal.points at submit time
  proof_kind  proof_kind,
  proof_text  text,                             -- oath text or link URL
  proof_path  text,                             -- Storage object path for photos
  proof_at    timestamptz,
  review_note text,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (goal_id, day)
);
create index submissions_reviewer_idx on submissions(reviewer_id, status);
create index submissions_user_day_idx on submissions(user_id, day);

-- ============================================================================
-- ledger  (per-day slice outcome; drives the Vault numbers — symbolic)
-- ============================================================================
create table ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  day        date not null,
  amount     int  not null,                 -- the daily slice (stake/days_in_month)
  status     ledger_state not null default 'at_risk',
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
create index ledger_user_idx on ledger(user_id);

-- ============================================================================
-- new-user trigger: seed a profile from Google metadata
-- ============================================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  nm := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1));
  insert into profiles (id, display_name, initial, avatar_color)
  values (new.id, nm, upper(left(nm,1)), '#46f08a');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- keep submissions.reviewer_id in sync with the subject's active verifier
-- ============================================================================
create or replace function set_submission_reviewer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select verifier_id into new.reviewer_id
  from pairs where subject_id = new.user_id and status = 'active' limit 1;
  return new;
end $$;

create trigger submissions_set_reviewer
  before insert on submissions
  for each row execute function set_submission_reviewer();

-- ============================================================================
-- on approve: write/lock the day's ledger slice if the target is now met
-- ============================================================================
create or replace function on_submission_approved()
returns trigger language plpgsql security definer set search_path = public as $$
declare c contracts%rowtype; total int; slice int;
begin
  if new.status = 'approved' and coalesce(old.status,'') <> 'approved' then
    select * into c from contracts where user_id = new.user_id and active limit 1;
    if not found then return new; end if;
    slice := round(c.stake::numeric / c.days_in_month);
    select coalesce(sum(points),0) into total
      from submissions where user_id = new.user_id and day = new.day and status = 'approved';
    if total >= c.daily_target then
      insert into ledger (user_id, day, amount, status)
      values (new.user_id, new.day, slice, 'locked')
      on conflict (user_id, day) do update set status = 'locked', amount = slice;
    end if;
  end if;
  return new;
end $$;

create trigger submissions_after_approve
  after update on submissions
  for each row execute function on_submission_approved();

-- ============================================================================
-- helper: is the current user the active verifier of :subject ?
-- ============================================================================
create or replace function is_verifier_of(subject uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from pairs
    where subject_id = subject and verifier_id = auth.uid() and status = 'active'
  );
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table profiles    enable row level security;
alter table pairs       enable row level security;
alter table invites     enable row level security;
alter table contracts   enable row level security;
alter table goals       enable row level security;
alter table submissions enable row level security;
alter table ledger      enable row level security;

-- profiles: read self + anyone in your loop (your verifier or your subjects); write self
create policy profiles_select on profiles for select using (
  id = auth.uid()
  or is_verifier_of(id)                                   -- they are my subject
  or exists (select 1 from pairs where verifier_id = id and subject_id = auth.uid() and status='active') -- they are my verifier
);
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- pairs: see edges you're part of; create edges you're part of; subject can revoke
create policy pairs_select on pairs for select using (verifier_id = auth.uid() or subject_id = auth.uid());
create policy pairs_insert on pairs for insert with check (verifier_id = auth.uid() or subject_id = auth.uid());
create policy pairs_update on pairs for update using (verifier_id = auth.uid() or subject_id = auth.uid());

-- invites: inviter manages own; anyone signed-in can read by code to accept (code is the secret)
create policy invites_owner on invites for all using (inviter_id = auth.uid()) with check (inviter_id = auth.uid());
create policy invites_accept on invites for select using (auth.uid() is not null);

-- contracts: own only
create policy contracts_own on contracts for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- goals: subject full control; verifier read-only
create policy goals_own on goals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goals_verifier_read on goals for select using (is_verifier_of(user_id));

-- submissions:
--   subject: read own, insert own, update own ONLY while not yet decided (submit/resubmit)
--   verifier: read those they review, and update status (approve/reject)
create policy submissions_subject_select on submissions for select using (user_id = auth.uid());
create policy submissions_subject_insert on submissions for insert with check (user_id = auth.uid());
create policy submissions_subject_update on submissions for update
  using (user_id = auth.uid() and status in ('todo','pending','rejected'))
  with check (user_id = auth.uid());
create policy submissions_verifier_select on submissions for select using (reviewer_id = auth.uid());
create policy submissions_verifier_update on submissions for update
  using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid());

-- ledger: subject reads own; verifier reads their subjects'; writes happen via trigger (security definer)
create policy ledger_subject_select on ledger for select using (user_id = auth.uid());
create policy ledger_verifier_select on ledger for select using (is_verifier_of(user_id));

-- ============================================================================
-- STORAGE: private "proofs" bucket
-- Create bucket in dashboard (or storage.create_bucket) named 'proofs', NOT public.
-- Convention: object path = '<subject_user_id>/<submission_id>.<ext>'
-- ============================================================================
-- subject can upload/read/replace their own folder:
create policy proofs_owner on storage.objects for all
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);
-- verifier can read proof of people they verify:
create policy proofs_verifier_read on storage.objects for select
  using (bucket_id = 'proofs' and is_verifier_of(((storage.foldername(name))[1])::uuid));

-- ============================================================================
-- REALTIME: expose submissions changes (RLS still applies per-subscriber)
-- ============================================================================
alter publication supabase_realtime add table submissions;
alter publication supabase_realtime add table ledger;

-- ============================================================================
-- NOTE: daily rollover (create 'todo' submissions for active goals + mark
-- previous day's unlocked slices 'at_risk'/'lost') runs as a scheduled job —
-- pg_cron or a Vercel Cron hitting an Edge Function. Not modeled here.
-- ============================================================================
