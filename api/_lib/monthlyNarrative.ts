import { getSupabaseAdmin, getProfileId } from './supabase.js'
import { getAnthropicClient, MODEL } from './anthropicClient.js'
import { computeMonthFinancials, currentMonthString } from './freeMoney.js'
import { getTransactionsInRange, monthBounds } from './repositories/transactions.js'
import { listCategories } from './repositories/categories.js'
import { centsToDisplay } from './ingestion.js'

const NARRATIVE_SYSTEM_PROMPT = `You write the monthly financial narrative for a private awareness app shared by a married couple — not a budget app, not a lecture. Given real numbers for the current month and last month, respond with ONLY a JSON object, no markdown fences, no other text: {"narrative": "a warm, specific 2-4 sentence read on the month — what's actually going on, grounded in the real numbers given, never generic advice", "patterns": ["short specific observation", ...up to 4]}. If there isn't enough history for a real pattern yet, patterns can be an empty array — never invent one. Never use the words "budget," "should," or a lecturing tone.`

interface CategoryTotal {
  total_cents: number
  count: number
}

function categoryTotals(rows: Awaited<ReturnType<typeof getTransactionsInRange>>): Record<string, CategoryTotal> {
  const totals: Record<string, CategoryTotal> = {}
  for (const r of rows) {
    if (r.is_internal_transfer || r.is_flagged_unusual || r.amount_cents >= 0) continue
    const key = r.category_id ?? 'uncategorized'
    totals[key] ??= { total_cents: 0, count: 0 }
    totals[key].total_cents += Math.abs(r.amount_cents)
    totals[key].count += 1
  }
  return totals
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

export interface MonthlyNarrative {
  narrative: string
  patterns: string[]
}

async function buildNarrativeContext(profileId: string): Promise<string> {
  const month = currentMonthString()
  const prevMonth = shiftMonth(month, -1)
  const [financials, categories, { start, end }, { start: prevStart, end: prevEnd }] = await Promise.all([
    computeMonthFinancials(profileId, month, 'combined'),
    listCategories(profileId),
    Promise.resolve(monthBounds(month)),
    Promise.resolve(monthBounds(prevMonth)),
  ])
  const [currentRows, prevRows] = await Promise.all([
    getTransactionsInRange(profileId, start, end),
    getTransactionsInRange(profileId, prevStart, prevEnd),
  ])
  const currentTotals = categoryTotals(currentRows)
  const prevTotals = categoryTotals(prevRows)
  const labelFor = (id: string) => categories.find((c) => c.id === id)?.label ?? id

  const lines = [
    `This month (${month}): income ${centsToDisplay(financials.income_cents)}, spending ${centsToDisplay(financials.spending_cents)}, free money remaining ${centsToDisplay(financials.free_money_remaining_cents)}.`,
    Object.keys(currentTotals).length > 0
      ? `This month by category: ${Object.entries(currentTotals)
          .map(([id, t]) => `${labelFor(id)} ${centsToDisplay(t.total_cents)}`)
          .join(', ')}.`
      : 'No spending logged yet this month.',
    Object.keys(prevTotals).length > 0
      ? `Last month (${prevMonth}) by category: ${Object.entries(prevTotals)
          .map(([id, t]) => `${labelFor(id)} ${centsToDisplay(t.total_cents)}`)
          .join(', ')}.`
      : 'No data for last month.',
  ]
  return lines.join('\n')
}

async function generateNarrative(profileId: string): Promise<MonthlyNarrative | null> {
  const context = await buildNarrativeContext(profileId)
  const response = await getAnthropicClient().messages.create({
    model: MODEL,
    max_tokens: 400,
    system: NARRATIVE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: context }],
  })
  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') return null
  try {
    const parsed = JSON.parse(textBlock.text.trim()) as MonthlyNarrative
    if (typeof parsed.narrative !== 'string' || !Array.isArray(parsed.patterns)) return null
    return parsed
  } catch {
    return null
  }
}

/** Regenerates once per calendar day, cached on the settings row. */
export async function getMonthlyNarrative(): Promise<MonthlyNarrative> {
  const profileId = await getProfileId()
  const supabase = getSupabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)

  const { data: cached } = await supabase.from('settings').select('insights_narrative, insights_date').eq('profile_id', profileId).single()
  if (cached?.insights_date === today && cached.insights_narrative) return cached.insights_narrative as MonthlyNarrative

  try {
    const result = await generateNarrative(profileId)
    if (result) {
      await supabase.from('settings').update({ insights_narrative: result, insights_date: today }).eq('profile_id', profileId)
      return result
    }
  } catch {
    // fall through to cached/default below
  }

  return (cached?.insights_narrative as MonthlyNarrative | null) ?? { narrative: 'Not enough logged yet this month to write a real summary — upload a CSV or tell me about a few expenses.', patterns: [] }
}
