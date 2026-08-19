import Anthropic from '@anthropic-ai/sdk'

// Sonnet 5 for the chat/tool-calling loop — it has to follow a strict
// confirm-then-apply contract across a dozen-plus tools, and give a real
// narrative read on a month of spending, so it isn't worth downgrading.
export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'

let cachedClient: Anthropic | null = null
export function getAnthropicClient(): Anthropic {
  if (cachedClient) return cachedClient
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  cachedClient = new Anthropic({ apiKey })
  return cachedClient
}
