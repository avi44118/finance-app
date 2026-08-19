import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '@/lib/apiClient'
import type { DisplayMessage, PendingActionCard, UiEvent } from '@/types/ai'
import { AICoachContext, type AICoachContextValue } from './aiCoachContext'

let idCounter = 0
function nextId() {
  idCounter += 1
  return `m${idCounter}`
}

export function AICoachProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [isThinking, setIsThinking] = useState(false)
  // Distinct from isThinking, which flips off as soon as visible text starts
  // streaming in (cosmetic). isBusy stays true for the whole turn, including
  // tool execution and persistence after text appears, and is what actually
  // gates a new send — this app has exactly one AI surface (the bottom bar,
  // no orb, no isolated threads), so a plain ref is enough here.
  const [isBusy, setIsBusy] = useState(false)
  const busyRef = useRef(false)
  const [currentPage, setCurrentPage] = useState('home')
  const [pendingAction, setPendingAction] = useState<PendingActionCard | null>(null)

  const handleUiEvents = useCallback((events: UiEvent[]) => {
    for (const event of events) {
      if (event.type === 'show_confirmation_card') {
        setPendingAction({ pendingActionId: event.pending_action_id, toolName: event.tool_name, summary: event.summary })
      }
    }
  }, [])

  const sendMessage = useCallback(
    async (text: string): Promise<string | undefined> => {
      const trimmed = text.trim()
      if (!trimmed || busyRef.current) return undefined
      busyRef.current = true
      setIsBusy(true)

      setMessages((prev) => [...prev, { id: nextId(), role: 'user', text: trimmed }])
      setIsThinking(true)

      const assistantId = nextId()
      let started = false

      try {
        const result = await api.postStream<{ reply: string; ui_events: UiEvent[] }>(
          '/ai?action=chat',
          { message: trimmed, currentPage },
          (delta) => {
            if (!started) {
              started = true
              setIsThinking(false)
              setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', text: delta }])
            } else {
              setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + delta } : m)))
            }
          },
        )
        // Reconcile with the authoritative final text regardless of what
        // streamed — covers a present-but-empty text block (no delta ever
        // fires for it) so she never ends up with a stopped spinner and no
        // visible reply.
        setMessages((prev) =>
          prev.some((m) => m.id === assistantId)
            ? prev.map((m) => (m.id === assistantId ? { ...m, text: result.reply } : m))
            : [...prev, { id: assistantId, role: 'assistant', text: result.reply }],
        )
        handleUiEvents(result.ui_events ?? [])
        return result.reply
      } catch {
        if (!started) {
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: 'assistant', text: 'Something went wrong — try again in a moment.', isError: true },
          ])
        }
        return undefined
      } finally {
        setIsThinking(false)
        busyRef.current = false
        setIsBusy(false)
      }
    },
    [currentPage, handleUiEvents],
  )

  const confirmPendingAction = useCallback(async () => {
    if (!pendingAction) return
    const { pendingActionId } = pendingAction
    setPendingAction(null)
    try {
      const res = await api.post<{ ui_events: UiEvent[] }>('/ai?action=confirm-action', { pending_action_id: pendingActionId })
      handleUiEvents(res.ui_events ?? [])
    } catch {
      setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text: "Couldn't apply that — try again?", isError: true }])
    }
  }, [pendingAction, handleUiEvents])

  const cancelPendingAction = useCallback(async () => {
    if (!pendingAction) return
    const { pendingActionId } = pendingAction
    setPendingAction(null)
    await api.post('/ai?action=confirm-action', { pending_action_id: pendingActionId, cancel: true }).catch(() => {})
  }, [pendingAction])

  const value = useMemo<AICoachContextValue>(
    () => ({
      messages,
      isThinking,
      isBusy,
      currentPage,
      setCurrentPage,
      sendMessage,
      pendingAction,
      confirmPendingAction,
      cancelPendingAction,
      handleUiEvents,
    }),
    [messages, isThinking, isBusy, currentPage, sendMessage, pendingAction, confirmPendingAction, cancelPendingAction, handleUiEvents],
  )

  return <AICoachContext.Provider value={value}>{children}</AICoachContext.Provider>
}
