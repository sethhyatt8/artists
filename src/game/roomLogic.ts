import {
  DEFAULT_SETTINGS,
  MAX_PLAYERS,
  sanitizeGameSettings,
  type ClientMessage,
  type GameSettings,
  type Guess,
  type Phase,
  type Player,
  type RoomState,
} from './protocol'
import {
  answersMatch,
  dealPromptOptions,
  optionExists,
  type CategoryOptions,
} from './prompts'
import type { CollagePiece } from './collage'

export type StoredRoom = {
  phase: Phase
  hostId: string | null
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
}

export function emptyRoom(hostId: string, name: string): StoredRoom {
  return {
    phase: 'lobby',
    hostId,
    players: {
      [hostId]: { id: hostId, name, score: 0, seenAt: Date.now() },
    },
    order: [],
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
  }
}

export function normalizeStoredRoom(raw: unknown): StoredRoom | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<StoredRoom>
  const players = value.players && typeof value.players === 'object' ? value.players : {}
  const phase = value.phase
  if (phase !== 'lobby' && phase !== 'picking' && phase !== 'drawing' && phase !== 'reveal') {
    return null
  }
  return {
    phase,
    hostId: typeof value.hostId === 'string' ? value.hostId : null,
    players,
    order: Array.isArray(value.order) ? value.order : [],
    artistIndex: typeof value.artistIndex === 'number' ? value.artistIndex : 0,
    artistId: typeof value.artistId === 'string' ? value.artistId : null,
    prompt: typeof value.prompt === 'string' ? value.prompt : null,
    options: Array.isArray(value.options) ? value.options : null,
    pieces: Array.isArray(value.pieces) ? value.pieces : [],
    guesses: Array.isArray(value.guesses) ? value.guesses : [],
    deadlineMs: typeof value.deadlineMs === 'number' ? value.deadlineMs : null,
    winnerName: typeof value.winnerName === 'string' ? value.winnerName : null,
    settings: sanitizeGameSettings(value.settings),
    round: typeof value.round === 'number' ? value.round : 0,
    guessSerial: typeof value.guessSerial === 'number' ? value.guessSerial : 0,
  }
}

export function toRoomState(room: StoredRoom, selfId: string, roomCode: string): RoomState {
  const isArtist = selfId === room.artistId
  const showPrompt = isArtist || room.phase === 'reveal'
  const showOptions = isArtist && room.phase === 'picking'
  const players = Object.values(room.players)
  const artist = room.artistId ? room.players[room.artistId] : undefined
  return {
    roomCode,
    phase: room.phase,
    selfId,
    hostId: room.hostId,
    players,
    artistId: room.artistId,
    artistName: artist?.name ?? null,
    prompt: showPrompt ? room.prompt : null,
    options: showOptions ? room.options : null,
    pieces: room.phase === 'lobby' ? [] : room.pieces,
    guesses: room.guesses,
    deadlineMs: room.deadlineMs,
    winnerName: room.winnerName,
    settings: room.settings,
    round: room.round,
  }
}

export function playerCount(room: StoredRoom) {
  return Object.keys(room.players).length
}

export function addPlayer(room: StoredRoom, id: string, name: string): StoredRoom | string {
  if (room.players[id]) {
    return {
      ...room,
      players: {
        ...room.players,
        [id]: { ...room.players[id], name, seenAt: Date.now() },
      },
    }
  }
  if (playerCount(room) >= MAX_PLAYERS) return 'This room is full (6 players).'
  const next: StoredRoom = {
    ...room,
    players: {
      ...room.players,
      [id]: { id, name, score: 0, seenAt: Date.now() },
    },
  }
  if (!next.hostId) next.hostId = id
  if (next.phase !== 'lobby') next.order = [...next.order, id]
  return next
}

export function removePlayer(room: StoredRoom, id: string): StoredRoom {
  const players = { ...room.players }
  delete players[id]
  const ids = Object.keys(players)
  if (ids.length === 0) {
    return emptyRoom(id, 'Artist')
  }
  const next: StoredRoom = {
    ...room,
    players,
    order: room.order.filter((item) => item !== id),
  }
  if (next.hostId === id) next.hostId = ids[0] ?? null
  if (id === next.artistId && (next.phase === 'picking' || next.phase === 'drawing')) {
    if (next.order.length === 0) return clearTurn({ ...next, phase: 'lobby' })
    next.artistIndex %= next.order.length
    return beginPick(next)
  }
  return next
}

export function reconcileRoom(room: StoredRoom): StoredRoom {
  const now = Date.now()
  const players = { ...room.players }
  for (const [id, player] of Object.entries(players)) {
    if (typeof player.seenAt === 'number' && now - player.seenAt > 25_000) {
      delete players[id]
    }
  }
  const ids = Object.keys(players)
  let next: StoredRoom = {
    ...room,
    players,
    order: room.order.filter((id) => players[id]),
  }
  if (ids.length === 0) return next
  if (!next.hostId || !next.players[next.hostId]) {
    next = { ...next, hostId: ids[0] ?? null }
  }
  if (
    next.artistId &&
    !next.players[next.artistId] &&
    (next.phase === 'picking' || next.phase === 'drawing')
  ) {
    if (next.order.length === 0) return clearTurn({ ...next, phase: 'lobby' })
    next = { ...next, artistIndex: next.artistIndex % Math.max(next.order.length, 1) }
    return beginPick(next)
  }
  return next
}

export function applyMessage(
  room: StoredRoom,
  senderId: string,
  message: ClientMessage,
): StoredRoom | { error: string } {
  const player = room.players[senderId]
  if (!player) return room

  if (message.type === 'settings' && senderId === room.hostId && room.phase === 'lobby') {
    return { ...room, settings: sanitizeGameSettings(message.settings) }
  }

  if (message.type === 'start' && senderId === room.hostId && room.phase === 'lobby') {
    if (playerCount(room) < 2) return { error: 'Need at least two players to start.' }
    const started: StoredRoom = {
      ...room,
      settings: sanitizeGameSettings(message.settings),
      order: Object.keys(room.players),
      artistIndex: 0,
      round: 1,
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
    return {
      ...room,
      prompt: message.prompt,
      options: null,
      phase: 'drawing',
      deadlineMs: Date.now() + room.settings.turnSeconds * 1000,
    }
  }

  if (message.type === 'canvas' && room.phase === 'drawing' && senderId === room.artistId) {
    return { ...room, pieces: message.pieces }
  }

  if (message.type === 'guess' && room.phase === 'drawing' && senderId !== room.artistId) {
    const text = message.text.trim()
    if (!text || !room.prompt) return room
    const correct = answersMatch(text, room.prompt)
    const guessSerial = room.guessSerial + 1
    const guess: Guess = {
      id: `g-${guessSerial}`,
      playerId: senderId,
      name: player.name,
      text,
      correct,
    }
    let guesses = [...room.guesses, guess]
    if (guesses.length > 40) guesses = guesses.slice(-40)
    const next: StoredRoom = { ...room, guesses, guessSerial }
    if (!correct) return next
    next.winnerName = player.name
    next.players = {
      ...next.players,
      [senderId]: { ...player, score: player.score + 1 },
    }
    if (next.artistId && next.players[next.artistId]) {
      const artist = next.players[next.artistId]
      next.players[next.artistId] = { ...artist, score: artist.score + 1 }
    }
    return endTurn(next)
  }

  if (message.type === 'timesUp' && room.phase === 'drawing') {
    if (room.deadlineMs && Date.now() + 1500 < room.deadlineMs) return room
    return endTurn(room)
  }

  if (message.type === 'nextTurn' && senderId === room.hostId && room.phase === 'reveal') {
    if (room.round >= room.settings.rounds || room.order.length === 0) {
      return clearTurn({ ...room, phase: 'lobby' })
    }
    const advanced: StoredRoom = { ...room, round: room.round + 1 }
    let artistIndex = advanced.artistIndex
    let tries = 0
    do {
      artistIndex = (artistIndex + 1) % advanced.order.length
      tries += 1
    } while (
      !advanced.players[advanced.order[artistIndex] ?? ''] &&
      tries <= advanced.order.length
    )
    return beginPick({ ...advanced, artistIndex })
  }

  if (message.type === 'backToLobby' && senderId === room.hostId) {
    return clearTurn({ ...room, phase: 'lobby' })
  }

  return room
}

function beginPick(room: StoredRoom): StoredRoom {
  let artistIndex = room.artistIndex
  while (artistIndex < room.order.length && !room.players[room.order[artistIndex] ?? '']) {
    artistIndex += 1
  }
  const artistId = room.order[artistIndex]
  if (!artistId || !room.players[artistId]) {
    return clearTurn({ ...room, phase: 'lobby' })
  }
  return {
    ...room,
    phase: 'picking',
    artistIndex,
    artistId,
    prompt: null,
    options: dealPromptOptions(),
    pieces: [],
    guesses: [],
    deadlineMs: null,
    winnerName: null,
  }
}

function endTurn(room: StoredRoom): StoredRoom {
  return {
    ...room,
    phase: 'reveal',
    deadlineMs: null,
  }
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
    order: [],
    artistIndex: 0,
    round: 0,
  }
}
