-- Written by the monthly rollup job (api/rollup.ts) for anything older than
-- "current month + last 3" once its raw transactions are archived/pruned.
-- ai_notes is a real generated narrative, not just aggregated numbers — it's
-- the only thing that carries the qualitative "story" of a month forward
-- once the transaction rows themselves are gone.
create table monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  month date not null, -- first-of-month
  total_income_cents bigint not null,
  total_spending_cents bigint not null,
  category_breakdown jsonb not null, -- {category_id: {total_cents, txn_count}, ...}
  fixed_bills_total_cents bigint not null,
  free_money_remaining_cents bigint not null,
  flagged_transactions jsonb not null default '[]', -- verbatim [{date, description, amount_cents, category_id, note}]
  ai_notes text not null,
  transaction_count int not null,
  compacted_at timestamptz not null default now(),
  unique (profile_id, month)
);
alter table monthly_summaries enable row level security;
