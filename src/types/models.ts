export interface Transaction {
  id: string
  profile_id: string
  account_type: 'checking' | 'credit' | 'cash'
  posted_date: string
  description: string
  merchant_normalized: string
  amount_cents: number
  category_id: string | null
  chase_category: string | null
  is_flagged_unusual: boolean
  is_internal_transfer: boolean
  needs_review: boolean
  note: string | null
  source: 'csv' | 'paste' | 'manual' | 'cash'
  import_batch_id: string | null
  fingerprint: string
  occurrence_index: number
  archived_at: string | null
  created_at: string
}

export interface MonthFinancials {
  month: string
  view: 'combined' | 'checking' | 'credit'
  income_cents: number
  spending_cents: number
  fixed_bills_cents: number
  free_money_remaining_cents: number
  transaction_count: number
}

export interface Category {
  id: string
  profile_id: string
  label: string
  sort_order: number
  source: 'seed' | 'ai_created'
  created_via: string | null
  created_at: string
}

export interface RecurringBill {
  id: string
  profile_id: string
  name: string
  amount_cents: number
  due_day: number | null
  effective_start: string
  effective_end: string | null
  created_at: string
}

export interface Settings {
  profile_id: string
  rough_monthly_income_cents: number | null
  updated_at: string
}
