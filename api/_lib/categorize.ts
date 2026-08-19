import { getSupabaseAdmin } from './supabase.js'

/**
 * Static starting heuristics — a rough first pass only. Real accuracy comes
 * from merchant_category_rules learning from corrections over time; this
 * list just gives new/unseen merchants a better-than-miscellaneous guess
 * before any corrections exist yet.
 */
const SEED_KEYWORDS: Array<{ category_id: string; patterns: RegExp[] }> = [
  {
    category_id: 'food',
    patterns: [
      /STOP ?& ?SHOP|SHOPRITE|WHOLE ?FOODS|TRADER JOE|WALMART GROCERY|KOSHER|SUPERMARKET|GROCERY/i,
      /PIZZA|RESTAURANT|DOORDASH|GRUBHUB|UBER ?EATS|INSTACART|BAKERY|DELI|CAFE/i,
    ],
  },
  {
    category_id: 'home',
    patterns: [
      /CON ?EDISON|PSE&G|PSEG|VERIZON|COMCAST|XFINITY|OPTIMUM|SPECTRUM/i,
      /RENT PAYMENT|MORTGAGE|HOME DEPOT|LOWES|ACE HARDWARE|BED BATH/i,
    ],
  },
  {
    category_id: 'personal',
    patterns: [/CVS|WALGREENS|RITE AID|SEPHORA|ULTA|PLANET FITNESS|\bGYM\b|SALON|BARBER/i],
  },
  {
    category_id: 'kids',
    patterns: [/TOYS ?R ?US|CARTERS|GYMBOREE|DAYCARE|BABYSIT|TUITION|SCHOOL/i],
  },
  {
    category_id: 'transportation',
    patterns: [/\bUBER\b(?! ?EATS)|\bLYFT\b|SHELL OIL|EXXON|CHEVRON|\bMTA\b|NJ ?TRANSIT|E-?ZPASS|PARKING/i],
  },
  {
    category_id: 'entertainment',
    patterns: [/NETFLIX|SPOTIFY|\bHULU\b|DISNEY\+|\bAMC\b|FANDANGO|YOUTUBE PREMIUM|APPLE\.COM\/BILL/i],
  },
]

/** Maps Chase's own credit-CSV `Category` column to our 7 categories, when nothing else matched first. */
const CHASE_CATEGORY_MAP: Record<string, string> = {
  groceries: 'food',
  'food & drink': 'food',
  gas: 'transportation',
  automotive: 'transportation',
  travel: 'transportation',
  'bills & utilities': 'home',
  home: 'home',
  'health & wellness': 'personal',
  shopping: 'personal',
  entertainment: 'entertainment',
  education: 'kids',
  'gifts & donations': 'miscellaneous',
  'professional services': 'miscellaneous',
  'fees & adjustments': 'miscellaneous',
}

export interface CategoryMatch {
  category_id: string
  needs_review: boolean
  match_source: 'rule_exact' | 'rule_fuzzy' | 'seed_keyword' | 'chase_category' | 'fallback'
}

/**
 * Matching priority: learned exact rule -> learned fuzzy rule -> static
 * keyword seed -> Chase's own category column -> miscellaneous+needs_review.
 * A learned rule (from a correction) always outranks the static heuristics
 * below it, since it reflects what this specific household actually meant.
 */
export async function matchCategory(profileId: string, merchantNormalized: string, chaseCategory: string | null): Promise<CategoryMatch> {
  const supabase = getSupabaseAdmin()

  const { data: ruleMatch } = (await supabase
    .rpc('find_merchant_category', { p_profile_id: profileId, p_merchant_key: merchantNormalized })
    .maybeSingle()) as { data: { category_id: string; match_type: string; score: number } | null }
  if (ruleMatch?.category_id) {
    return {
      category_id: ruleMatch.category_id,
      needs_review: false,
      match_source: ruleMatch.match_type === 'exact' ? 'rule_exact' : 'rule_fuzzy',
    }
  }

  for (const seed of SEED_KEYWORDS) {
    if (seed.patterns.some((re) => re.test(merchantNormalized))) {
      return { category_id: seed.category_id, needs_review: false, match_source: 'seed_keyword' }
    }
  }

  if (chaseCategory) {
    const mapped = CHASE_CATEGORY_MAP[chaseCategory.trim().toLowerCase()]
    if (mapped) return { category_id: mapped, needs_review: false, match_source: 'chase_category' }
  }

  return { category_id: 'miscellaneous', needs_review: true, match_source: 'fallback' }
}

/**
 * Records a correction: most-recent wins for this merchant going forward.
 * Does NOT rewrite other already-categorized transactions from the same
 * merchant — that's a separate, explicitly-confirmed bulk-apply step (see
 * the correct_transaction_category tool executor).
 */
export async function recordCorrection(profileId: string, merchantNormalized: string, categoryId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { data: existing } = await supabase
    .from('merchant_category_rules')
    .select('hit_count, corrected_count')
    .eq('profile_id', profileId)
    .eq('merchant_key', merchantNormalized)
    .maybeSingle()

  await supabase.from('merchant_category_rules').upsert(
    {
      profile_id: profileId,
      merchant_key: merchantNormalized,
      category_id: categoryId,
      source: 'user_correction',
      hit_count: (existing?.hit_count ?? 0) + 1,
      corrected_count: (existing?.corrected_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id,merchant_key' },
  )
}

/** Bumps hit_count on an existing rule when it's used again (no correction) — feeds the "needs re-confirmation" ratio check below. */
export async function recordRuleHit(profileId: string, merchantNormalized: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { data: existing } = await supabase
    .from('merchant_category_rules')
    .select('hit_count')
    .eq('profile_id', profileId)
    .eq('merchant_key', merchantNormalized)
    .maybeSingle()
  if (!existing) return // no learned rule for this merchant yet — nothing to bump (seed/chase-category matches aren't rule-backed)
  await supabase
    .from('merchant_category_rules')
    .update({ hit_count: existing.hit_count + 1 })
    .eq('profile_id', profileId)
    .eq('merchant_key', merchantNormalized)
}

/** A merchant corrected almost as often as it's auto-matched is one auto-assignment shouldn't trust confidently anymore. */
export function isUnreliableMerchant(hitCount: number, correctedCount: number): boolean {
  return hitCount >= 3 && correctedCount / hitCount >= 0.4
}
