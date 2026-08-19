import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { UploadCsvModal } from '@/components/upload/UploadCsvModal'
import { useMonthSummary, useSpendingPace, useCategorySummary, useRecentTransactions, useCategories, useHomeInsight } from '@/hooks/data'
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

export default function Home() {
  const [uploadOpen, setUploadOpen] = useState(false)
  const { data: summary, refetch: refetchSummary } = useMonthSummary()
  const { data: pace, refetch: refetchPace } = useSpendingPace()
  const { data: categoryTotals, refetch: refetchCategories } = useCategorySummary()
  const { data: recent, refetch: refetchRecent } = useRecentTransactions(5)
  const { data: categories } = useCategories()
  const { data: insight } = useHomeInsight()

  const refetchAll = () => {
    refetchSummary()
    refetchPace()
    refetchCategories()
    refetchRecent()
  }

  const labelFor = (id: string) => categories?.find((c) => c.id === id)?.label ?? id

  const sortedCategories = categoryTotals
    ? Object.entries(categoryTotals).sort(([, a], [, b]) => b.total_cents - a.total_cents)
    : []

  return (
    <div className="space-y-4 p-4">
      <Card className="text-center">
        <p className="text-sm font-semibold text-ink-muted">Free money remaining this month</p>
        <p className={`mt-1 text-5xl font-extrabold tracking-tight ${summary && summary.free_money_remaining_cents < 0 ? 'text-red-400' : 'text-gold-500'}`}>
          {summary ? centsToDisplay(summary.free_money_remaining_cents) : '—'}
        </p>
        {summary && (
          <p className="mt-2 text-xs text-ink-faint">
            {centsToDisplay(summary.income_cents)} in · {centsToDisplay(summary.fixed_bills_cents)} bills · {centsToDisplay(summary.spending_cents)} spent
          </p>
        )}
      </Card>

      {insight && (
        <Card className="border-gold-500/40">
          <p className="text-sm text-ink">✦ {insight.text}</p>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-ink-muted">Spending pace</p>
            {!pace || pace.verdict === 'insufficient_history' ? (
              <p className="mt-1 text-sm text-ink">Still building your history — check back after a couple more months.</p>
            ) : (
              <p className="mt-1 text-sm text-ink">
                {pace.verdict === 'on_track' ? 'On track' : 'Spending faster than usual'} — {centsToDisplay(pace.current_month_spending_cents)} so far vs.
                an average month of {centsToDisplay(pace.average_spending_cents ?? 0)}.
              </p>
            )}
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
              pace?.verdict === 'spending_fast' ? 'bg-red-950 text-red-300' : pace?.verdict === 'on_track' ? 'bg-gold-100 text-gold-700' : 'bg-surface-sunken text-ink-faint'
            }`}
          >
            {pace?.verdict === 'spending_fast' ? 'Fast' : pace?.verdict === 'on_track' ? 'On track' : '—'}
          </span>
        </div>
      </Card>

      <Card>
        <p className="mb-3 text-sm font-semibold text-ink-muted">Where it went this month</p>
        {sortedCategories.length === 0 ? (
          <p className="text-sm text-ink-faint">No spending logged yet this month.</p>
        ) : (
          <div className="space-y-2">
            {sortedCategories.map(([id, t]) => (
              <div key={id} className="flex items-center justify-between text-sm">
                <span className="text-ink">
                  {CATEGORY_ICONS[id] ?? '•'} {labelFor(id)}
                </span>
                <span className="font-semibold text-ink">{centsToDisplay(t.total_cents)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <p className="mb-3 text-sm font-semibold text-ink-muted">Last 5 transactions</p>
        {!recent || recent.length === 0 ? (
          <p className="text-sm text-ink-faint">Nothing logged yet — upload a CSV or tell your coach about a cash expense.</p>
        ) : (
          <div className="space-y-2">
            {recent.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <span className="truncate text-ink-muted">
                  {t.posted_date} · {t.description}
                </span>
                <span className={t.amount_cents < 0 ? 'text-ink' : 'text-good'}>{centsToDisplay(t.amount_cents)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Button onClick={() => setUploadOpen(true)} className="w-full">
        Upload CSV
      </Button>

      <UploadCsvModal open={uploadOpen} onClose={() => setUploadOpen(false)} onCommitted={refetchAll} />
    </div>
  )
}
