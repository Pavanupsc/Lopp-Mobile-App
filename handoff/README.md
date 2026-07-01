# Loop

Stakes-based accountability app. Put a (symbolic) monthly stake on the line, earn it back daily by hitting a points target — but every completion must be **verified by another person** via submitted proof.

> **v1 scope:** mobile-web (PWA) on Vercel + Supabase. Google sign-in. Symbolic money only (we track the number — no payments, no escrow). See `handoff/PRODUCTION_HANDOFF.md` for the full spec and `handoff/supabase_schema.sql` for the database.

## Reference prototype
`Loop.dc.html` (open in a browser) is the **design + interaction reference** — match its screens, copy, colors, and motion. It is not the production code; it stores state in `localStorage` and uses demo accounts. Demo logins use password `loop`: **You** (verified by Priya; verifies Alex, Sam, Priya), **Alex**, **Sam**, **Priya**.

## Stack
- Next.js (App Router) + TypeScript on Vercel
- Supabase: Postgres + Auth (Google) + Storage + Realtime
- `@supabase/ssr` (cookie auth) + `@supabase/supabase-js`
- TanStack Query (or RSC + server actions)
- Ships as an installable PWA

## Getting started
```bash
git clone <repo> && cd loop
cp .env.local.example .env.local        # fill in the values below
npm install
npm run dev                              # http://localhost:3000
```

### Environment variables
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=               # server-only (cron / edge functions); never expose
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### Supabase setup
1. Create a Supabase project.
2. Run `handoff/supabase_schema.sql` (paste into the SQL editor, or `supabase db push` as `supabase/migrations/0001_init.sql`).
3. **Auth → Providers → Google**: enable it, add your Google OAuth client ID/secret, and add redirect URLs: `http://localhost:3000/auth/callback`, your Vercel production URL, and `*.vercel.app` preview pattern.
4. **Storage**: create a **private** bucket named `proofs` (the schema adds its RLS policies).
5. **Database → Replication**: confirm Realtime is on for `submissions` and `ledger` (the schema adds them to the publication).
6. Schedule the daily rollover job (pg_cron or Vercel Cron → Edge Function) — see the handoff doc §6.

### Deploy (Vercel)
- Import the repo, set the env vars (Production + Preview), deploy.
- Add the deployed URL to the Supabase Auth redirect allow-list.

## Data model (one-liner)
`profiles` ⟶ `pairs` (verifier→subject edges, one active verifier per subject, a verifier has many subjects) · `contracts` (stake/target/period) · `goals` (+micros) · `submissions` (daily instance + proof + review) · `ledger` (daily symbolic slice outcome). Full DDL + RLS + triggers in `handoff/supabase_schema.sql`.

## Screen → route map
| Prototype screen | Route | Notes |
|---|---|---|
| Login | `/login` | Google OAuth; `/auth/callback` exchanges code |
| Today | `/today` | ring, goals, proof sheet → Storage upload + submission insert |
| Vault | `/vault` | recovered vs at-risk, payout history (ledger) |
| Stats | `/stats` | calendar, level, consistency, loop diagram, badges |
| Setup | `/setup` | contract + goal/micro CRUD, loop wiring |
| Monitor | `/monitor` | everyone you verify, grouped; approve/reject |

(Render this table as a list if your viewer doesn't do Markdown tables.)

## Definition of done (v1)
- Real Google auth; profile auto-created on first sign-in.
- A user can set a contract, create goals/micros, submit proof (photo/oath/link).
- Their verifier sees pending proof **live** and can approve/reject with a note.
- Approving past the daily target locks the slice; Vault/Stats reflect real data.
- Invite flow to set your verifier (code or link).
- Daily rollover + month reset run on schedule.
- Installable PWA, works on mobile browsers.
- All access enforced by RLS (a user only ever sees their own data + their loop).
