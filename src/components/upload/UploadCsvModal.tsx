import { useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { api, ApiError } from '@/lib/apiClient'
import { centsToDisplay } from '@/lib/money'

type Step = 'pick' | 'staged' | 'done'

interface StagePreviewRow {
  posted_date: string
  description: string
  amount_cents: number
  category_id: string
  needs_review: boolean
}

interface StageResponse {
  import_batch_id: string
  summary: string
  preview: StagePreviewRow[]
}

export function UploadCsvModal({ open, onClose, onCommitted }: { open: boolean; onClose: () => void; onCommitted: () => void }) {
  const [source, setSource] = useState<'csv_checking' | 'csv_credit'>('csv_checking')
  const [step, setStep] = useState<Step>('pick')
  const [staged, setStaged] = useState<StageResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setStep('pick')
    setStaged(null)
    setError(null)
    setBusy(false)
  }

  const close = () => {
    reset()
    onClose()
  }

  const onFileChosen = async (file: File) => {
    setError(null)
    setBusy(true)
    try {
      const raw = await file.text()
      const res = await api.post<StageResponse>('/import?action=stage', { source, raw })
      setStaged(res)
      setStep('staged')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't read that file — is it a Chase CSV export?")
    } finally {
      setBusy(false)
    }
  }

  const commit = async () => {
    if (!staged) return
    setBusy(true)
    setError(null)
    try {
      await api.post('/import?action=commit', { import_batch_id: staged.import_batch_id })
      setStep('done')
      onCommitted()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save these transactions.')
    } finally {
      setBusy(false)
    }
  }

  const discard = async () => {
    if (staged) await api.post('/import?action=discard', { import_batch_id: staged.import_batch_id }).catch(() => {})
    close()
  }

  return (
    <Modal open={open} onClose={close}>
      <Card className="shadow-raised">
        {step === 'pick' && (
          <>
            <h2 className="mb-1 text-lg font-bold text-ink">Upload a Chase export</h2>
            <p className="mb-4 text-sm text-ink-muted">Download a CSV from Chase (Activity → Download), then choose it below.</p>
            <div className="mb-4">
              <SegmentedControl
                value={source}
                onChange={setSource}
                options={[
                  { value: 'csv_checking', label: 'Checking' },
                  { value: 'csv_credit', label: 'Credit card' },
                ]}
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onFileChosen(file)
                e.target.value = ''
              }}
            />
            {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
            <Button onClick={() => fileInputRef.current?.click()} disabled={busy} className="w-full">
              {busy ? 'Reading…' : 'Choose CSV file'}
            </Button>
          </>
        )}

        {step === 'staged' && staged && (
          <>
            <h2 className="mb-1 text-lg font-bold text-ink">Here's what I found</h2>
            <p className="mb-4 text-sm text-ink">{staged.summary}</p>
            {staged.preview.length > 0 && (
              <div className="mb-4 max-h-48 space-y-1 overflow-y-auto rounded-2xl border border-border p-2">
                {staged.preview.map((row, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="truncate text-ink-muted">
                      {row.posted_date} · {row.description}
                    </span>
                    <span className={row.amount_cents < 0 ? 'text-ink' : 'text-good'}>{centsToDisplay(row.amount_cents)}</span>
                  </div>
                ))}
              </div>
            )}
            {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
            <div className="flex gap-3">
              <Button variant="primary" onClick={commit} disabled={busy} className="flex-1">
                {busy ? 'Saving…' : 'Confirm & save'}
              </Button>
              <Button variant="secondary" onClick={discard} disabled={busy} className="flex-1">
                Discard
              </Button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <h2 className="mb-1 text-lg font-bold text-ink">Saved</h2>
            <p className="mb-4 text-sm text-ink-muted">Your numbers are updated.</p>
            <Button onClick={close} className="w-full">
              Done
            </Button>
          </>
        )}
      </Card>
    </Modal>
  )
}
