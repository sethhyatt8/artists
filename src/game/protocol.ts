import { isPieceKind, type CollagePiece } from './collage'
import type { CategoryOptions } from './prompts'

export const MAX_PLAYERS = 6
export const MAX_NAME_LENGTH = 20
export const ROOM_CODE_LENGTH = 4
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const MAX_GUESS_LENGTH = 48
export const MIN_ROUNDS = 1
export const MAX_ROUNDS = 10
export const TURN_SECONDS_OPTIONS = [60, 90, 120, 180] as const

export const SHAPE_SET = {
  regular: 'regular',
  weird: 'weird',
  letters: 'letters',
} as const

export type ShapeSet = (typeof SHAPE_SET)[keyof typeof SHAPE_SET]

export type GameSettings = {
  shapeSet: ShapeSet
  turnSeconds: number
  rounds: number
}

export const DEFAULT_SETTINGS: GameSettings = {
  shapeSet: 'weird',
  turnSeconds: 90,
  rounds: 4,
}

export const PHASE = {
  lobby: 'lobby',
  picking: 'picking',
  drawing: 'drawing',
  reveal: 'reveal',
  voting: 'voting',
  finale: 'finale',
} as const

export type Phase = (typeof PHASE)[keyof typeof PHASE]

export type Player = {
  id: string
  name: string
  score: number
  seenAt?: number
}

export type Guess = {
  id: string
  playerId: string
  name: string
  text: string
  correct: boolean
}

export type SavedCollage = {
  id: string
  round: number
  artistId: string
  artistName: string
  prompt: string
  pieces: CollagePiece[]
}

export type RankedCollage = SavedCollage & {
  votePoints: number
  place: number
}

export type GuessChampion = {
  name: string
  averageMs: number
  correctCount: number
}

export type RoomState = {
  roomCode: string
  phase: Phase
  selfId: string
  hostId: string | null
  createdBy: string | null
  players: Player[]
  artistId: string | null
  artistName: string | null
  prompt: string | null
  options: CategoryOptions[] | null
  pieces: CollagePiece[]
  guesses: Guess[]
  deadlineMs: number | null
  drawStartedMs: number | null
  winnerName: string | null
  settings: GameSettings
  round: number
  collages: SavedCollage[]
  myVote: string[] | null
  votedCount: number
  voterCount: number
  favorites: RankedCollage[]
  guessChampion: GuessChampion | null
}

export type ClientMessage =
  | { type: 'start'; settings: GameSettings }
  | { type: 'settings'; settings: GameSettings }
  | { type: 'pick'; category: string; prompt: string }
  | { type: 'canvas'; pieces: CollagePiece[] }
  | { type: 'guess'; text: string }
  | { type: 'timesUp' }
  | { type: 'nextTurn' }
  | { type: 'vote'; ranks: string[] }
  | { type: 'backToLobby' }

export type ServerMessage =
  | { type: 'state'; state: RoomState }
  | { type: 'error'; message: string }

export function sanitizeName(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!trimmed) return 'Artist'
  return trimmed.slice(0, MAX_NAME_LENGTH)
}

export function normalizeRoomCode(raw: string | null | undefined): string {
  return (raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH)
}

export function parseClientMessage(data: unknown): ClientMessage | null {
  if (typeof data !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(data)
    if (!isRecord(parsed) || typeof parsed.type !== 'string') return null
    if (
      parsed.type === 'timesUp' ||
      parsed.type === 'nextTurn' ||
      parsed.type === 'backToLobby'
    ) {
      return { type: parsed.type }
    }
    if (parsed.type === 'start' || parsed.type === 'settings') {
      return { type: parsed.type, settings: sanitizeGameSettings(parsed.settings) }
    }
    if (
      parsed.type === 'pick' &&
      typeof parsed.category === 'string' &&
      typeof parsed.prompt === 'string'
    ) {
      return {
        type: 'pick',
        category: parsed.category,
        prompt: parsed.prompt.slice(0, 80),
      }
    }
    if (parsed.type === 'guess' && typeof parsed.text === 'string') {
      return { type: 'guess', text: parsed.text.slice(0, MAX_GUESS_LENGTH) }
    }
    if (parsed.type === 'vote' && Array.isArray(parsed.ranks)) {
      const ranks: string[] = []
      for (const item of parsed.ranks) {
        if (typeof item !== 'string' || ranks.includes(item)) continue
        ranks.push(item)
        if (ranks.length === 3) break
      }
      return { type: 'vote', ranks }
    }
    if (parsed.type === 'canvas' && Array.isArray(parsed.pieces)) {
      const pieces: CollagePiece[] = []
      for (const item of parsed.pieces) {
        if (!isCollagePiece(item)) return null
        pieces.push(item)
      }
      return { type: 'canvas', pieces }
    }
    return null
  } catch {
    return null
  }
}

export function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(data)
    if (!isRecord(parsed) || typeof parsed.type !== 'string') return null
    if (parsed.type === 'error' && typeof parsed.message === 'string') {
      return { type: 'error', message: parsed.message }
    }
    if (parsed.type === 'state' && isRoomState(parsed.state)) {
      return { type: 'state', state: parsed.state }
    }
    return null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCollagePiece(value: unknown): value is CollagePiece {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.kind === 'string' &&
    isPieceKind(value.kind) &&
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    typeof value.rotation === 'number' &&
    typeof value.color === 'string'
  )
}

function isPlayer(value: unknown): value is Player {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.score === 'number'
  )
}

function isGuess(value: unknown): value is Guess {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.playerId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.text === 'string' &&
    typeof value.correct === 'boolean'
  )
}

function isCategoryOptions(value: unknown): value is CategoryOptions {
  if (!isRecord(value)) return false
  if (typeof value.category !== 'string' || !Array.isArray(value.prompts)) return false
  return value.prompts.every((item) => typeof item === 'string')
}

function isRoomState(value: unknown): value is RoomState {
  if (!isRecord(value)) return false
  if (typeof value.roomCode !== 'string') return false
  if (typeof value.selfId !== 'string') return false
  if (
    value.phase !== 'lobby' &&
    value.phase !== 'picking' &&
    value.phase !== 'drawing' &&
    value.phase !== 'reveal' &&
    value.phase !== 'voting' &&
    value.phase !== 'finale'
  ) {
    return false
  }
  if (value.hostId !== null && typeof value.hostId !== 'string') return false
  if (value.artistId !== null && typeof value.artistId !== 'string') return false
  if (value.artistName !== null && typeof value.artistName !== 'string') return false
  if (value.prompt !== null && typeof value.prompt !== 'string') return false
  if (value.options !== null) {
    if (!Array.isArray(value.options) || !value.options.every(isCategoryOptions)) {
      return false
    }
  }
  if (!Array.isArray(value.players) || !value.players.every(isPlayer)) return false
  if (!Array.isArray(value.pieces) || !value.pieces.every(isCollagePiece)) return false
  if (!Array.isArray(value.guesses) || !value.guesses.every(isGuess)) return false
  if (value.deadlineMs !== null && typeof value.deadlineMs !== 'number') return false
  if (value.drawStartedMs !== null && typeof value.drawStartedMs !== 'number') return false
  if (value.winnerName !== null && typeof value.winnerName !== 'string') return false
  if (typeof value.round !== 'number') return false
  if (!isGameSettings(value.settings)) return false
  return true
}

export function sanitizeGameSettings(raw: unknown): GameSettings {
  const record = isRecord(raw) ? raw : {}
  const turnSeconds = (TURN_SECONDS_OPTIONS as readonly number[]).includes(
    record.turnSeconds as number,
  )
    ? (record.turnSeconds as number)
    : DEFAULT_SETTINGS.turnSeconds
  const rounds =
    typeof record.rounds === 'number' && Number.isFinite(record.rounds)
      ? Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, Math.round(record.rounds)))
      : DEFAULT_SETTINGS.rounds
  return {
    shapeSet:
      record.shapeSet === 'regular' || record.shapeSet === 'letters'
        ? record.shapeSet
        : 'weird',
    turnSeconds,
    rounds,
  }
}

function isGameSettings(value: unknown): value is GameSettings {
  if (!isRecord(value)) return false
  if (value.shapeSet !== 'regular' && value.shapeSet !== 'weird' && value.shapeSet !== 'letters') {
    return false
  }
  if (typeof value.turnSeconds !== 'number') return false
  if (typeof value.rounds !== 'number') return false
  return true
}
