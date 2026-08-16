import { DEFAULT_SETTINGS } from './protocol'
import { answersMatch, maskSecret } from './prompts'
import {
  addPlayer,
  applyMessage,
  emptyRoom,
  isSpuriousDrawEnd,
  roomPatch,
  toRoomState,
  turnRemainingSeconds,
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
assert(hostDuringDraw.phase === 'drawing', 'artist should collage after picking')

const ignoredTimesUp = unwrap(applyMessage(room, guest, { type: 'timesUp' }))
assert(ignoredTimesUp.phase === 'drawing', 'timesUp must not skip a turn that still has time')
assert(ignoredTimesUp.prompt === 'pizza', 'early timesUp must leave the prompt in place')

const missingDeadline = unwrap(
  applyMessage(
    { ...room, deadlineMs: null, drawStartedMs: Date.now() },
    host,
    { type: 'timesUp' },
  ),
)
assert(
  missingDeadline.phase === 'drawing',
  'timesUp without a passed deadline must keep the collage turn',
)

const expired = unwrap(
  applyMessage(
    {
      ...room,
      deadlineMs: Date.now() - 1000,
      drawStartedMs: Date.now() - 90_000,
    },
    host,
    { type: 'timesUp' },
  ),
)
assert(expired.phase === 'reveal', 'timesUp after the deadline should reveal')

const staleDeadline = unwrap(
  applyMessage(
    {
      ...room,
      deadlineMs: Date.now() - 1000,
      drawStartedMs: null,
    },
    host,
    { type: 'timesUp' },
  ),
)
assert(
  staleDeadline.phase === 'drawing',
  'a missing start time must not let a stale deadline end the collage',
)

assert(
  isSpuriousDrawEnd(room, expired) === false,
  'a real expired timesUp must be allowed to reveal',
)
assert(
  isSpuriousDrawEnd(room, { ...room, phase: 'reveal' }),
  'reveal without expiry, a winner, or a saved collage must not kill the collage',
)

const earlyGuess = unwrap(applyMessage(room, guest, { type: 'guess', text: 'pizza' }))
assert(earlyGuess.phase === 'reveal', 'the last remaining guesser should end the turn')
assert(earlyGuess.winnerName === 'Bob', `expected Bob to win, got ${earlyGuess.winnerName}`)
assert(
  earlyGuess.guesses.some((guess) => guess.correct),
  'the correct guess should still appear in the feed',
)

room = earlyGuess

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

assert(maskSecret('ice cream') === '*** *****', 'mask should keep spaces')
assert(maskSecret('Spider-Man') === '******-***', 'mask should keep punctuation')
assert(maskSecret('pizza') === '*****', 'mask should cover letters')

assert(answersMatch('pizza', 'pizza'), 'exact guesses should count')
assert(answersMatch('brushing teeth', 'brushing teeth'), 'the full prompt should count')
assert(answersMatch('brush teeth', 'brushing teeth'), 'close wording of the full idea should count')
assert(!answersMatch('teeth', 'brushing teeth'), 'one leftover word must not count')
assert(!answersMatch('brushing', 'brushing teeth'), 'the first word alone must not count')
assert(!answersMatch('ice', 'ice cream'), 'one word of a two-word prompt must not count')
assert(answersMatch('ice cream', 'ice cream'), 'both words of a two-word prompt should count')
assert(!answersMatch('lion', 'The Lion King'), 'one title word must not count')
assert(answersMatch('lion king', 'The Lion King'), 'the content words of a title should count')

const cam = 'guest-ccc'
let multi = emptyRoom(host, 'Ada')
const bobJoined = addPlayer(multi, guest, 'Bob')
assert(typeof bobJoined !== 'string', 'Bob should join')
multi = bobJoined
const camJoined = addPlayer(multi, cam, 'Cam')
assert(typeof camJoined !== 'string', 'Cam should join')
multi = camJoined
multi = unwrap(
  applyMessage(multi, host, {
    type: 'start',
    settings: { ...DEFAULT_SETTINGS, rounds: 4 },
  }),
)
multi = { ...multi, options: [{ category: 'Food', prompts: ['pizza'] }] }
multi = unwrap(applyMessage(multi, host, { type: 'pick', category: 'Food', prompt: 'pizza' }))
multi = { ...multi, drawStartedMs: Date.now() - 15_000 }

multi = unwrap(applyMessage(multi, guest, { type: 'guess', text: 'pizza' }))
assert(multi.phase === 'drawing', 'first correct guess must not end a 3-player turn')
assert(multi.winnerName === null, 'winner is not set until the turn ends')
assert(multi.guessTimes[guest]?.times.length === 1, 'first solver should record a guess time')

const skippedNext = unwrap(applyMessage(multi, host, { type: 'nextTurn' }))
assert(skippedNext.phase === 'drawing', 'nextTurn must wait until reveal')

const camDuringDraw = toRoomState(multi, cam, 'TEST')
const masked = camDuringDraw.guesses.find((guess) => guess.playerId === guest)
assert(masked?.correct, 'Cam should see that Bob got it')
assert(masked?.text === '*****', `Cam must see a masked guess, got ${masked?.text}`)

const bobDuringDraw = toRoomState(multi, guest, 'TEST')
assert(
  bobDuringDraw.guesses.find((guess) => guess.playerId === guest)?.text === 'pizza',
  'Bob should still see his own correct guess',
)

const adaDuringDraw = toRoomState(multi, host, 'TEST')
assert(
  adaDuringDraw.guesses.find((guess) => guess.playerId === guest)?.text === '*****',
  'the artist must not show the raw correct guess to the room feed',
)

const ignoredRepeat = unwrap(applyMessage(multi, guest, { type: 'guess', text: 'pizza' }))
assert(ignoredRepeat.guesses.length === multi.guesses.length, 'a solver cannot guess again')

const partialTimeUp = unwrap(
  applyMessage(
    {
      ...multi,
      deadlineMs: Date.now() - 1000,
      drawStartedMs: Date.now() - 90_000,
    },
    host,
    { type: 'timesUp' },
  ),
)
assert(partialTimeUp.phase === 'reveal', 'time up should reveal even if only some guessers got it')
assert(partialTimeUp.winnerName === 'Bob', `expected Bob after time up, got ${partialTimeUp.winnerName}`)

multi = unwrap(applyMessage(multi, cam, { type: 'guess', text: 'pizza' }))
assert(multi.phase === 'reveal', 'the turn ends when every guesser is correct')
assert(multi.winnerName === 'Bob and Cam', `expected Bob and Cam, got ${multi.winnerName}`)
assert(multi.guessTimes[cam]?.times.length === 1, 'second solver should record a guess time')

const revealView = toRoomState(multi, cam, 'TEST')
assert(
  revealView.guesses.find((guess) => guess.playerId === guest)?.text === 'pizza',
  'reveal should show the real guesses',
)

let lastLeft = emptyRoom(host, 'Ada')
const lastBob = addPlayer(lastLeft, guest, 'Bob')
assert(typeof lastBob !== 'string', 'Bob should join last-left room')
lastLeft = lastBob
const lastCam = addPlayer(lastLeft, cam, 'Cam')
assert(typeof lastCam !== 'string', 'Cam should join last-left room')
lastLeft = lastCam
lastLeft = unwrap(
  applyMessage(lastLeft, host, {
    type: 'start',
    settings: { ...DEFAULT_SETTINGS, rounds: 4 },
  }),
)
lastLeft = { ...lastLeft, options: [{ category: 'Food', prompts: ['pizza'] }] }
lastLeft = unwrap(applyMessage(lastLeft, host, { type: 'pick', category: 'Food', prompt: 'pizza' }))
lastLeft = unwrap(applyMessage(lastLeft, guest, { type: 'guess', text: 'pizza' }))
assert(lastLeft.phase === 'drawing', 'first of two guessers should leave the turn running')
lastLeft = unwrap(applyMessage(lastLeft, cam, { type: 'guess', text: 'pizza' }))
assert(lastLeft.phase === 'reveal', 'the last remaining guesser must end the turn immediately')
assert(lastLeft.winnerName === 'Bob and Cam', `expected Bob and Cam, got ${lastLeft.winnerName}`)

let ghosted = emptyRoom(host, 'Ada')
const ghostBob = addPlayer(ghosted, guest, 'Bob')
assert(typeof ghostBob !== 'string', 'Bob should join ghost room')
ghosted = ghostBob
const ghostCam = addPlayer(ghosted, cam, 'Cam')
assert(typeof ghostCam !== 'string', 'Cam should join ghost room')
ghosted = ghostCam
ghosted = unwrap(
  applyMessage(ghosted, host, {
    type: 'start',
    settings: { ...DEFAULT_SETTINGS, rounds: 4 },
  }),
)
ghosted = { ...ghosted, options: [{ category: 'Food', prompts: ['pizza'] }] }
ghosted = unwrap(applyMessage(ghosted, host, { type: 'pick', category: 'Food', prompt: 'pizza' }))
ghosted = {
  ...ghosted,
  players: {
    ...ghosted.players,
    [cam]: { ...ghosted.players[cam], seenAt: Date.now() - 60_000 },
  },
}
ghosted = unwrap(applyMessage(ghosted, guest, { type: 'guess', text: 'pizza' }))
assert(ghosted.phase === 'reveal', 'a dropped extra player must not block the last remaining guesser')
assert(ghosted.winnerName === 'Bob', `expected Bob with a stale extra player, got ${ghosted.winnerName}`)

const now = 2_000_000
assert(
  turnRemainingSeconds({
    drawStartedMs: now,
    deadlineMs: now + 90_000,
    turnSeconds: 90,
    now: now + 30_000,
  }) === 60,
  'synced clocks should show time left in the turn',
)
assert(
  turnRemainingSeconds({
    drawStartedMs: now + 8 * 60_000,
    deadlineMs: now + 8 * 60_000 + 90_000,
    turnSeconds: 90,
    now,
    localStartedMs: now,
  }) === 90,
  'a skewed clock must not show a 9-minute timer',
)
assert(
  turnRemainingSeconds({
    drawStartedMs: now + 8 * 60_000,
    deadlineMs: now + 8 * 60_000 + 90_000,
    turnSeconds: 90,
    now,
    localStartedMs: now - 30_000,
  }) === 60,
  'skewed clocks should count down from when this device started the turn',
)

console.log('roomLogic tests passed')
