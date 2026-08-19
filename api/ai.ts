import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { withAuth } from './_lib/handler.js'
import { runChatTurn } from './_lib/claude.js'
import { getRecentMessages, appendMessages } from './_lib/repositories/chatMessages.js'
import { getPendingAction, isActionable, resolvePendingAction } from './_lib/repositories/pendingActions.js'
import { executeTool } from './_lib/tools/executors.js'
import { getHomeInsight } from './_lib/homeInsight.js'
import { getMonthlyNarrative } from './_lib/monthlyNarrative.js'

// Streams as newline-delimited JSON so the reply flows in on the client as
// the model actually generates it, instead of waiting for the whole
// (possibly multi-tool-iteration) turn to finish before showing anything.
// {"type":"delta","text":"..."} per chunk, one final {"type":"done",...}.
async function handleChat(req: VercelRequest, res: VercelResponse) {
  const { message, currentPage } = req.body as { message?: string; currentPage?: string }
  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'message is required' })
    return
  }

  res.status(200)
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')

  try {
    const stored = await getRecentMessages()
    const history: MessageParam[] = stored.map((m) => ({ role: m.role, content: m.content as MessageParam['content'] }))

    const { replyText, uiEvents, newMessages } = await runChatTurn(history, message, currentPage, (delta) => {
      res.write(`${JSON.stringify({ type: 'delta', text: delta })}\n`)
    })

    // Generation already fully succeeded and streamed to her by this point —
    // a persistence hiccup here must never surface as a turn failure.
    // Best-effort only: log server-side and still send 'done' either way.
    try {
      await appendMessages(
        newMessages.map((m, i) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          page_context: i === 0 ? currentPage : undefined,
        })),
      )
    } catch (err) {
      console.error('failed to persist chat turn', err)
    }

    res.write(`${JSON.stringify({ type: 'done', reply: replyText, ui_events: uiEvents })}\n`)
  } catch (err) {
    console.error(err)
    res.write(`${JSON.stringify({ type: 'error', error: err instanceof Error ? err.message : 'internal error' })}\n`)
  } finally {
    res.end()
  }
}

async function handleConfirmAction(req: VercelRequest, res: VercelResponse) {
  const { pending_action_id, cancel } = req.body as { pending_action_id?: string; cancel?: boolean }
  if (!pending_action_id) {
    res.status(400).json({ error: 'pending_action_id is required' })
    return
  }

  const action = await getPendingAction(pending_action_id)
  if (!isActionable(action)) {
    res.status(409).json({ error: 'This action is no longer pending (already resolved or expired).' })
    return
  }

  if (cancel) {
    await resolvePendingAction(pending_action_id, 'cancelled')
    res.status(200).json({ status: 'cancelled' })
    return
  }

  const result = await executeTool(action.tool_name, { ...action.tool_input, confirm: true })
  await resolvePendingAction(pending_action_id, 'confirmed')

  res.status(200).json({ status: 'confirmed', result: result.toolResultContent, ui_events: result.uiEvents })
}

async function handleHomeInsight(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }
  const text = await getHomeInsight()
  res.status(200).json({ data: { text } })
}

async function handleMonthlyNarrative(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }
  const data = await getMonthlyNarrative()
  res.status(200).json({ data })
}

// Consolidated to stay under Vercel Hobby's serverless function count limit.
async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string | undefined
  if (action === 'home-insight') return handleHomeInsight(req, res)
  if (action === 'monthly-narrative') return handleMonthlyNarrative(req, res)

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }
  if (action === 'chat') return handleChat(req, res)
  if (action === 'confirm-action') return handleConfirmAction(req, res)
  res.status(400).json({ error: 'unknown action' })
}

export default withAuth(handler)
