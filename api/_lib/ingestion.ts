import { getSupabaseAdmin } from './supabase.js'
import { fingerprintRows, type FingerprintedRow, type NormalizedRow } from './csvParser.js'
import { matchCategory, recordRuleHit } from './categorize.js'
import { detectInternalTransfer } from './internalTransfer.js'

export interface PreparedRow extends FingerprintedRow {
  category_id: string
  needs_review: boolean
  match_source: 'rule_exact' | 'rule_fuzzy' | 'seed_keyword' | 'chase_category' | 'fallback'
  is_internal_transfer: boolean
}

/** Categorizes + flags every row. Read-only (no writes) — safe to call at both stage (preview) and commit time. */
export async function prepareRows(profileId: string, rows: NormalizedRow[]): Promise<PreparedRow[]> {
  const fingerprinted = fingerprintRows(rows)
  return Promise.all(
    fingerprinted.map(async (row) => {
      const match = await matchCategory(profileId, row.merchant_normalized, row.chase_category)
      return {
        ...row,
        category_id: match.category_id,
        needs_review: match.needs_review,
        match_source: match.match_source,
        is_internal_transfer: detectInternalTransfer(row.description, row.chase_type),
      }
    }),
  )
}

async function getExistingFingerprintCounts(profileId: string, fingerprints: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(fingerprints)]
  const counts = new Map<string, number>()
  if (unique.length === 0) return counts
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('transactions').select('fingerprint').eq('profile_id', profileId).in('fingerprint', unique)
  if (error) throw new Error(error.message)
  for (const row of data ?? []) counts.set(row.fingerprint as string, (counts.get(row.fingerprint as string) ?? 0) + 1)
  return counts
}

export interface DedupedRow extends PreparedRow {
  occurrence_index: number
}

/**
 * The whole duplicate-detection mechanism (see 0002_transactions.sql): for
 * each fingerprint, only the rows beyond however many already exist in the
 * DB are new. Handles both a straight re-upload (delta = 0, all skipped)
 * and an overlapping date-range export (only the not-yet-seen tail is new).
 */
export async function computeDedupeDelta(profileId: string, rows: PreparedRow[]): Promise<{ toInsert: DedupedRow[]; duplicateCount: number }> {
  const existingCounts = await getExistingFingerprintCounts(profileId, rows.map((r) => r.fingerprint))
  const seenInFile = new Map<string, number>()
  const toInsert: DedupedRow[] = []
  let duplicateCount = 0

  for (const row of rows) {
    const occurrence_index = (seenInFile.get(row.fingerprint) ?? 0) + 1
    seenInFile.set(row.fingerprint, occurrence_index)
    const alreadyStored = existingCounts.get(row.fingerprint) ?? 0
    if (occurrence_index <= alreadyStored) {
      duplicateCount++
      continue
    }
    toInsert.push({ ...row, occurrence_index })
  }
  return { toInsert, duplicateCount }
}

export async function insertTransactions(
  profileId: string,
  rows: DedupedRow[],
  source: 'csv' | 'paste',
  importBatchId: string | null,
): Promise<number> {
  if (rows.length === 0) return 0
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('transactions').insert(
    rows.map((r) => ({
      profile_id: profileId,
      account_type: r.account_type,
      posted_date: r.posted_date,
      description: r.description,
      merchant_normalized: r.merchant_normalized,
      amount_cents: r.amount_cents,
      category_id: r.category_id,
      chase_category: r.chase_category,
      is_internal_transfer: r.is_internal_transfer,
      needs_review: r.needs_review,
      source,
      import_batch_id: importBatchId,
      fingerprint: r.fingerprint,
      occurrence_index: r.occurrence_index,
    })),
  )
  if (error) throw new Error(error.message)

  // Bump hit_count for rows that matched a learned rule (not seed/chase-category/fallback matches — those aren't rule-backed).
  const ruleMatched = rows.filter((r) => r.match_source === 'rule_exact' || r.match_source === 'rule_fuzzy')
  await Promise.all(ruleMatched.map((r) => recordRuleHit(profileId, r.merchant_normalized)))

  return rows.length
}

export function centsToDisplay(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`
}

export function summarizeImport(source: string, toInsert: DedupedRow[], duplicateCount: number): string {
  const total = toInsert.reduce((sum, r) => sum + r.amount_cents, 0)
  const spendCount = toInsert.filter((r) => r.amount_cents < 0).length
  const incomeCount = toInsert.filter((r) => r.amount_cents > 0).length
  const needsReview = toInsert.filter((r) => r.needs_review).length
  const dupNote = duplicateCount > 0 ? ` (${duplicateCount} already imported, skipped)` : ''
  const reviewNote = needsReview > 0 ? ` ${needsReview} I wasn't sure how to categorize — flagged for your review.` : ''
  return `Found ${toInsert.length} new transaction${toInsert.length === 1 ? '' : 's'} from ${source}${dupNote} — ${spendCount} spend, ${incomeCount} income, net ${centsToDisplay(total)}.${reviewNote} Confirm to save?`
}
