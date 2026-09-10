const databaseURL = (import.meta.env.VITE_FIREBASE_DATABASE_URL ?? '').replace(/\/$/, '')
const LISTEN_POLL_MS = 1000

export function isFirebaseConfigured() {
  return databaseURL.length > 0
}

function urlFor(path: string) {
  const clean = path.replace(/^\/+|\/+$/g, '')
  return `${databaseURL}/${clean}.json`
}

function fetchInit(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      ...(init.headers as Record<string, string> | undefined),
    },
  }
}

export async function rtdbGet(path: string): Promise<{ data: unknown; etag: string | null }> {
  const response = await fetch(
    urlFor(path),
    fetchInit({
      headers: { 'X-Firebase-ETag': 'true' },
    }),
  )
  if (!response.ok) {
    throw new Error(`Firebase read failed (${response.status})`)
  }
  return {
    data: await response.json(),
    etag: response.headers.get('ETag'),
  }
}

export async function rtdbSet(path: string, data: unknown, etag?: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (etag) headers['if-match'] = etag
  const response = await fetch(
    urlFor(path),
    fetchInit({
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    }),
  )
  return response
}

export async function rtdbPatch(path: string, data: unknown) {
  const response = await fetch(
    urlFor(path),
    fetchInit({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  )
  return response
}

export async function rtdbTransaction<T>(
  path: string,
  updater: (current: unknown) => T | undefined,
): Promise<{ committed: boolean; snapshot: T | unknown }> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, etag } = await rtdbGet(path)
    const next = updater(data)
    if (next === undefined) return { committed: false, snapshot: data }
    const response = await rtdbSet(path, next, etag)
    if (response.status === 412) continue
    if (!response.ok) {
      throw new Error(`Firebase write failed (${response.status})`)
    }
    return { committed: true, snapshot: next }
  }
  return { committed: false, snapshot: null }
}

export function rtdbListen(path: string, onData: (data: unknown) => void): () => void {
  let stopped = false
  let timer: number | null = null
  const source = new EventSource(urlFor(path))

  function refresh() {
    if (stopped || timer !== null) return
    timer = window.setTimeout(() => {
      timer = null
      void rtdbGet(path)
        .then(({ data }) => {
          if (!stopped) onData(data)
        })
        .catch(() => undefined)
    }, 40)
  }

  source.addEventListener('put', refresh)
  source.addEventListener('patch', refresh)
  source.onerror = () => {
    refresh()
  }
  refresh()
  const poll = window.setInterval(refresh, LISTEN_POLL_MS)

  return () => {
    stopped = true
    if (timer !== null) window.clearTimeout(timer)
    window.clearInterval(poll)
    source.close()
  }
}
