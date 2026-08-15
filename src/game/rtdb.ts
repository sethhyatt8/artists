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

export async function rtdbPatch(path: string, data: unknown) {
  const response = await fetch(urlFor(path), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error(`Firebase patch failed (${response.status})`)
  }
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

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        cloneValue(item),
      ]),
    )
  }
  return value
}

function setAt(root: unknown, path: string, value: unknown): unknown {
  if (path === '/') return value
  const parts = path.split('/').filter(Boolean)
  const next = (cloneValue(root) ?? {}) as Record<string, unknown>
  let cursor = next
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i] ?? ''
    const child = cursor[key]
    cursor[key] =
      child && typeof child === 'object' && !Array.isArray(child)
        ? { ...(child as Record<string, unknown>) }
        : {}
    cursor = cursor[key] as Record<string, unknown>
  }
  const last = parts[parts.length - 1]
  if (!last) return next
  if (value === null) delete cursor[last]
  else cursor[last] = value
  return next
}

function patchAt(root: unknown, path: string, patch: Record<string, unknown>): unknown {
  const base = path === '/' ? root : setAt(root, path, getAt(root, path) ?? {})
  const targetPath = path === '/' ? [] : path.split('/').filter(Boolean)
  const next = cloneValue(base) as Record<string, unknown>
  let cursor = next
  for (const key of targetPath) {
    const child = cursor[key]
    cursor[key] =
      child && typeof child === 'object' && !Array.isArray(child)
        ? { ...(child as Record<string, unknown>) }
        : {}
    cursor = cursor[key] as Record<string, unknown>
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete cursor[key]
    else cursor[key] = value
  }
  return next
}

function getAt(root: unknown, path: string): unknown {
  if (path === '/') return root
  let cursor: unknown = root
  for (const key of path.split('/').filter(Boolean)) {
    if (!cursor || typeof cursor !== 'object') return null
    cursor = (cursor as Record<string, unknown>)[key]
  }
  return cursor
}

export function rtdbListen(path: string, onData: (data: unknown) => void): () => void {
  const source = new EventSource(urlFor(path))
  let tree: unknown = null

  source.addEventListener('put', (event) => {
    const payload = JSON.parse((event as MessageEvent).data) as {
      path: string
      data: unknown
    }
    tree = setAt(tree, payload.path, payload.data)
    onData(tree)
  })

  source.addEventListener('patch', (event) => {
    const payload = JSON.parse((event as MessageEvent).data) as {
      path: string
      data: Record<string, unknown>
    }
    tree = patchAt(tree, payload.path, payload.data ?? {})
    onData(tree)
  })

  source.onerror = () => {
    // EventSource retries automatically.
  }

  return () => source.close()
}
