# Finance Awareness

A private financial-awareness app — not a budget enforcer or transaction manager, but an AI companion that understands the story behind your spending: irregular income, a monthly Chase CSV upload, cash and context supplied conversationally, and one always-visible number: **free money remaining this month**.

Mirrors the architecture of its sibling app `avi44118/zeesy-health-app` — React + Vite + TypeScript + Tailwind frontend, Vercel serverless `/api/*` functions holding the Supabase service-role key and Anthropic key server-side only, Supabase Postgres, one shared-passphrase login (no per-user accounts), Claude Sonnet 5 with a confirm-before-apply tool-use loop, installable as an iPhone PWA.

## Setup

1. `npm install`
2. Create a Supabase project, run the migrations in `supabase/migrations/` in order via the SQL editor.
3. Copy `.env.example` to `.env` and fill in the values (see comments in that file for where each one comes from).
4. `npm run dev` (runs `vercel dev`, which serves both the Vite frontend and the `/api` functions).

## Deploy

Connect this repo to a new Vercel project, set the same environment variables there, deploy.
