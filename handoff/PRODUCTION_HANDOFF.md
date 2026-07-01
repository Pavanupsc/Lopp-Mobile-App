# Loop — Production Handoff

**Audience:** the frontend developer building the production app.
**Goal of v1:** a mobile-web app (Vercel) backed by Supabase, with real users (Google sign-in), real persistence, and live verification. **Money is symbolic in v1** — we track the number, no real funds, no payments processor, no escrow, no compliance.

The prototype (`Loop.dc.html` in this project) is the **visual + interaction reference**. It is not the production codebase — it runs on an in-house preview runtime and stores state in `localStorage`. Rebuild the screens in Next.js and wire them to Supabase. Match the prototype's layout, copy, colors, and motion.

---

## 1. What the app is

Loop is a stakes-based accountability app. A user puts a (symbolic) monthly stake "on the line", splits it into daily slices, and earns each slice back by hitting a daily **points target**. Points come from completing **goals** and **micro-goals**, each worth points. Crucially, completion isn't self-reported — the user submits **proof** (photo / written oath / link) and a **verifier** (another human) must **approve** it before the points count.

### The relationship model (important — this changed from the old prototype)
- Each user has **one verifier** — the person who approves *their* proof. Think "manager".
- A verifier can verify **many** people. So one person opens the **Monitor** tab and sees *all* the people they verify, grouped, each with their pending proof.
- A person can be **both** a verifier and a subject (Priya verifies You; You verify Priya, Alex, Sam). It's a directed graph of 1-to-1 verification edges, not a fixed ring.

In the prototype demo data:
- `you@loop.app` is verified by **Priya**, and verifies **Alex, Sam, Priya** (3 people in the Monitor tab).
- `alex`, `sam`, `priya` are each verified by **You**.

### Screens (all in the prototype)
- **Login** — Google sign-in in production (prototype uses email + demo password).
- **Today** — the Loop ring (points today / target), streak, today's cash, goals list (Do it → proof sheet), micro-goals ("Claw it back").
- **Vault** — recovered $ vs at-risk $, daily slice, tokens, redemption challenge, payout history, reset warning.
- **Stats** — streak calendar, level/XP, consistency vs your verifier, the loop diagram, badges.
- **Setup** — the contract (stake / slice / target / verifier), goal & micro CRUD with points steppers, the loop wiring overview, log out.
- **Monitor** — everyone you verify, grouped; approve (Verify ✓) or reject with a note.
- **Proof sheet** (modal) — pick Photo / Oath / Link, attach, submit for review.
- **Celebration** (overlay) — fires on verify/lock, with a money roll-up animation.

---

## 2. Architecture

```
Next.js (App Router) on Vercel
   │   @supabase/ssr  ── cookie-based auth (Google OAuth)
   │   supabase-js    ── data queries + Realtime
   ▼
Supabase
   ├── Auth (Google provider)
   ├── Postgres (+ Row Level Security on every table)
   ├── Storage (private "proofs" bucket)
   ├── Realtime (postgres_changes on submissions)
   └── Edge Function / pg_cron (daily rollover + at-risk computation)
```

**Recommended stack**
- Next.js App Router, TypeScript.
- `@supabase/ssr` for auth in Server Components / Route Handlers + middleware for session refresh.
- `@supabase/supabase-js` for client queries and Realtime channels.
- TanStack Query (or SWR) for client cache; or rely on RSC + server actions.
- It's a mobile-web app — build it as an installable **PWA** (manifest + theme color `#08080a`). No native shell needed for v1.

**Project layout (suggested)**
```
app/
  (auth)/login/page.tsx
  (app)/today/page.tsx
  (app)/vault/page.tsx
  (app)/stats/page.tsx
  (app)/setup/page.tsx
  (app)/monitor/page.tsx
  layout.tsx           // tab bar + phase toggle (My goals / Monitor)
components/            // LoopRing, GoalCard, ProofSheet, Celebration, MoniteeGroup, ...
lib/supabase/         // server.ts, client.ts, middleware.ts
lib/economy.ts        // slice/points/lock math (port from prototype renderVals)
supabase/migrations/  // 0001_init.sql (see supabase_schema.sql)
```

---

## 3. Auth flow (Google)

1. Enable the **Google** provider in Supabase Auth; add Vercel production + preview URLs and `http://localhost:3000` to redirect allow-list.
2. Login page → `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: <origin>/auth/callback } })`.
3. `/auth/callback` route handler exchanges the code for a session (`exchangeCodeForSession`) and redirects to `/today`.
4. A Postgres trigger (`handle_new_user`, see schema) inserts a `profiles` row on first sign-up, seeding `display_name`/`avatar_color` from the Google metadata.
5. Middleware refreshes the session cookie on every request; unauthenticated users are redirected to `/login`.

Remove from the prototype for prod: the demo password field, the "DEMO · PASS loop" hint, the quick-account buttons, the "Switch user (demo)" panel in Setup, and the "Reset demo data" button.

---

## 4. Realtime

Two subscriptions (both filtered by RLS so a user only receives their own rows):

- **Verifier (Monitor tab):** subscribe to `INSERT`/`UPDATE` on `submissions` where `reviewer_id = me`. When a subject submits proof, the new pending card appears instantly.
- **Subject (Today tab):** subscribe to `UPDATE` on `submissions` where `user_id = me`. When your verifier approves/rejects, the goal card flips to approved (and fires the celebration) or shows the rejection note + "Try again".

```ts
supabase.channel('reviews')
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'submissions', filter: `reviewer_id=eq.${userId}` },
      payload => queryClient.invalidateQueries(['monitor']))
  .subscribe();
```

Enable Realtime on the `submissions` table in the Supabase dashboard (or `alter publication supabase_realtime add table submissions;`).

---

## 5. The economy (port this exactly)

All symbolic. Logic lives in the prototype's `renderVals()` / `cfg()` — port to `lib/economy.ts`:

- `slice = round(stake / daysInMonth)`
- `dayLocked = todayPoints >= dailyTarget`
- `todayCash = dayLocked ? slice : (model === 'pro-rata' ? round(min(1, todayPoints/target) * slice) : 0)`
- `money (recovered) = min(stake, round(lockedDays * stake / daysInMonth))`
- `atRisk = stake - money`
- Approving the proof that crosses the target **locks the day** → ledger row `status='locked'`, fires celebration with the slice amount.
- Tokens fund **redemption challenges** (rescue an at-risk day by hitting 2× target).
- `money_model` is a per-contract enum: `all-or-nothing` (default) or `pro-rata`.

Defaults (tweakable per contract): `stake = $1000`, `dailyTarget = 15 pts`, `daysInMonth = 30`.

Run lock/at-risk computation **server-side** (trigger on approve + nightly cron), never trust the client.

---

## 6. Daily rollover & timezone

- Store each user's IANA `timezone` on `profiles`.
- A `pg_cron` job (or Vercel Cron → Edge Function) runs hourly; for users whose local time just passed midnight it: (a) creates that day's `submissions` rows as `todo` for each active goal, and (b) marks the previous day's unlocked slices as `at_risk`/`lost` in the ledger.
- At month end (`period_end`), unrecovered `at_risk` becomes permanently lost; start a new contract period.

---

## 7. Build order (suggested)

1. Supabase project + run `supabase_schema.sql` + enable Google + Realtime + create `proofs` bucket.
2. Next.js scaffold + `@supabase/ssr` auth + middleware + `/login` + `/auth/callback`.
3. Profiles + Setup screen (contract + goal/micro CRUD).
4. Today screen (ring, goals, proof sheet → Storage upload → submission insert).
5. Monitor screen (grouped pending) + approve/reject + ledger writes (trigger).
6. Realtime wiring + celebration.
7. Vault + Stats (read models / views).
8. Pairing/invites (invite code or link to set your verifier).
9. Daily rollover cron + month reset.
10. PWA manifest, polish, ship.

See `supabase_schema.sql` for tables, RLS, triggers, and storage policies, and `README.md` for env vars and local setup.
