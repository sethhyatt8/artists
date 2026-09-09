import { CHARACTERS } from './characters'
import { DEFAULT_SETTINGS, sanitizeGameSettings } from './protocol'
import {
  CATEGORIES_PER_DEAL,
  PROMPTS_PER_CATEGORY,
  answersMatch,
  dealPromptOptions,
  maskSecret,
  normalizeAnswer,
} from './prompts'
import {
  addPlayer,
  applyMessage,
  emptyRoom,
  isSpuriousDrawEnd,
  mergeGuessLists,
  normalizeStoredRoom,
  roomPatch,
  toFirebaseRoom,
  toRoomState,
  turnRemainingSeconds,
  turnSolveRows,
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

const wrongA = unwrap(applyMessage(room, guest, { type: 'guess', text: 'cat' }))
assert(wrongA.phase === 'drawing', 'a wrong guess must keep the turn going')
assert(wrongA.guesses.length === 1, `expected one guess, got ${wrongA.guesses.length}`)

const wrongB = unwrap(applyMessage(wrongA, guest, { type: 'guess', text: 'dog' }))
assert(wrongB.phase === 'drawing', 'a second wrong guess must keep the turn going')
assert(wrongB.guesses.length === 2, `expected two guesses, got ${wrongB.guesses.length}`)
assert(wrongB.guesses[0]?.id === `g-1-${guest}`, `first guess id=${wrongB.guesses[0]?.id}`)
assert(wrongB.guesses[1]?.id === `g-2-${guest}`, `second guess id=${wrongB.guesses[1]?.id}`)

const roundtrip = normalizeStoredRoom(toFirebaseRoom(wrongB))
assert(roundtrip?.guesses.length === 2, `firebase roundtrip lost guesses: ${roundtrip?.guesses.length}`)
assert(roundtrip?.guessSerial === 2, `guessSerial should persist, got ${roundtrip?.guessSerial}`)
assert(roundtrip?.guesses[1]?.text === 'dog', 'latest guess text should survive firebase roundtrip')

room = wrongB

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
assert(answersMatch('spiderman', 'Spider-Man'), 'hyphenated names should count without the hyphen')
assert(answersMatch('spider man', 'Spider-Man'), 'spaces in a hyphenated name should count')
assert(answersMatch('SpiderMan', 'Spider-Man'), 'mixed case without a hyphen should count')
assert(!answersMatch('spider', 'Spider-Man'), 'one half of a hyphenated name must not count')
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
const bobSolve = multi.guesses.find((guess) => guess.playerId === guest)
assert(bobSolve?.correct, 'Bob should be marked correct')
assert(
  typeof bobSolve?.elapsedMs === 'number' && bobSolve.elapsedMs >= 14_000 && bobSolve.elapsedMs < 20_000,
  `Bob's solve time should be ~15s, got ${bobSolve?.elapsedMs}`,
)

const skippedNext = unwrap(applyMessage(multi, host, { type: 'nextTurn' }))
assert(skippedNext.phase === 'drawing', 'nextTurn must wait until reveal')

const camDuringDraw = toRoomState(multi, cam, 'TEST')
const masked = camDuringDraw.guesses.find((guess) => guess.playerId === guest)
assert(masked?.correct, 'Cam should see that Bob got it')
assert(masked?.text === '*****', `Cam must see a masked guess, got ${masked?.text}`)
assert(camDuringDraw.prompt === null, 'Cam must not see the answer after Bob solves')

const bobDuringDraw = toRoomState(multi, guest, 'TEST')
assert(
  bobDuringDraw.guesses.find((guess) => guess.playerId === guest)?.text === 'pizza',
  'Bob should still see his own correct guess',
)
assert(bobDuringDraw.prompt === 'pizza', 'the solver should see the answer after getting it')

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
const timedRows = turnSolveRows(
  Object.values(partialTimeUp.players),
  partialTimeUp.artistId,
  partialTimeUp.guesses,
)
assert(timedRows[0]?.playerId === guest && timedRows[0].place === 1, 'Bob should be featured first')
assert(timedRows[1]?.playerId === cam && timedRows[1].elapsedMs === null, 'Cam should show as unfinished')

multi = unwrap(applyMessage(multi, cam, { type: 'guess', text: 'pizza' }))
assert(multi.phase === 'reveal', 'the turn ends when every guesser is correct')
assert(multi.winnerName === 'Bob and Cam', `expected Bob and Cam, got ${multi.winnerName}`)
assert(multi.guessTimes[cam]?.times.length === 1, 'second solver should record a guess time')
const camSolve = multi.guesses.find((guess) => guess.playerId === cam)
assert(
  typeof camSolve?.elapsedMs === 'number' &&
    typeof bobSolve?.elapsedMs === 'number' &&
    camSolve.elapsedMs >= bobSolve.elapsedMs,
  'Cam should not be faster than Bob on the same board',
)
const allRows = turnSolveRows(Object.values(multi.players), multi.artistId, multi.guesses)
assert(allRows.map((row) => row.playerId).join(',') === `${guest},${cam}`, 'times should list solvers first')
assert(allRows[0]?.place === 1 && allRows[1]?.place === 2, 'places should follow solve order')

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
const quietGuesser = unwrap(applyMessage(ghosted, guest, { type: 'guess', text: 'pizza' }))
assert(
  quietGuesser.phase === 'drawing',
  'a quiet guesser still listed in the room must get the rest of the turn',
)

const camPlayer = ghosted.players[cam]
assert(camPlayer, 'Cam should still be in the ghost room')
const { [cam]: _dropped, ...remainingPlayers } = ghosted.players
const afterLeave = unwrap(
  applyMessage(
    { ...ghosted, players: remainingPlayers },
    guest,
    { type: 'guess', text: 'pizza' },
  ),
)
assert(afterLeave.phase === 'reveal', 'a player who actually left must not block the last remaining guesser')
assert(afterLeave.winnerName === 'Bob', `expected Bob after Cam left, got ${afterLeave.winnerName}`)

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

assert(
  sanitizeGameSettings({ shapeSets: ['letters', 'weird', 'letters'] }).shapeSets.join(',') ===
    'letters,weird',
  'hosts should be able to combine shape sets',
)
assert(
  sanitizeGameSettings({ shapeSet: 'regular' }).shapeSets.join(',') === 'regular',
  'old single shape-set rooms should still load',
)
assert(
  sanitizeGameSettings({ turnSeconds: 300 }).turnSeconds === 300,
  'hosts should be able to pick 5-minute rounds',
)
assert(
  sanitizeGameSettings({ rounds: 12 }).rounds === 12,
  'hosts should be able to pick 12 rounds',
)
assert(
  CHARACTERS.every(
    (character) => Boolean(character.portrait) && (character.celebrateFrames?.length ?? 0) >= 4,
  ),
  'every family face should have a celebrate sequence',
)
assert(
  (CHARACTERS.find((character) => character.id === 'julia')?.celebrateFrames?.length ?? 0) >= 6,
  'Julia’s glasses should pulse across extra frames',
)

const champRoom = {
  ...emptyRoom(host, 'Ada', 'seth'),
  guessTimes: { [host]: { name: 'Ada', times: [1800, 900] } },
}
const champView = toRoomState(champRoom, host, 'TEST')
assert(champView.guessChampion?.characterId === 'seth', 'fastest guesser should keep their avatar')
assert(champView.guessChampion?.name === 'Ada', 'fastest guesser should use tonight’s name')

const sethRoom = emptyRoom(host, 'Captain', 'seth')
assert(sethRoom.players[host]?.characterId === 'seth', 'host profile should join with a character')
assert(sethRoom.players[host]?.name === 'Captain', 'tonight’s name can differ from the character')
const emilyJoin = addPlayer(sethRoom, guest, 'Em', 'emily')
assert(typeof emilyJoin !== 'string', 'character guest should join')
assert(emilyJoin.players[guest]?.characterId === 'emily', 'join should keep the selected character')
const guestAgain = addPlayer(emilyJoin, guest, 'Mystery', null)
assert(typeof guestAgain !== 'string', 'same player can switch to guest')
assert(
  guestAgain.players[guest]?.characterId === undefined,
  'playing as a guest should drop the saved character',
)
const restored = normalizeStoredRoom(
  toFirebaseRoom({
    ...sethRoom,
    players: {
      ...sethRoom.players,
      [guest]: { id: guest, name: 'Em', score: 0, characterId: 'emily' },
    },
  }),
)
assert(restored?.players[guest]?.characterId === 'emily', 'character ids should survive firebase')

const dealt = dealPromptOptions()
assert(
  dealt.length === CATEGORIES_PER_DEAL,
  `should deal ${CATEGORIES_PER_DEAL} categories, got ${dealt.length}`,
)
assert(
  dealt.every((group) => group.prompts.length === PROMPTS_PER_CATEGORY),
  'each category should offer several unused prompts',
)
const dealtPrompts = dealt.flatMap((group) => group.prompts)
const uniqueDealt = new Set(dealtPrompts.map(normalizeAnswer))
assert(
  uniqueDealt.size === dealtPrompts.length,
  'one deal should not repeat the same prompt across categories',
)
const used = dealtPrompts
const dealtAgain = dealPromptOptions(used)
const usedNorm = new Set(used.map(normalizeAnswer))
assert(
  dealtAgain.flatMap((group) => group.prompts).every((prompt) => !usedNorm.has(normalizeAnswer(prompt))),
  'later rounds should not re-deal the same prompt',
)

let promptRoom = emptyRoom(host, 'Ada')
const promptGuest = addPlayer(promptRoom, guest, 'Bob')
assert(typeof promptGuest !== 'string', 'prompt test guest should join')
promptRoom = unwrap(
  applyMessage(promptGuest, host, {
    type: 'start',
    settings: { ...DEFAULT_SETTINGS, rounds: 4 },
  }),
)
const firstDeal = promptRoom.options?.flatMap((group) => group.prompts) ?? []
assert(firstDeal.length >= 20, `start should offer a large unused set, got ${firstDeal.length}`)
assert(
  firstDeal.every((prompt) => promptRoom.usedPrompts.includes(prompt)),
  'offered prompts should be marked used so they do not come back next turn',
)
const nextDeal = dealPromptOptions(promptRoom.usedPrompts).flatMap((group) => group.prompts)
assert(
  nextDeal.every((prompt) => !firstDeal.includes(prompt)),
  'the next artist should see a fresh set of prompts',
)

const orderedGuesses = normalizeStoredRoom(
  toFirebaseRoom({
    ...emptyRoom(host, 'Ada'),
    guesses: [
      { id: 'g-aaa-2', playerId: 'a', name: 'Ann', text: 'later', correct: false, seq: 2 },
      { id: 'g-zzz-1', playerId: 'z', name: 'Zed', text: 'earlier', correct: false, seq: 1 },
    ],
  }),
)
assert(orderedGuesses, 'guess room should normalize')
assert(
  orderedGuesses.guesses.map((guess) => guess.text).join(',') === 'earlier,later',
  `guesses must stay in chat order, got ${orderedGuesses.guesses.map((guess) => guess.text).join(',')}`,
)

const merged = mergeGuessLists(
  [{ id: 'g-1-a', playerId: 'a', name: 'Ann', text: 'cat', correct: false, seq: 1 }],
  [{ id: 'g-2-b', playerId: 'b', name: 'Bob', text: 'dog', correct: false, seq: 2 }],
)
assert(
  merged.map((guess) => guess.text).join(',') === 'cat,dog',
  `merging guess lists must keep both lines, got ${merged.map((guess) => guess.text).join(',')}`,
)

const dan = 'guest-ddd'
const ghost = 'guest-eee'
let voteRoom = emptyRoom(host, 'Ada')
for (const [id, name] of [
  [guest, 'Bob'],
  [cam, 'Cam'],
  [dan, 'Dan'],
  [ghost, 'Eve'],
] as const) {
  const joinedVote = addPlayer(voteRoom, id, name)
  assert(typeof joinedVote !== 'string', `${name} should join the vote room`)
  voteRoom = joinedVote
}
voteRoom = {
  ...voteRoom,
  phase: 'voting',
  collages: [
    {
      id: 'c-1',
      round: 1,
      artistId: host,
      artistName: 'Ada',
      prompt: 'pizza',
      pieces: [],
    },
    {
      id: 'c-2',
      round: 2,
      artistId: guest,
      artistName: 'Bob',
      prompt: 'moon',
      pieces: [],
    },
  ],
  votes: {},
}
const ghostPlayer = voteRoom.players[ghost]
assert(ghostPlayer, 'ghost player should exist')
voteRoom = {
  ...voteRoom,
  players: {
    ...voteRoom.players,
    [ghost]: { ...ghostPlayer, seenAt: Date.now() - 90_000 },
  },
}
const voteView = toRoomState(voteRoom, host, 'TEST')
assert(voteView.voterCount === 5, `should still count every player in the room, got ${voteView.voterCount}`)
const ballot = ['c-1', 'c-2']
for (const id of [host, guest, cam, dan]) {
  voteRoom = unwrap(applyMessage(voteRoom, id, { type: 'vote', ranks: ballot }))
}
assert(voteRoom.phase === 'voting', 'voting must wait for the last player still in the room')
voteRoom = unwrap(applyMessage(voteRoom, host, { type: 'closeVote' }))
assert(voteRoom.phase === 'finale', `host should be able to count the votes we have, got ${voteRoom.phase}`)

const fourVote = emptyRoom(host, 'Ada')
let fullVote = fourVote
for (const [id, name] of [
  [guest, 'Bob'],
  [cam, 'Cam'],
  [dan, 'Dan'],
] as const) {
  const joinedFull = addPlayer(fullVote, id, name)
  assert(typeof joinedFull !== 'string', `${name} should join`)
  fullVote = joinedFull
}
fullVote = {
  ...fullVote,
  phase: 'voting',
  collages: voteRoom.collages,
  votes: {},
}
for (const id of [host, guest, cam, dan]) {
  fullVote = unwrap(applyMessage(fullVote, id, { type: 'vote', ranks: ballot }))
}
assert(fullVote.phase === 'finale', 'when every listed player votes, the finale should start')

const fourCollages = [
  ...voteRoom.collages,
  {
    id: 'c-3',
    round: 3,
    artistId: cam,
    artistName: 'Cam',
    prompt: 'tree',
    pieces: [],
  },
  {
    id: 'c-4',
    round: 4,
    artistId: dan,
    artistName: 'Dan',
    prompt: 'boat',
    pieces: [],
  },
]
let allRankVote = {
  ...fullVote,
  phase: 'voting' as const,
  collages: fourCollages,
  votes: {},
}
allRankVote = unwrap(
  applyMessage(allRankVote, host, { type: 'vote', ranks: ['c-1', 'c-2'] }),
)
assert(
  !allRankVote.votes[host],
  'a partial ranking should not count until every collage is ranked',
)
allRankVote = unwrap(
  applyMessage(allRankVote, host, {
    type: 'vote',
    ranks: ['c-1', 'c-2', 'c-3', 'c-4'],
  }),
)
assert(
  allRankVote.votes[host]?.join(',') === 'c-1,c-2,c-3,c-4',
  'players should be able to rank every drawing',
)
const allRankView = toRoomState(allRankVote, host, 'TEST')
assert(
  allRankView.waitingVoters.includes('Bob'),
  `waiting list should name players who have not voted, got ${allRankView.waitingVoters.join(',')}`,
)
assert(
  allRankView.favorites.length === 4,
  `finale should keep every collage, got ${allRankView.favorites.length}`,
)

console.log('roomLogic tests passed')
