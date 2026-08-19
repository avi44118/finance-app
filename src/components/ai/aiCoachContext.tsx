import { createContext } from 'react'
import type { DisplayMessage, PendingActionCard, UiEvent } from '@/types/ai'

export interface AICoachContextValue {
  messages: DisplayMessage[]
  isThinking: boolean
  isBusy: boolean
  currentPage: string
  setCurrentPage: (page: string) => void
  sendMessage: (text: string) => Promise<string | undefined>
  pendingAction: PendingActionCard | null
  confirmPendingAction: () => Promise<void>
  cancelPendingAction: () => Promise<void>
  handleUiEvents: (events: UiEvent[]) => void
}

export const AICoachContext = createContext<AICoachContextValue | null>(null)
