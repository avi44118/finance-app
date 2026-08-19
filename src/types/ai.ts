// This app has no orb, no proactive suggestions, no celebration toasts —
// just the persistent bar and a confirmation card, so this is the only
// event type it needs (mirrors api/_lib/tools/executors.ts's UiEvent).
export type UiEvent = { type: 'show_confirmation_card'; pending_action_id: string; tool_name: string; summary: string }

export interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  isError?: boolean
}

export interface PendingActionCard {
  pendingActionId: string
  toolName: string
  summary: string
}
