import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/apiClient'

export function useSession() {
  const [status, setStatus] = useState<'checking' | 'authed' | 'anon'>('checking')

  const check = useCallback(async () => {
    try {
      await api.get('/auth?action=session')
      setStatus('authed')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setStatus('anon')
      } else {
        // Network/server error — treat as anon so the login screen can retry,
        // rather than silently hanging on "checking" forever.
        setStatus('anon')
      }
    }
  }, [])

  useEffect(() => {
    check()
  }, [check])

  const login = useCallback(async (passphrase: string) => {
    await api.post('/auth?action=login', { passphrase })
    setStatus('authed')
  }, [])

  const logout = useCallback(async () => {
    await api.post('/auth?action=logout')
    setStatus('anon')
  }, [])

  return { status, login, logout }
}
