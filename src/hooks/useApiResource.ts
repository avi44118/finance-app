import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/apiClient'

/** Thin GET wrapper matching every /api/* route's `{ data: T }` response shape. */
export function useApiResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (path === null) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    api
      .get<{ data: T }>(path)
      .then((res) => {
        if (!cancelled) {
          setData(res.data)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Request failed'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, reloadKey])

  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])
  return { data, loading, error, refetch }
}
