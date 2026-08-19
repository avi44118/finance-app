import { useApiResource } from './useApiResource'
import type { Transaction, MonthFinancials, Category, RecurringBill, Settings } from '@/types/models'

export function currentMonthString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export type AccountView = 'combined' | 'checking' | 'credit'

export function useMonthSummary(month: string = currentMonthString(), view: AccountView = 'combined') {
  return useApiResource<MonthFinancials>(`/transactions?action=summary&month=${month}&view=${view}`)
}

export function useTransactions(month: string = currentMonthString(), view: AccountView = 'combined') {
  return useApiResource<Transaction[]>(`/transactions?action=list&month=${month}&view=${view}`)
}

export function useRecentTransactions(limit = 5) {
  return useApiResource<Transaction[]>(`/transactions?action=recent&limit=${limit}`)
}

export interface SpendingPace {
  current_month_spending_cents: number
  average_spending_cents: number | null
  months_counted: number
  day_of_month: number
  days_in_month: number
  verdict: 'on_track' | 'spending_fast' | 'insufficient_history'
}

export function useSpendingPace(month: string = currentMonthString()) {
  return useApiResource<SpendingPace>(`/transactions?action=pace&month=${month}`)
}

export type CategoryTotals = Record<string, { total_cents: number; count: number }>
export type Period = 'week' | 'month'

export function useCategorySummary(month: string = currentMonthString(), view: AccountView = 'combined', period: Period = 'month') {
  return useApiResource<CategoryTotals>(`/transactions?action=category-summary&month=${month}&view=${view}&period=${period}`)
}

export function useFlaggedTransactions(month: string = currentMonthString(), view: AccountView = 'combined') {
  return useApiResource<Transaction[]>(`/transactions?action=flagged&month=${month}&view=${view}`)
}

export function previousMonthString(month: string = currentMonthString()): string {
  const [y, m] = month.split('-').map(Number)
  const prevM = m === 1 ? 12 : m - 1
  const prevY = m === 1 ? y - 1 : y
  return `${prevY}-${String(prevM).padStart(2, '0')}`
}

export const useCategories = () => useApiResource<Category[]>('/categories')
export const useRecurringBills = () => useApiResource<RecurringBill[]>('/bills')
export const useSettings = () => useApiResource<Settings>('/settings')
export const useHomeInsight = () => useApiResource<{ text: string }>('/ai?action=home-insight')

export interface MonthlyNarrative {
  narrative: string
  patterns: string[]
}
export const useMonthlyNarrative = () => useApiResource<MonthlyNarrative>('/ai?action=monthly-narrative')
