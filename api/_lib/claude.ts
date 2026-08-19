import type { MessageParam, TextBlock, ToolUseBlock, Tool } from '@anthropic-ai/sdk/resources/messages'
import { tools as toolDefs } from './tools/schemas.js'
import { executeTool, type UiEvent } from './tools/executors.js'
import { SYSTEM_PROMPT, buildStateBlock } from './contextAssembly.js'
import { getAnthropicClient as getClient, MODEL } from './anthropicClient.js'

const MAX_TOOL_ITERATIONS = 6
const MAX_TOKENS = 4096

// Cache breakpoint on the last tool definition caches the (identical, large)
// tool schema set across requests; a second breakpoint on the system prompt
// text block extends that cached prefix through the system instructions too.
// Both are static across every request — only the state block injected into
// the new user message (see contextAssembly.buildStateBlock) varies.
function cachedTools(): Tool[] {
  return toolDefs.map((t, i) => (i === toolDefs.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t))
}

/**
 * Returns a copy with a cache breakpoint on the last content block of the
 * last message. Used at two points: once, permanently, on the boundary
 * between replayed history and this new turn (so a quick follow-up message
 * within the cache window reuses the whole prior conversation instead of
 * reprocessing it fresh); and again, freshly each loop iteration, on the
 * growing tail within a multi-step tool-use turn.
 */
function withCacheBreakpoint(msgs: MessageParam[]): MessageParam[] {
  if (msgs.length === 0) return msgs
  const last = msgs[msgs.length - 1]
  if (!Array.isArray(last.content) || last.content.length === 0) return msgs
  const lastBlock = last.content[last.content.length - 1]
  if (lastBlock.type === 'thinking' || lastBlock.type === 'redacted_thinking') return msgs
  const content = [...last.content]
  content[content.length - 1] = { ...lastBlock, cache_control: { type: 'ephemeral' } }
  return [...msgs.slice(0, -1), { ...last, content }]
}

export interface ChatTurnResult {
  replyText: string
  uiEvents: UiEvent[]
  /** Assistant + tool-result turns produced this call, to persist alongside the incoming user turn. */
  newMessages: MessageParam[]
}

export async function runChatTurn(
  history: MessageParam[],
  userText: string,
  currentPage?: string,
  onDelta?: (text: string) => void,
): Promise<ChatTurnResult> {
  const stateBlock = await buildStateBlock({ currentPage })

  const userMessage: MessageParam = {
    role: 'user',
    content: [
      { type: 'text', text: `[Current state — not written by her]\n${stateBlock}` },
      { type: 'text', text: userText },
    ],
  }

  const messages: MessageParam[] = [...withCacheBreakpoint(history), userMessage]
  const newMessages: MessageParam[] = [userMessage]
  const uiEvents: UiEvent[] = []
  let replyText = ''
  // True unless the loop ends via its own `break` (a genuine non-tool-use
  // stop). If we run out of iterations instead, the last thing said was
  // whatever narration text happened to precede that iteration's tool
  // call — not a real final answer — so it must never be trusted as one.
  let hitIterationCap = true

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const stream = getClient().messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: cachedTools(),
      messages: withCacheBreakpoint(messages),
    })
    if (onDelta) stream.on('text', (delta) => onDelta(delta))
    const response = await stream.finalMessage()

    const assistantMessage: MessageParam = { role: 'assistant', content: response.content }
    messages.push(assistantMessage)
    newMessages.push(assistantMessage)

    const textBlocks = response.content.filter((b): b is TextBlock => b.type === 'text')
    if (textBlocks.length > 0) {
      replyText = textBlocks.map((b) => b.text).join('\n\n')
    }

    const toolUseBlocks = response.content.filter((b): b is ToolUseBlock => b.type === 'tool_use')
    if (response.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
      hitIterationCap = false
      break
    }

    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        const result = await executeTool(block.name, block.input)
        uiEvents.push(...result.uiEvents)
        return {
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: JSON.stringify(result.toolResultContent),
        }
      }),
    )

    const toolResultMessage: MessageParam = { role: 'user', content: toolResults }
    messages.push(toolResultMessage)
    newMessages.push(toolResultMessage)
  }

  // Hitting MAX_TOOL_ITERATIONS means the loop never reached a genuine
  // non-tool-use stop — replyText at this point, if set at all, is just
  // leftover narration from before the last tool call, not a real
  // acknowledgement of what that call actually did. Force one more call
  // with no tools offered so it can't do anything but actually answer in
  // text, and always let it overwrite replyText rather than only filling it
  // when empty.
  if (hitIterationCap || !replyText) {
    const finalStream = getClient().messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system: [
        {
          type: 'text',
          text: `${SYSTEM_PROMPT}\n\nYou are out of tool calls for this turn and cannot call any more right now. If something is still incomplete, say so plainly (e.g. "I wasn't able to finish that — ask me again and I'll pick it up") instead of promising to do it "now." Never imply or claim something was done, or is being done, if it wasn't.`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: withCacheBreakpoint(messages),
    })
    if (onDelta) finalStream.on('text', (delta) => onDelta(delta))
    const finalResponse = await finalStream.finalMessage()
    const assistantMessage: MessageParam = { role: 'assistant', content: finalResponse.content }
    messages.push(assistantMessage)
    newMessages.push(assistantMessage)
    const textBlocks = finalResponse.content.filter((b): b is TextBlock => b.type === 'text')
    replyText = textBlocks.map((b) => b.text).join('\n\n') || "I wasn't able to finish that — try asking again and I'll pick it up."
    if (onDelta && textBlocks.length === 0) onDelta(replyText)
  }

  return { replyText, uiEvents, newMessages }
}
