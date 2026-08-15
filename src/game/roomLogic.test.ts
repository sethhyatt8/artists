import { DEFAULT_SETTINGS } from './protocol'
import {
  addPlayer,
  applyMessage,
  emptyRoom,
  roomPatch,
  toRoomState,
  type StoredRoom,
} from './roomLogic'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function unwrap(room: StoredRoom | { error: string }): StoredRoom {
  if ('error' in room) throw new Error(room.error)
  return room
}

const host = 'host-aaa'
const guest = 'guest-bbb'

let room = emptyRoom(host, 'Ada')
const joined = addPlayer(room, guest, 'Bob')
assert(typeof joined !== 'string', 'join should work')
room = joined

room = unwrap(
  applyMessage(room, host, {
    type: 'start',
    settings: { ...DEFAULT_SETTINGS, rounds: 4 },
  }),
)
assert(room.phase === 'picking', `expected picking after start, got ${room.phase}`)
assert(room.artistId === host, `first artist should be host, got ${room.artistId}`)

room = { ...room, options: [{ category: 'Food', prompts: ['pizza'] }] }
room = unwrap(applyMessage(room, host, { type: 'pick', category: 'Food', prompt: 'pizza' }))
assert(room.phase === 'drawing', `expected drawing, got ${room.phase}`)

const guestDuringDraw = toRoomState(room, guest, 'TEST')
assert(guestDuringDraw.prompt === null, 'guesser must not see the prompt while drawing')
assert(guestDuringDraw.phase === 'drawing', 'guesser should still be in drawing')
const hostDuringDraw = toRoomState(room, host, 'TEST')
assert(hostDuringDraw.prompt === 'pizza', 'artist should see the prompt while drawing')

room = unwrap(applyMessage(room, guest, { type: 'guess', text: 'pizza' }))
assert(room.phase === 'reveal', `expected reveal, got ${room.phase}`)
assert(room.winnerName === 'Bob', `expected Bob to win, got ${room.winnerName}`)

const guestReveal = toRoomState(room, guest, 'TEST')
assert(guestReveal.prompt === 'pizza', 'both may see the prompt on reveal')

const afterGuess: StoredRoom = {
  ...room,
  pieces: [
    {
      id: 'p1',
      kind: 'circle',
      x: 10,
      y: 10,
      width: 40,
      height: 40,
      rotation: 0,
      color: '#000',
    },
  ],
}
room = unwrap(applyMessage(afterGuess, host, { type: 'nextTurn' }))
assert(room.phase === 'picking', `next turn should be picking, got ${room.phase}`)
assert(room.artistId === guest, `second artist should be guest, got ${room.artistId}`)
assert(room.prompt === null, 'next turn must clear the prompt')
assert(room.pieces.length === 0, 'next turn must clear the canvas')

const patch = roomPatch(afterGuess, room)
assert(patch.phase === 'picking', 'patch must change phase to picking')
assert(patch.artistId === guest, 'patch must set the next artist')
assert(patch.prompt === null, 'patch must clear the prompt')
assert(patch.pieces === null, `empty pieces must patch as null, got ${JSON.stringify(patch.pieces)}`)
assert(patch.guesses === null, `empty guesses must patch as null, got ${JSON.stringify(patch.guesses)}`)
assert(!Array.isArray(patch.pieces) || patch.pieces.length > 0, 'patch must not send empty arrays')

const hostNext = toRoomState(room, host, 'TEST')
assert(hostNext.prompt === null, 'host must not see the old word after next turn')
assert(hostNext.options === null, 'host must not get pick tools when they are not the artist')
assert(hostNext.phase === 'picking', 'host should wait in picking')

const guestNext = toRoomState(room, guest, 'TEST')
assert(guestNext.prompt === null, 'new artist must not see the previous word')
assert(guestNext.options !== null, 'new artist must get prompt choices')
assert((guestNext.options?.length ?? 0) > 0, 'new artist must get prompt choices')

console.log('roomLogic tests passed')
