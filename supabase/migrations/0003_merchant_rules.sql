create extension if not exists pg_trgm;

-- The category-learning mechanism. Matching priority (applied in
-- categorize.ts, not here): exact merchant_key hit -> trigram fuzzy hit ->
-- static seed keyword list -> transactions.chase_category -> miscellaneous.
-- A correction upserts this row (most-recent correction wins) and bumps
-- corrected_count so a merchant that keeps getting corrected can be
-- detected and always re-flagged for confirmation instead of auto-assigned.
create table merchant_category_rules (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  merchant_key text not null,
  category_id text not null,
  hit_count int not null default 1,
  corrected_count int not null default 0,
  source text not null default 'auto' check (source in ('auto', 'user_correction')),
  updated_at timestamptz not null default now(),
  unique (profile_id, merchant_key),
  foreign key (profile_id, category_id) references categories(profile_id, id)
);
alter table merchant_category_rules enable row level security;
create index merchant_rules_trgm on merchant_category_rules using gin (merchant_key gin_trgm_ops);
