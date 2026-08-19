import { getSupabaseAdmin, getProfileId } from './supabase.js'
import { getAnthropicClient, MODEL } from './anthropicClient.js'
import { computeMonthFinancials, currentMonthString } from './freeMoney.js'
import { computeSpendingPace } from './stats.js'
import { listRecentTransactions } from './repositories/transactions.js'
import { centsToDisplay } from './ingestion.js'

const INSIGHT_SYSTEM_PROMPT = `You write one short home-screen line for a private financial-awareness app shared by a married couple. Given real numbers about their current month, write exactly ONE short line (under 22 words) — specific to what's actually happening (a number, a pace, a category standing out), never a generic platitude like "keep saving!" No quotation marks, no emoji. If nothing notable stands out, a plain honest status line is fine ("On pace, nothing unusual this month"). Respond with only the line itself.`

async function buildInsightContext(profileId: string): Promise<string> {
  const month = currentMonthString()
  const [financials, pace, recent] = await Promise.all([
    computeMonthFinancials(profileId, month, 'combined'),
    computeSpendingPace(profileId, month),
    listRecentTransactions(profileId, 5),
  ])

  const lines = [
    `Free money remaining: ${centsToDisplay(financials.free_money_remaining_cents)}.`,
    `Income so far: ${centsToDisplay(financials.income_cents)}. Spending so far: ${centsToDisplay(financials.spending_cents)}.`,
    pace.verdict === 'insufficient_history'
      ? 'Not enough history yet to compare pace to an average month.'
      : `Pace: ${pace.verdict === 'spending_fast' ? 'spending faster than usual' : 'on track'} vs. an average month.`,
    recent.length > 0 ? `Most recent transaction: ${recent[0].description} ${centsToDisplay(recent[0].amount_cents)} on ${recent[0].posted_date}.` : 'No transactions logged yet.',
  ]
  return lines.join('\n')
}

async function generateInsight(profileId: string): Promise<string | null> {
  const context = await buildInsightContext(profileId)
  const response = await getAnthropicClient().messages.create({
    model: MODEL,
    max_tokens: 60,
    system: INSIGHT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: context }],
  })
  const textBlock = response.content.find((b) => b.type === 'text')
  return textBlock && textBlock.type === 'text' ? textBlock.text.trim().replace(/^"|"$/g, '') : null
}

/** Regenerates once per calendar day, cached on the settings row — Home calls this on every load but only actually hits Claude once a day. */
export async function getHomeInsight(): Promise<string> {
  const profileId = await getProfileId()
  const supabase = getSupabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)

  const { data: cached } = await supabase
    .from('settings')
    .select('home_insight_text, home_insight_date')
    .eq('profile_id', profileId)
    .single()
  if (cached?.home_insight_date === today && cached.home_insight_text) return cached.home_insight_text

  try {
    const text = await generateInsight(profileId)
    if (text) {
      await supabase.from('settings').update({ home_insight_text: text, home_insight_date: today }).eq('profile_id', profileId)
      return text
    }
  } catch {
    // fall through to cached/default below
  }

  return cached?.home_insight_text ?? "Upload your Chase export or tell me about a purchase to get started."
}
