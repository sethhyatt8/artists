const databaseURL = (import.meta.env.VITE_FIREBASE_DATABASE_URL ?? '').replace(/\/$/, '')

export function isFirebaseConfigured() {
  return databaseURL.length > 0
}

function urlFor(path: string) {
  const clean = path.replace(/^\/+|\/+$/g, '')
  return `${databaseURL}/${clean}.json`
}

export async function rtdbGet(path: string): Promise<{ data: unknown; etag: string | null }> {
  const response = await fetch(urlFor(path), {
    headers: { 'X-Firebase-ETag': 'true' },
  })
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
  const response = await fetch(urlFor(path), {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  })
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
  const source = new EventSource(urlFor(path))
  let stopped = false
  let timer: number | null = null

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
    // EventSource retries automatically.
  }
  refresh()

  return () => {
    stopped = true
    if (timer !== null) window.clearTimeout(timer)
    source.close()
  }
}
