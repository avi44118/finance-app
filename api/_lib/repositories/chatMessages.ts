import { getSupabaseAdmin, getProfileId } from '../supabase.js'

export interface StoredMessage {
  role: 'user' | 'assistant'
  content: unknown
  page_context?: string | null
}

// Every message in this window gets replayed as real input tokens on every
// single chat call — kept smaller than "remembers everything" implies
// because get_financial_context already exists for the AI to pull older
// history/summaries on demand instead of it being stuffed into every request.
const HISTORY_WINDOW = 16

/** True for a message whose content is purely tool_result blocks — the user-role "reply" half of a tool-use exchange, never a real typed turn. */
function isToolResultMessage(m: StoredMessage): boolean {
  return Array.isArray(m.content) && m.content.length > 0 && m.content.every((b) => (b as { type?: string })?.type === 'tool_result')
}

type IdBlock = { type?: string; id?: string; tool_use_id?: string }

function toolUseIds(m: StoredMessage): string[] {
  if (!Array.isArray(m.content)) return []
  return (m.content as IdBlock[]).filter((b) => b.type === 'tool_use' && b.id).map((b) => b.id as string)
}

function toolResultIds(m: StoredMessage): string[] {
  if (!Array.isArray(m.content)) return []
  return (m.content as IdBlock[]).filter((b) => b.type === 'tool_result' && b.tool_use_id).map((b) => b.tool_use_id as string)
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((id) => setB.has(id))
}

/**
 * Drops any tool_use message whose tool_result isn't the very next message
 * with an exactly matching id set (and any now-orphaned tool_result left
 * behind by that) — the Anthropic API rejects the whole request outright if
 * one is missing. Repairs on every read so a corrupted row can never sit in
 * the middle of the table and permanently break every future chat call that
 * includes it in its fetch window.
 */
function repairToolPairing(messages: StoredMessage[]): StoredMessage[] {
  const result: StoredMessage[] = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    const useIds = toolUseIds(m)
    if (useIds.length > 0) {
      const next = messages[i + 1]
      if (next && sameIdSet(useIds, toolResultIds(next))) {
        result.push(m, next)
        i++
      }
      continue
    }
    if (toolResultIds(m).length > 0) continue // orphaned — its tool_use wasn't kept
    result.push(m)
  }
  return result
}

/**
 * Most recent messages, oldest-first, ready to replay into the Claude
 * request. A flat "last N rows" cut can land mid tool-use-exchange — fetches
 * extra headroom, repairs any broken tool-use/tool-result pairing anywhere
 * in that window, then trims from the front until the window starts on a
 * genuine turn boundary instead of an orphaned tool_result.
 */
export async function getRecentMessages(): Promise<StoredMessage[]> {
  const profile_id = await getProfileId()
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content, page_context')
    .eq('profile_id', profile_id)
    .order('seq', { ascending: false })
    .limit(HISTORY_WINDOW * 2)
  if (error) throw new Error(error.message)

  const oldestFirst = repairToolPairing((data ?? []).reverse() as StoredMessage[])
  let start = Math.max(0, oldestFirst.length - HISTORY_WINDOW)
  while (start < oldestFirst.length && isToolResultMessage(oldestFirst[start])) start++
  return oldestFirst.slice(start)
}

export async function appendMessages(messages: StoredMessage[]): Promise<void> {
  if (messages.length === 0) return
  const profile_id = await getProfileId()
  const supabase = getSupabaseAdmin()
  const rows = messages.map((m) => ({
    profile_id,
    role: m.role,
    content: m.content,
    page_context: m.page_context ?? null,
  }))
  const { error } = await supabase.from('chat_messages').insert(rows)
  if (error) throw new Error(error.message)
}
