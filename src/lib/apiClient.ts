class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error ?? `Request to ${path} failed (${res.status})`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/**
 * Reads a newline-delimited-JSON streaming response (see api/ai.ts's
 * handleChat), calling onDelta as {"type":"delta"} lines arrive so the
 * caller can render text as it's actually generated instead of waiting for
 * the whole response. Resolves with the final {"type":"done"} payload.
 */
async function requestStream<T>(path: string, body: unknown, onDelta: (text: string) => void): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok || !res.body) {
    const parsed = await res.json().catch(() => ({}))
    throw new ApiError(res.status, parsed.error ?? `Request to ${path} failed (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let done: T | undefined

  try {
    while (true) {
      const { done: streamDone, value } = await reader.read()
      if (streamDone) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        const event = JSON.parse(line) as { type: string; text?: string; error?: string } & Record<string, unknown>
        if (event.type === 'delta' && event.text) onDelta(event.text)
        else if (event.type === 'error') throw new ApiError(500, event.error ?? 'Something went wrong')
        else if (event.type === 'done') done = event as unknown as T
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (!done) throw new ApiError(500, 'Stream ended without a result')
  return done
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postStream: requestStream,
}

export { ApiError }
