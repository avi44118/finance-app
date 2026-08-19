-- One row per CSV upload or paste-text ingestion. This *is* the
-- confirm-before-apply staging area for bulk imports — parse writes a
-- pending_confirmation row and a summary, confirming commits it to
-- transactions below.
create table import_batches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  source text not null check (source in ('csv_checking', 'csv_credit', 'paste')),
  raw_input text not null,
  parsed_count int not null default 0,
  total_amount_cents bigint not null default 0,
  status text not null default 'pending_confirmation' check (status in ('pending_confirmation', 'committed', 'discarded')),
  summary text,
  created_at timestamptz not null default now(),
  committed_at timestamptz
);
alter table import_batches enable row level security;

-- The normalized ledger every page and every AI tool reads from, regardless
-- of whether a row came from a CSV, a pasted transaction list, or a typed
-- cash entry.
create table transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  account_type text not null check (account_type in ('checking', 'credit', 'cash')), -- 'cash' = manual/cash entries with no linked account — shown in combined view only, never a checking/credit drill-down
  posted_date date not null,
  description text not null,
  merchant_normalized text not null,
  amount_cents bigint not null, -- signed: negative = outflow, positive = inflow
  category_id text,
  chase_category text, -- Chase's own auto-category, credit CSV only — a signal for categorize.ts, not the source of truth
  is_flagged_unusual boolean not null default false, -- excluded from average/pattern queries, still counts toward free-money-remaining (real money left the account)
  is_internal_transfer boolean not null default false, -- credit card payments etc. — excluded from both income and spending so they never double-count
  needs_review boolean not null default false, -- categorize.ts couldn't confidently match a category
  note text, -- context supplied conversationally, e.g. "one-time, back to school"
  source text not null check (source in ('csv', 'paste', 'manual', 'cash')),
  import_batch_id uuid references import_batches(id) on delete set null,
  fingerprint text not null,
  occurrence_index int not null default 1,
  archived_at timestamptz, -- set by the monthly rollup job; row is pruned in a later pass
  created_at timestamptz not null default now(),
  foreign key (profile_id, category_id) references categories(profile_id, id)
);
alter table transactions enable row level security;

-- The whole duplicate-detection mechanism: a content-hash fingerprint
-- (account_type|posted_date|amount_cents|normalized description) plus an
-- occurrence counter, so a re-uploaded/overlapping CSV only inserts the
-- delta between what's already stored and what's in the new file, while two
-- genuinely separate identical-looking purchases can both still land.
create unique index transactions_fingerprint_occurrence on transactions (profile_id, fingerprint, occurrence_index);
create index transactions_profile_date on transactions (profile_id, posted_date desc) where archived_at is null;
create index transactions_needs_review on transactions (profile_id) where needs_review = true;
