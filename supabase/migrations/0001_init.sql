-- Every table below gets RLS enabled immediately with zero policies. The
-- backend only ever connects with the service_role key (api/_lib/supabase.ts),
-- which bypasses RLS regardless — so this costs nothing functionally, it
-- just default-denies the anon/authenticated roles this app never uses.
-- (Lesson carried over from the sibling health app, where this was retrofitted
-- after a Supabase Advisor scan — doing it from day one here instead.)

create extension if not exists pgcrypto;

create table profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;

-- One row, one household — rough_monthly_income_cents is a manual fallback
-- only ("rough monthly income" per the brief); the real month-by-month
-- income figure is computed from transactions, never stored here.
create table settings (
  profile_id uuid primary key references profiles(id) on delete cascade,
  rough_monthly_income_cents bigint,
  updated_at timestamptz not null default now()
);
alter table settings enable row level security;

-- Seeded with the 7 categories from the brief. Not a fixed set: the AI can
-- insert a new row (always through a confirmed tool call) when it notices a
-- genuine recurring pattern that doesn't fit any existing category — see
-- create_category in api/_lib/tools. `id` is a stable slug, not a uuid, so
-- it reads cleanly in code and in the AI's own tool calls.
create table categories (
  id text not null,
  profile_id uuid not null references profiles(id) on delete cascade,
  label text not null,
  sort_order int not null,
  source text not null default 'seed' check (source in ('seed', 'ai_created')),
  created_via text,
  created_at timestamptz not null default now(),
  primary key (profile_id, id)
);
alter table categories enable row level security;

-- Only for spend that does NOT reliably appear in the Chase CSV (cash rent,
-- babysitter). A bill that does show up in Chase is never added here — it
-- just flows through as a normal categorized transaction — otherwise the
-- free-money formula would subtract it twice.
create table recurring_bills (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  amount_cents bigint not null,
  due_day int,
  effective_start date not null default current_date,
  effective_end date,
  created_at timestamptz not null default now()
);
alter table recurring_bills enable row level security;
create index recurring_bills_active on recurring_bills (profile_id) where effective_end is null;

-- Full content-block history (not just display text) so a continued
-- conversation keeps tool-call/tool-result context, same as the health app.
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null,
  sequence bigint generated always as identity,
  created_at timestamptz not null default now()
);
alter table chat_messages enable row level security;
create index chat_messages_profile_seq on chat_messages (profile_id, sequence);

-- Confirm-before-apply staging for AI-initiated writes that need a "yes"
-- first (unusual-transaction flags, settings changes, new categories).
-- Import commits use their own import_batches staging table instead — see
-- 0002 — since that flow's confirmation is a bulk summary, not a single
-- tool call.
create table pending_actions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  tool_name text not null,
  tool_input jsonb not null,
  summary text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours')
);
alter table pending_actions enable row level security;
