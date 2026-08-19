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

export const useCategories = () => useApiResource<Category[]>('/categories')
export const useRecurringBills = () => useApiResource<RecurringBill[]>('/bills')
export const useSettings = () => useApiResource<Settings>('/settings')
