import { useContext } from 'react'
import { AICoachContext, type AICoachContextValue } from '@/components/ai/aiCoachContext'

export function useAICoach(): AICoachContextValue {
  const ctx = useContext(AICoachContext)
  if (!ctx) throw new Error('useAICoach must be used within AICoachProvider')
  return ctx
}
