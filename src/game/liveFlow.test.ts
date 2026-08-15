import { DEFAULT_SETTINGS } from './protocol'
import {
  addPlayer,
  applyMessage,
  emptyRoom,
  normalizeStoredRoom,
  toRoomState,
  type StoredRoom,
} from './roomLogic'

const DB = (process.env.VITE_FIREBASE_DATABASE_URL ??
  'https://artists-c1291-default-rtdb.firebaseio.com').replace(/\/$/, '')

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function unwrap(room: StoredRoom | { error: string }): StoredRoom {
  if ('error' in room) throw new Error(room.error)
  return room
}

async function get(path: string) {
  const response = await fetch(`${DB}/${path}.json`)
  assert(response.ok, `GET ${path} failed (${response.status})`)
  return response.json()
}

async function put(path: string, data: unknown) {
  const response = await fetch(`${DB}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  assert(response.ok, `PUT ${path} failed (${response.status})`)
}

const code = `T${Math.random().toString(36).slice(2, 5).toUpperCase()}`
const host = 'host-live'
const guest = 'guest-live'

let room: StoredRoom = emptyRoom(host, 'Ada')
const joined = addPlayer(room, guest, 'Bob')
assert(typeof joined !== 'string', 'join failed')
room = joined
await put(`rooms/${code}`, room)

room = unwrap(
  applyMessage(room, host, {
    type: 'start',
    settings: { ...DEFAULT_SETTINGS, rounds: 4, turnSeconds: 90 },
  }),
)
await put(`rooms/${code}`, room)

const afterStart = normalizeStoredRoom(await get(`rooms/${code}`))
assert(afterStart, 'room missing after start')
assert(afterStart.phase === 'picking', `after start phase=${afterStart.phase}`)
assert(afterStart.artistId === host, `after start artist=${afterStart.artistId}`)
assert(afterStart.options !== null, 'start did not store prompt options')

room = {
  ...afterStart,
  options: [{ category: 'Food', prompts: ['pizza'] }],
}
room = unwrap(applyMessage(room, host, { type: 'pick', category: 'Food', prompt: 'pizza' }))
await put(`rooms/${code}`, room)

const afterPick = normalizeStoredRoom(await get(`rooms/${code}`))
assert(afterPick, 'room missing after pick')
assert(afterPick.phase === 'drawing', `after pick phase=${afterPick.phase}`)
assert(afterPick.artistId === host, `after pick artist=${afterPick.artistId}`)
assert(afterPick.prompt === 'pizza', `after pick prompt=${afterPick.prompt}`)
assert(
  typeof afterPick.deadlineMs === 'number' && afterPick.deadlineMs > Date.now() + 10_000,
  `deadline should be ~90s in the future, got ${afterPick.deadlineMs}`,
)

const hostView = toRoomState(afterPick, host, code)
const guestView = toRoomState(afterPick, guest, code)
assert(hostView.phase === 'drawing' && hostView.prompt === 'pizza', 'host should collage pizza')
assert(guestView.phase === 'drawing' && guestView.prompt === null, 'guest must not see pizza')

await new Promise((resolve) => setTimeout(resolve, 2500))
const still = normalizeStoredRoom(await get(`rooms/${code}`))
assert(still?.phase === 'drawing', `room left drawing after 2.5s, now ${still?.phase}`)

const piece = {
  id: 'piece-live',
  kind: 'circle',
  x: 500,
  y: 500,
  width: 80,
  height: 80,
  rotation: 0,
  color: '#e07a3d',
}
await put(`rooms/${code}/pieces`, [piece])

const afterPiece = normalizeStoredRoom(await get(`rooms/${code}`))
assert(afterPiece, `room missing after piece write: ${JSON.stringify(await get(`rooms/${code}`))}`)
assert(
  afterPiece.phase === 'drawing',
  `piece write ended the turn: phase=${afterPiece.phase}`,
)
assert(afterPiece.prompt === 'pizza', 'piece write dropped the prompt')
assert(afterPiece.artistId === host, `piece write dropped artist, now ${afterPiece.artistId}`)
assert(
  typeof afterPiece.deadlineMs === 'number' && afterPiece.deadlineMs > Date.now() + 1000,
  `piece write dropped the deadline, got ${afterPiece.deadlineMs}`,
)
assert(afterPiece.pieces.some((item) => item.id === 'piece-live'), 'piece did not persist')

await put(`rooms/${code}`, null)
console.log(`live Firebase flow passed for room ${code}`)
