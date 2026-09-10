export type TabSession = {
  roomCode: string
  name: string
  intent: 'create' | 'join'
  characterId?: string
}

export const JOIN_BUILD = '8'

function newSeatId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `p-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

function hostSeatKey(code: string) {
  return `artists-host:${code}`
}

function guestSeatKey(code: string) {
  return `artists-guest:${code}`
}

function tabRoleKey(code: string) {
  return `artists-role:${code}`
}

function readStorage(storage: Storage, key: string) {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function seatIdFor(code: string, intent: 'create' | 'join') {
  const key = intent === 'create' ? hostSeatKey(code) : guestSeatKey(code)
  const saved = readStorage(localStorage, key) ?? readStorage(sessionStorage, key)
  if (saved) return saved
  const id = newSeatId()
  if (!writeStorage(localStorage, key, id)) writeStorage(sessionStorage, key, id)
  return id
}

export function replaceGuestSeat(code: string) {
  const id = newSeatId()
  if (!writeStorage(localStorage, guestSeatKey(code), id)) {
    writeStorage(sessionStorage, guestSeatKey(code), id)
  }
  return id
}

export function rememberTabRole(code: string, intent: 'create' | 'join') {
  writeStorage(sessionStorage, tabRoleKey(code), intent === 'create' ? 'host' : 'guest')
}

export function readTabSession(code: string): TabSession | null {
  if (!code) return null
  const role = readStorage(sessionStorage, tabRoleKey(code))
  const name = readStorage(localStorage, 'artists-name')
  if (!role || !name) return null
  const characterId = readStorage(localStorage, 'artists-character-id') || undefined
  return {
    roomCode: code,
    name,
    characterId,
    intent: role === 'host' ? 'create' : 'join',
  }
}
