import { Card } from '@/components/ui/Card'
import { useMonthlyNarrative, useCategorySummary, useCategories, currentMonthString, previousMonthString } from '@/hooks/data'
import { centsToDisplay } from '@/lib/money'

export default function Insights() {
  const { data: narrative, loading } = useMonthlyNarrative()
  const month = currentMonthString()
  const prevMonth = previousMonthString(month)
  const { data: current } = useCategorySummary(month)
  const { data: prior } = useCategorySummary(prevMonth)
  const { data: categories } = useCategories()

  const labelFor = (id: string) => categories?.find((c) => c.id === id)?.label ?? id

  const trends = current
    ? Object.entries(current)
        .map(([id, t]) => ({ id, diff: t.total_cents - (prior?.[id]?.total_cents ?? 0), current: t.total_cents }))
        .filter((t) => Math.abs(t.diff) >= 500)
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
        .slice(0, 5)
    : []

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-extrabold text-ink">Insights</h1>

      <Card>
        <p className="mb-2 text-sm font-semibold text-ink-muted">This month, in words</p>
        {loading && !narrative ? (
          <p className="text-sm text-ink-faint">Reading through this month…</p>
        ) : (
          <p className="text-sm leading-relaxed text-ink">{narrative?.narrative}</p>
        )}
      </Card>

      {narrative && narrative.patterns.length > 0 && (
        <Card>
          <p className="mb-2 text-sm font-semibold text-ink-muted">Patterns noticed</p>
          <ul className="space-y-1.5">
            {narrative.patterns.map((p, i) => (
              <li key={i} className="text-sm text-ink">
                • {p}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <p className="mb-2 text-sm font-semibold text-ink-muted">Month over month</p>
        {trends.length === 0 ? (
          <p className="text-sm text-ink-faint">Nothing has moved much compared to last month yet.</p>
        ) : (
          <div className="space-y-2">
            {trends.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <span className="text-ink">{labelFor(t.id)}</span>
                <span className={t.diff > 0 ? 'text-red-400' : 'text-good'}>
                  {t.diff > 0 ? '+' : ''}
                  {centsToDisplay(t.diff)} vs last month
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
