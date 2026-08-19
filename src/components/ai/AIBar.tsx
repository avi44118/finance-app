import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAICoach } from '@/hooks/useAICoach'

export function AIBar() {
  const { messages, sendMessage, isThinking, isBusy } = useAICoach()
  const [text, setText] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messages.length > 0) setPanelOpen(true)
  }, [messages.length])

  useEffect(() => {
    if (panelOpen) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isThinking, panelOpen])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || isBusy) return
    sendMessage(text)
    setText('')
  }

  return (
    <>
      {panelOpen && messages.length > 0 && (
        <div className="absolute inset-x-0 bottom-full border-t border-border bg-surface-raised/95 shadow-card backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center justify-between px-4 pt-2">
            <p className="text-xs font-semibold text-ink-faint">Your finance AI</p>
            <button type="button" onClick={() => setPanelOpen(false)} aria-label="Collapse conversation" className="text-xs text-ink-faint hover:text-ink">
              Hide ▾
            </button>
          </div>
          <div ref={scrollRef} className="mx-auto max-h-[42vh] max-w-xl space-y-2 overflow-y-auto px-4 py-2">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                    m.role === 'user' ? 'bg-gold-500 text-black' : m.isError ? 'bg-red-950 text-red-300' : 'bg-surface-sunken text-ink'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {isThinking && (
              <div className="flex justify-start">
                <p className="rounded-2xl bg-surface-sunken px-3.5 py-2 text-sm text-ink-faint">Thinking…</p>
              </div>
            )}
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="border-t border-border bg-surface-raised/95 backdrop-blur px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          {!panelOpen && messages.length > 0 && (
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              aria-label="Show conversation"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-ink-muted"
            >
              ▴
            </button>
          )}
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isThinking ? 'Thinking…' : 'Ask about your money, or tell me what happened…'}
            disabled={isBusy}
            className="min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-gold-500 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!text.trim() || isBusy}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-500 text-black disabled:bg-gold-200"
            aria-label="Send"
          >
            ↑
          </button>
        </div>
      </form>
    </>
  )
}
