# Finance Awareness

A private financial-awareness app — not a budget enforcer or transaction manager, but an AI companion that understands the story behind your spending: irregular income, a monthly Chase CSV upload, cash and context supplied conversationally, and one always-visible number: **free money remaining this month**.

Mirrors the architecture of its sibling app `avi44118/zeesy-health-app` — React + Vite + TypeScript + Tailwind frontend, Vercel serverless `/api/*` functions holding the Supabase service-role key and Anthropic key server-side only, Supabase Postgres, one shared-passphrase login (no per-user accounts), Claude Sonnet 5 with a confirm-before-apply tool-use loop, installable as an iPhone PWA.

## Setup

1. `npm install`
2. Create a Supabase project (separate from the health app's), run the migrations in `supabase/migrations/` in order via the SQL editor.
3. Copy `.env.example` to `.env` and fill in the values (see comments in that file for where each one comes from).
4. `npm run dev` (runs `vercel dev`, which serves both the Vite frontend and the `/api` functions).

## Deploy

Connect this repo to a new Vercel project, set the same environment variables there (Project Settings → Environment Variables), deploy. The monthly rollup cron (`vercel.json`) fires automatically once deployed — no extra setup needed beyond `CRON_SECRET`.

## What's built

All 13 phases of the implementation plan: CSV/paste ingestion with duplicate detection, category auto-assignment that learns from corrections, the free-money-remaining formula, the persistent AI bar with a confirm-before-apply tool loop, Home/Spending Breakdown/Insights/Settings pages, and the monthly archive/compaction rollup. See `/root/.claude/plans/twinkly-wishing-prism.md` in the build session for the full plan this was built from.

## Known open item

`api/_lib/csvParser.ts`'s column mapping is built against Chase's standard public export format (no real sample file was available while building) — the comments in that file flag exactly what to check against your first real upload if a column doesn't parse as expected.

## Testing checklist

- [ ] Log in with the passphrase
- [ ] Upload a real Chase checking CSV, confirm the preview looks right, save
- [ ] Upload a real Chase credit CSV — check whether purchase amounts show as spending correctly (the credit CSV's sign convention is the one unverified assumption, see above)
- [ ] Re-upload the same file — confirm it reports 0 new transactions (duplicate detection)
- [ ] Tell the AI bar "I paid X $Y cash today" — should log immediately, no confirmation
- [ ] Ask the AI to correct a transaction's category — should apply immediately and update Home/Spending Breakdown
- [ ] Add a recurring bill in Settings, confirm it subtracts from free money remaining
- [ ] Check Home's free-money number, pace indicator, and category summary all look right
- [ ] Check Spending Breakdown's week/month and checking/credit/combined toggles
- [ ] Check Insights loads a narrative (may take a few seconds on first load each day)
- [ ] On an iPhone: Add to Home Screen, confirm it opens full-screen without Safari chrome
