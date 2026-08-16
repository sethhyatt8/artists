import {
  DEFAULT_SETTINGS,
  MAX_PLAYERS,
  sanitizeGameSettings,
  type ClientMessage,
  type GameSettings,
  type Guess,
  type GuessChampion,
  type Phase,
  type Player,
  type RankedCollage,
  type RoomState,
  type SavedCollage,
} from './protocol'
import {
  answersMatch,
  dealPromptOptions,
  maskSecret,
  optionExists,
  type CategoryOptions,
} from './prompts'
import type { CollagePiece } from './collage'

const VOTE_POINTS = [3, 2, 1]
const DRAWING_GRACE_MS = 10_000
const STALE_PLAYER_MS = 25_000

export type GuessClock = {
  name: string
  times: number[]
}

export type StoredRoom = {
  phase: Phase
  hostId: string | null
  createdBy: string | null
  players: Record<string, Player>
  order: string[]
  artistIndex: number
  artistId: string | null
  prompt: string | null
  options: CategoryOptions[] | null
  pieces: CollagePiece[]
  guesses: Guess[]
  deadlineMs: number | null
  winnerName: string | null
  settings: GameSettings
  round: number
  guessSerial: number
  collages: SavedCollage[]
  votes: Record<string, string[]>
  guessTimes: Record<string, GuessClock>
  drawStartedMs: number | null
}

export function emptyRoom(hostId: string, name: string): StoredRoom {
  return {
    phase: 'lobby',
    hostId,
    createdBy: hostId,
    players: {
      [hostId]: { id: hostId, name, score: 0, seenAt: Date.now() },
    },
    order: [hostId],
    artistIndex: 0,
    artistId: null,
    prompt: null,
    options: null,
    pieces: [],
    guesses: [],
    deadlineMs: null,
    winnerName: null,
    settings: { ...DEFAULT_SETTINGS },
    round: 0,
    guessSerial: 0,
    collages: [],
    votes: {},
    guessTimes: {},
    drawStartedMs: null,
  }
}

function isPhase(value: unknown): value is Phase {
  return (
    value === 'lobby' ||
    value === 'picking' ||
    value === 'drawing' ||
    value === 'reveal' ||
    value === 'voting' ||
    value === 'finale'
  )
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (!value || typeof value !== 'object') return []
  return Object.keys(value)
    .sort((a, b) => {
      const na = Number(a)
      const nb = Number(b)
      const aInt = Number.isInteger(na) && String(na) === a
      const bInt = Number.isInteger(nb) && String(nb) === b
      if (aInt && bInt) return na - nb
      return a.localeCompare(b)
    })
    .map((key) => (value as Record<string, T>)[key])
}

function normalizeVotes(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object') return {}
  const votes: Record<string, string[]> = {}
  for (const [id, ranks] of Object.entries(raw as Record<string, unknown>)) {
    votes[id] = asArray<string>(ranks).filter((item) => typeof item === 'string')
  }
  return votes
}

function normalizeGuessTimes(raw: unknown): Record<string, GuessClock> {
  if (!raw || typeof raw !== 'object') return {}
  const clocks: Record<string, GuessClock> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const item = value as { name?: unknown; times?: unknown }
    clocks[id] = {
      name: typeof item.name === 'string' ? item.name : 'Artist',
      times: asArray<number>(item.times).filter((time) => typeof time === 'number'),
    }
  }
  return clocks
}

function normalizePlayers(raw: unknown): Record<string, Player> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const players: Record<string, Player> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const item = value as Record<string, unknown>
    players[id] = {
      id: typeof item.id === 'string' ? item.id : id,
      name: typeof item.name === 'string' && item.name.trim() ? item.name : 'Artist',
      score: typeof item.score === 'number' ? item.score : 0,
      seenAt: typeof item.seenAt === 'number' ? item.seenAt : undefined,
    }
  }
  return players
}

export function playerRecord(id: string, name: string, score = 0): Player {
  return { id, name, score, seenAt: Date.now() }
}

export function normalizeStoredRoom(raw: unknown): StoredRoom | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<StoredRoom>
  const players = normalizePlayers(value.players)
  if (!isPhase(value.phase)) return null
  return {
    phase: value.phase,
    hostId: typeof value.hostId === 'string' ? value.hostId : null,
    createdBy:
      typeof value.createdBy === 'string'
        ? value.createdBy
        : typeof value.hostId === 'string'
          ? value.hostId
          : null,
    players,
    order: asArray<string>(value.order),
    artistIndex: typeof value.artistIndex === 'number' ? value.artistIndex : 0,
    artistId: typeof value.artistId === 'string' ? value.artistId : null,
    prompt: typeof value.prompt === 'string' ? value.prompt : null,
    options:
      value.options == null
        ? null
        : asArray<CategoryOptions>(value.options),
    pieces: asArray<CollagePiece>(value.pieces),
    guesses: asArray<Guess>(value.guesses),
    deadlineMs: typeof value.deadlineMs === 'number' ? value.deadlineMs : null,
    winnerName: typeof value.winnerName === 'string' ? value.winnerName : null,
    settings: sanitizeGameSettings(value.settings),
    round: typeof value.round === 'number' ? value.round : 0,
    guessSerial: typeof value.guessSerial === 'number' ? value.guessSerial : 0,
    collages: asArray<SavedCollage>(value.collages).map((item) => ({
      id: typeof item?.id === 'string' ? item.id : 'c-0',
      round: typeof item?.round === 'number' ? item.round : 0,
      artistId: typeof item?.artistId === 'string' ? item.artistId : '',
      artistName: typeof item?.artistName === 'string' ? item.artistName : 'Artist',
      prompt: typeof item?.prompt === 'string' ? item.prompt : 'untitled',
      pieces: asArray<CollagePiece>(item?.pieces),
    })),
    votes: normalizeVotes(value.votes),
    guessTimes: normalizeGuessTimes(value.guessTimes),
    drawStartedMs: typeof value.drawStartedMs === 'number' ? value.drawStartedMs : null,
  }
}

export function toFirebaseRoom(room: StoredRoom) {
  return {
    ...room,
    pieces: Object.fromEntries(room.pieces.map((piece) => [piece.id, piece])),
    guesses: Object.fromEntries(room.guesses.map((guess) => [guess.id, guess])),
  }
}

export function toRoomState(room: StoredRoom, selfId: string, roomCode: string): RoomState {
  const isArtist = selfId === room.artistId
  const showPrompt =
    (isArtist && room.phase === 'drawing') ||
    room.phase === 'reveal' ||
    room.phase === 'voting' ||
    room.phase === 'finale'
  const showOptions = isArtist && room.phase === 'picking'
  const hostId = room.createdBy ?? room.hostId
  const players = Object.values(room.players).sort((a, b) => {
    if (a.id === hostId) return -1
    if (b.id === hostId) return 1
    return a.name.localeCompare(b.name)
  })
  const artist = room.artistId ? room.players[room.artistId] : undefined
  const myVote = room.votes[selfId] ?? null
  return {
    roomCode,
    phase: room.phase,
    selfId,
    hostId,
    createdBy: room.createdBy,
    players,
    artistId: room.artistId,
    artistName: artist?.name ?? null,
    prompt: showPrompt ? room.prompt : null,
    options: showOptions ? room.options : null,
    pieces: room.phase === 'lobby' ? [] : room.pieces,
    guesses: visibleGuesses(room, selfId),
    deadlineMs: room.deadlineMs,
    drawStartedMs: room.drawStartedMs,
    winnerName: room.winnerName,
    settings: room.settings,
    round: room.round,
    collages: room.collages,
    myVote,
    votedCount: Object.keys(room.votes).length,
    voterCount: playerCount(room),
    favorites: rankFavorites(room.collages, room.votes),
    guessChampion: pickGuessChampion(room.guessTimes),
  }
}

export function playerCount(room: StoredRoom) {
  return Object.keys(room.players).length
}

function rotationOrder(room: StoredRoom) {
  const ids = Object.keys(room.players)
  const creator = room.createdBy && ids.includes(room.createdBy) ? room.createdBy : null
  const rest = ids.filter((id) => id !== creator).sort()
  return creator ? [creator, ...rest] : rest
}

function nextArtistIndex(room: StoredRoom) {
  const order = rotationOrder(room)
  if (order.length === 0) return 0
  const current = room.artistId ? order.indexOf(room.artistId) : -1
  if (current === -1) return 0
  return (current + 1) % order.length
}

function pinnedHost(room: StoredRoom): StoredRoom {
  const createdBy = room.createdBy ?? room.hostId
  return { ...room, createdBy, hostId: createdBy ?? room.hostId }
}

function isController(room: StoredRoom, senderId: string) {
  return senderId === room.createdBy || senderId === room.hostId
}

function isPresentPlayer(player: Player, now: number) {
  if (typeof player.seenAt !== 'number') return true
  return now - player.seenAt <= STALE_PLAYER_MS
}

function guesserIds(room: StoredRoom) {
  const now = Date.now()
  const ids = Object.keys(room.players).filter((id) => id !== room.artistId)
  const present = ids.filter((id) => {
    const player = room.players[id]
    return player ? isPresentPlayer(player, now) : false
  })
  return present.length > 0 ? present : ids
}

function hasCorrectGuess(room: StoredRoom, playerId: string) {
  return room.guesses.some((guess) => guess.correct && guess.playerId === playerId)
}

function correctGuesserNames(room: StoredRoom) {
  const names: string[] = []
  const seen = new Set<string>()
  for (const guess of room.guesses) {
    if (!guess.correct || seen.has(guess.playerId)) continue
    seen.add(guess.playerId)
    names.push(guess.name)
  }
  return names
}

function allGuessersCorrect(room: StoredRoom) {
  const guessers = guesserIds(room)
  return guessers.length > 0 && guessers.every((id) => hasCorrectGuess(room, id))
}

function formatNameList(names: string[]) {
  if (names.length === 0) return null
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

function visibleGuesses(room: StoredRoom, selfId: string) {
  if (room.phase !== 'drawing') return room.guesses
  return room.guesses.map((guess) => {
    if (!guess.correct || guess.playerId === selfId) return guess
    return { ...guess, text: maskSecret(guess.text) }
  })
}

function turnHasExpired(room: StoredRoom) {
  if (typeof room.drawStartedMs !== 'number') return false
  const turnMs = room.settings.turnSeconds * 1000
  return Date.now() - room.drawStartedMs >= turnMs - 2000
}

function tooEarlyToEndDrawing(room: StoredRoom) {
  if (typeof room.drawStartedMs !== 'number') return true
  return Date.now() - room.drawStartedMs < DRAWING_GRACE_MS
}

export function turnRemainingSeconds(input: {
  drawStartedMs: number | null
  deadlineMs: number | null
  turnSeconds: number
  now?: number
  localStartedMs?: number | null
}) {
  const now = input.now ?? Date.now()
  const turnMs = input.turnSeconds * 1000

  function fromStart(started: number) {
    return Math.max(
      0,
      Math.min(input.turnSeconds, Math.ceil((turnMs - (now - started)) / 1000)),
    )
  }

  if (typeof input.drawStartedMs === 'number') {
    const elapsed = now - input.drawStartedMs
    if (elapsed >= -2000 && elapsed <= turnMs + 5000) {
      return fromStart(input.drawStartedMs)
    }
  }
  if (typeof input.deadlineMs === 'number') {
    const remaining = Math.ceil((input.deadlineMs - now) / 1000)
    if (remaining >= 0 && remaining <= input.turnSeconds + 2) {
      return Math.min(input.turnSeconds, remaining)
    }
  }
  if (typeof input.localStartedMs === 'number') return fromStart(input.localStartedMs)
  return input.turnSeconds
}

export function isSpuriousDrawEnd(prev: StoredRoom, next: StoredRoom) {
  if (prev.phase !== 'drawing') return false
  if (next.phase === 'drawing') return false
  if (next.winnerName) return false
  if (allGuessersCorrect(prev) || allGuessersCorrect(next)) return false
  if (turnHasExpired(prev)) return false
  if (next.collages.length > prev.collages.length) return false
  return true
}

const ROOM_KEYS: (keyof StoredRoom)[] = [
  'phase',
  'hostId',
  'createdBy',
  'players',
  'order',
  'artistIndex',
  'artistId',
  'prompt',
  'options',
  'pieces',
  'guesses',
  'deadlineMs',
  'winnerName',
  'settings',
  'round',
  'guessSerial',
  'collages',
  'votes',
  'guessTimes',
  'drawStartedMs',
]

export function roomPatch(prev: StoredRoom, next: StoredRoom): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const key of ROOM_KEYS) {
    if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
      if (key === 'winnerName' && !next.winnerName && next.phase === 'reveal') continue
      const value = next[key]
      if (Array.isArray(value) && value.length === 0) {
        patch[key] = null
      } else {
        patch[key] = value ?? null
      }
    }
  }
  return patch
}

export function addPlayer(room: StoredRoom, id: string, name: string): StoredRoom | string {
  if (room.players[id]) {
    return pinnedHost({
      ...room,
      players: {
        ...room.players,
        [id]: { ...room.players[id], name, seenAt: Date.now() },
      },
    })
  }
  if (playerCount(room) >= MAX_PLAYERS) return 'This room is full (6 players).'
  return pinnedHost({
    ...room,
    players: {
      ...room.players,
      [id]: { id, name, score: 0, seenAt: Date.now() },
    },
    order: room.order.includes(id) ? room.order : [...room.order, id],
  })
}

export function removePlayer(room: StoredRoom, id: string): StoredRoom {
  const players = { ...room.players }
  delete players[id]
  const ids = Object.keys(players)
  if (ids.length === 0) {
    return emptyRoom(id, 'Artist')
  }
  let next: StoredRoom = pinnedHost({
    ...room,
    players,
    order: room.order.filter((item) => item !== id),
  })
  if (id === next.artistId && (next.phase === 'picking' || next.phase === 'drawing')) {
    if (next.order.length === 0) return clearTurn({ ...next, phase: 'lobby' })
    next = { ...next, artistIndex: next.artistIndex % next.order.length }
    return beginPick(next)
  }
  return next
}

export function staleGuestIds(room: StoredRoom, selfId: string) {
  const now = Date.now()
  return Object.entries(room.players)
    .filter(([id, player]) => {
      if (id === selfId || id === room.createdBy || id === room.hostId) return false
      return typeof player.seenAt === 'number' && !isPresentPlayer(player, now)
    })
    .map(([id]) => id)
}

export function applyMessage(
  room: StoredRoom,
  senderId: string,
  message: ClientMessage,
): StoredRoom | { error: string } {
  const player = room.players[senderId]
  if (!player) return room

  if (message.type === 'settings' && isController(room, senderId) && room.phase === 'lobby') {
    return { ...room, settings: sanitizeGameSettings(message.settings) }
  }

  if (message.type === 'start' && isController(room, senderId) && room.phase === 'lobby') {
    if (playerCount(room) < 2) return { error: 'Need at least two players to start.' }
    const started: StoredRoom = {
      ...room,
      settings: sanitizeGameSettings(message.settings),
      order: rotationOrder(room),
      artistIndex: 0,
      round: 1,
      collages: [],
      votes: {},
      guessTimes: {},
      drawStartedMs: null,
      players: Object.fromEntries(
        Object.values(room.players).map((item) => [item.id, { ...item, score: 0 }]),
      ),
    }
    return beginPick(started)
  }

  if (message.type === 'pick' && room.phase === 'picking' && senderId === room.artistId) {
    if (!room.options || !optionExists(room.options, message.category, message.prompt)) {
      return room
    }
    const now = Date.now()
    return {
      ...room,
      prompt: message.prompt,
      options: null,
      phase: 'drawing',
      deadlineMs: now + room.settings.turnSeconds * 1000,
      drawStartedMs: now,
    }
  }

  if (message.type === 'canvas' && room.phase === 'drawing' && senderId === room.artistId) {
    return { ...room, pieces: message.pieces }
  }

  if (message.type === 'guess' && room.phase === 'drawing' && senderId !== room.artistId) {
    const text = message.text.trim()
    if (!text || !room.prompt) return room
    if (hasCorrectGuess(room, senderId)) return room
    const correct = answersMatch(text, room.prompt)
    const guessSerial = room.guessSerial + 1
    const guess: Guess = {
      id: `g-${senderId}-${guessSerial}`,
      playerId: senderId,
      name: player.name,
      text,
      correct,
    }
    const guesses = [...room.guesses, guess].slice(-40)
    let next: StoredRoom = { ...room, guesses, guessSerial }
    if (!correct) return next
    next = {
      ...next,
      guessTimes: recordGuessTime(next, senderId, player.name),
    }
    if (!allGuessersCorrect(next)) return next
    return endTurn(next)
  }

  if (message.type === 'timesUp') {
    if (room.phase !== 'drawing') return room
    if (allGuessersCorrect(room)) return endTurn(room)
    if (tooEarlyToEndDrawing(room) || !turnHasExpired(room)) return room
    return endTurn(room)
  }

  if (message.type === 'nextTurn') {
    if (room.phase !== 'reveal') return room
    const order = rotationOrder(room)
    if (order.length === 0) return room
    if (room.round >= room.settings.rounds) {
      return beginVoting(room)
    }
    const advanced: StoredRoom = {
      ...room,
      phase: 'reveal',
      order,
      round: room.round + 1,
    }
    return beginPick({ ...advanced, artistIndex: nextArtistIndex(advanced) })
  }

  if (message.type === 'vote' && room.phase === 'voting') {
    const ranks = sanitizeRanks(message.ranks, room.collages)
    const needed = Math.min(3, room.collages.length)
    if (ranks.length < needed) return room
    const next: StoredRoom = {
      ...room,
      votes: { ...room.votes, [senderId]: ranks },
    }
    if (allPlayersVoted(next)) return { ...next, phase: 'finale' }
    return next
  }

  if (message.type === 'backToLobby' && isController(room, senderId)) {
    return clearTurn({ ...room, phase: 'lobby' })
  }

  return room
}

function beginPick(room: StoredRoom): StoredRoom {
  const order = rotationOrder(room)
  if (order.length === 0) return clearTurn({ ...room, phase: 'lobby', order })
  const artistIndex =
    ((room.artistIndex % order.length) + order.length) % order.length
  const artistId = order[artistIndex]
  if (!artistId || !room.players[artistId]) {
    return clearTurn({ ...room, phase: 'lobby', order })
  }
  return {
    ...room,
    order,
    phase: 'picking',
    artistIndex,
    artistId,
    prompt: null,
    options: dealPromptOptions(),
    pieces: [],
    guesses: [],
    deadlineMs: null,
    winnerName: null,
    drawStartedMs: null,
  }
}

function endTurn(room: StoredRoom): StoredRoom {
  return {
    ...room,
    phase: 'reveal',
    deadlineMs: null,
    drawStartedMs: null,
    winnerName: formatNameList(correctGuesserNames(room)),
    collages: archiveCollage(room),
  }
}

function beginVoting(room: StoredRoom): StoredRoom {
  const collages = archiveCollage(room)
  const next: StoredRoom = {
    ...room,
    collages,
    votes: {},
    artistId: null,
    prompt: null,
    options: null,
    pieces: [],
    guesses: [],
    deadlineMs: null,
    winnerName: null,
    drawStartedMs: null,
  }
  if (collages.length < 2) {
    return { ...next, phase: 'finale' }
  }
  return { ...next, phase: 'voting' }
}

function archiveCollage(room: StoredRoom): SavedCollage[] {
  if (room.collages.some((item) => item.id === `c-${room.round}`)) return room.collages
  const artist = room.artistId ? room.players[room.artistId] : undefined
  return [
    ...room.collages,
    {
      id: `c-${room.round}`,
      round: room.round,
      artistId: room.artistId ?? '',
      artistName: artist?.name ?? room.winnerName ?? 'Artist',
      prompt: room.prompt ?? 'untitled',
      pieces: room.pieces,
    },
  ]
}

function recordGuessTime(room: StoredRoom, playerId: string, name: string): Record<string, GuessClock> {
  const started = room.drawStartedMs ?? (room.deadlineMs ? room.deadlineMs - room.settings.turnSeconds * 1000 : Date.now())
  const elapsed = Math.max(1, Date.now() - started)
  const current = room.guessTimes[playerId] ?? { name, times: [] }
  return {
    ...room.guessTimes,
    [playerId]: { name, times: [...current.times, elapsed] },
  }
}

function sanitizeRanks(ranks: string[], collages: SavedCollage[]) {
  const ids = new Set(collages.map((item) => item.id))
  const unique: string[] = []
  for (const id of ranks) {
    if (!ids.has(id) || unique.includes(id)) continue
    unique.push(id)
    if (unique.length === 3) break
  }
  return unique
}

function allPlayersVoted(room: StoredRoom) {
  const ids = Object.keys(room.players)
  if (ids.length === 0) return false
  return ids.every((id) => Array.isArray(room.votes[id]) && (room.votes[id]?.length ?? 0) > 0)
}

function rankFavorites(
  collages: SavedCollage[],
  votes: Record<string, string[]>,
): RankedCollage[] {
  const scores = new Map(collages.map((item) => [item.id, 0]))
  for (const ranks of Object.values(votes)) {
    ranks.slice(0, 3).forEach((id, index) => {
      const points = VOTE_POINTS[index] ?? 0
      scores.set(id, (scores.get(id) ?? 0) + points)
    })
  }
  return [...collages]
    .map((collage) => ({
      ...collage,
      votePoints: scores.get(collage.id) ?? 0,
      place: 0,
    }))
    .sort((a, b) => b.votePoints - a.votePoints || a.round - b.round)
    .slice(0, 3)
    .map((collage, index) => ({ ...collage, place: index + 1 }))
}

function pickGuessChampion(guessTimes: Record<string, GuessClock>): GuessChampion | null {
  let best: GuessChampion | null = null
  for (const clock of Object.values(guessTimes)) {
    if (!clock.times.length) continue
    const averageMs = clock.times.reduce((sum, time) => sum + time, 0) / clock.times.length
    const candidate: GuessChampion = {
      name: clock.name,
      averageMs,
      correctCount: clock.times.length,
    }
    if (
      !best ||
      candidate.averageMs < best.averageMs ||
      (candidate.averageMs === best.averageMs && candidate.correctCount > best.correctCount)
    ) {
      best = candidate
    }
  }
  return best
}

function clearTurn(room: StoredRoom): StoredRoom {
  return {
    ...room,
    artistId: null,
    prompt: null,
    options: null,
    pieces: [],
    guesses: [],
    deadlineMs: null,
    winnerName: null,
    order: rotationOrder(room),
    artistIndex: 0,
    round: 0,
    collages: [],
    votes: {},
    guessTimes: {},
    drawStartedMs: null,
  }
}
