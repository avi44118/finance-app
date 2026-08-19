import { useState, type FormEvent, type ReactNode } from 'react'
import { useSession } from '@/hooks/useSession'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export function LoginGate({ children }: { children: ReactNode }) {
  const { status, login } = useSession()
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (status === 'checking') {
    return <div className="min-h-dvh bg-surface" />
  }

  if (status === 'anon') {
    const onSubmit = async (e: FormEvent) => {
      e.preventDefault()
      setError(null)
      setSubmitting(true)
      try {
        await login(passphrase)
      } catch {
        setError("That's not it — try again.")
      } finally {
        setSubmitting(false)
      }
    }

    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface p-6">
        <Card className="w-full max-w-sm">
          <h1 className="mb-1 text-xl font-extrabold text-ink">
            Finance <span className="text-gold-500">Awareness</span>
          </h1>
          <p className="mb-5 text-sm text-ink-muted">Enter the passphrase to continue.</p>
          <form onSubmit={onSubmit} className="space-y-3">
            <input
              type="password"
              autoFocus
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Passphrase"
              className="w-full rounded-2xl border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold-500"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" disabled={submitting || !passphrase} className="w-full">
              {submitting ? 'Checking…' : 'Enter'}
            </Button>
          </form>
        </Card>
      </div>
    )
  }

  return <>{children}</>
}
