import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import {
  useCategorySummary,
  useCategories,
  useFlaggedTransactions,
  currentMonthString,
  previousMonthString,
  type AccountView,
  type Period,
} from '@/hooks/data'
import { centsToDisplay } from '@/lib/money'

const CATEGORY_ICONS: Record<string, string> = {
  food: '🍽️',
  home: '🏠',
  personal: '💅',
  kids: '🧸',
  transportation: '🚗',
  entertainment: '🎬',
  miscellaneous: '📎',
}

function Delta({ current, prior }: { current: number; prior: number }) {
  if (prior === 0) return null
  const diff = current - prior
  if (Math.abs(diff) < 100) return <span className="text-xs text-ink-faint">flat vs last month</span>
  const pct = Math.round((diff / prior) * 100)
  return (
    <span className={`text-xs ${diff > 0 ? 'text-red-400' : 'text-good'}`}>
      {diff > 0 ? '+' : ''}
      {centsToDisplay(diff)} ({pct > 0 ? '+' : ''}
      {pct}%) vs last month
    </span>
  )
}

export default function SpendingBreakdown() {
  const [period, setPeriod] = useState<Period>('month')
  const [view, setView] = useState<AccountView>('combined')
  const month = currentMonthString()
  const prevMonth = previousMonthString(month)

  const { data: totals } = useCategorySummary(month, view, period)
  const { data: prevTotals } = useCategorySummary(prevMonth, view, 'month')
  const { data: categories } = useCategories()
  const { data: flagged } = useFlaggedTransactions(month, view)

  const labelFor = (id: string) => categories?.find((c) => c.id === id)?.label ?? id
  const sorted = totals ? Object.entries(totals).sort(([, a], [, b]) => b.total_cents - a.total_cents) : []

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-extrabold text-ink">Spending Breakdown</h1>

      <div className="flex flex-wrap gap-2">
        <SegmentedControl
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'week', label: 'This week' },
            { value: 'month', label: 'This month' },
          ]}
        />
        <SegmentedControl
          value={view}
          onChange={setView}
          options={[
            { value: 'combined', label: 'Combined' },
            { value: 'checking', label: 'Checking' },
            { value: 'credit', label: 'Credit' },
          ]}
        />
      </div>

      <Card>
        {sorted.length === 0 ? (
          <p className="text-sm text-ink-faint">No spending in this period yet.</p>
        ) : (
          <div className="space-y-3">
            {sorted.map(([id, t]) => (
              <div key={id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-ink">
                    {CATEGORY_ICONS[id] ?? '•'} {labelFor(id)}
                    <span className="ml-1 text-xs text-ink-faint">({t.count})</span>
                  </p>
                  {period === 'month' && prevTotals && <Delta current={t.total_cents} prior={prevTotals[id]?.total_cents ?? 0} />}
                </div>
                <span className="font-semibold text-ink">{centsToDisplay(t.total_cents)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <p className="mb-2 text-sm font-semibold text-ink-muted">One-time / unusual</p>
        <p className="mb-3 text-xs text-ink-faint">Kept separate so they don't skew the averages and patterns above.</p>
        {!flagged || flagged.length === 0 ? (
          <p className="text-sm text-ink-faint">Nothing flagged this month.</p>
        ) : (
          <div className="space-y-2">
            {flagged.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <p className="truncate text-ink-muted">
                    {t.posted_date} · {t.description}
                  </p>
                  {t.note && <p className="truncate text-xs text-ink-faint">{t.note}</p>}
                </div>
                <span className="shrink-0 text-ink">{centsToDisplay(t.amount_cents)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
