import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useSettings, useRecurringBills } from '@/hooks/data'
import { api } from '@/lib/apiClient'
import { centsToDisplay } from '@/lib/money'

function dollarsToCents(v: string): number | null {
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

function IncomeSection() {
  const { data: settings, refetch } = useSettings()
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (settings) setValue(settings.rough_monthly_income_cents ? (settings.rough_monthly_income_cents / 100).toFixed(2) : '')
  }, [settings])

  const save = async () => {
    const cents = value.trim() === '' ? null : dollarsToCents(value)
    setSaving(true)
    try {
      await api.patch('/settings', { rough_monthly_income_cents: cents })
      refetch()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-ink-muted">Rough monthly income</h2>
      <p className="mb-3 text-xs text-ink-faint">A manual fallback estimate only — the real numbers everywhere else always come from your actual logged income.</p>
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 4500"
          className="min-w-0 flex-1 rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-gold-500"
        />
        <Button onClick={save} disabled={saving} size="md">
          Save
        </Button>
      </div>
    </Card>
  )
}

function BillsSection() {
  const { data: bills, refetch } = useRecurringBills()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDay, setDueDay] = useState('')
  const [saving, setSaving] = useState(false)

  const addBill = async () => {
    const cents = dollarsToCents(amount)
    if (!name.trim() || cents === null) return
    setSaving(true)
    try {
      await api.post('/bills', { name: name.trim(), amount_cents: cents, due_day: dueDay ? Number(dueDay) : undefined })
      setName('')
      setAmount('')
      setDueDay('')
      refetch()
    } finally {
      setSaving(false)
    }
  }

  const removeBill = async (id: string) => {
    await api.delete(`/bills?id=${id}`)
    refetch()
  }

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-ink-muted">Recurring bills</h2>
      <p className="mb-3 text-xs text-ink-faint">Only for things that don't reliably show up in your Chase export — cash rent, a babysitter. A bill Chase already sees shouldn't go here, or it gets subtracted twice.</p>
      <div className="mb-3 space-y-2">
        {bills?.length === 0 && <p className="text-sm text-ink-faint">No recurring bills yet.</p>}
        {bills?.map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded-2xl border border-border px-3 py-2 text-sm">
            <span className="text-ink">
              {b.name}
              {b.due_day ? <span className="text-ink-faint"> · due day {b.due_day}</span> : null}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-ink-muted">{centsToDisplay(b.amount_cents)}</span>
              <button type="button" onClick={() => removeBill(b.id)} className="text-ink-faint hover:text-red-400">
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. rent)"
          className="min-w-0 flex-1 rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-gold-500"
        />
        <input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          className="w-24 rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-gold-500"
        />
        <input
          type="number"
          inputMode="numeric"
          value={dueDay}
          onChange={(e) => setDueDay(e.target.value)}
          placeholder="Due day"
          className="w-20 rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-gold-500"
        />
      </div>
      <Button variant="secondary" size="sm" onClick={addBill} disabled={saving} className="mt-2 w-full">
        + Add bill
      </Button>
    </Card>
  )
}

export default function Settings() {
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-extrabold text-ink">Settings</h1>
      <IncomeSection />
      <BillsSection />
      <p className="px-1 text-xs text-ink-faint">Everything else — categories, one-time flags, corrections — happens through conversation with your coach.</p>
    </div>
  )
}
