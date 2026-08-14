import { JUNK_OPTIONS, getJunkDef, isJunkKind, type JunkKind } from './junkCatalog'

export { JUNK_OPTIONS, isJunkKind }
export type { JunkKind }

export const SHAPE_KINDS = [
  'circle',
  'square',
  'round',
  'triangle',
  'diamond',
  'hex',
] as const

export const LETTER_KINDS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
] as const

export type ShapeKind = (typeof SHAPE_KINDS)[number]
export type LetterKind = (typeof LETTER_KINDS)[number]
export type PieceKind = ShapeKind | JunkKind | LetterKind

export function isShapeKind(kind: string): kind is ShapeKind {
  return (SHAPE_KINDS as readonly string[]).includes(kind)
}

export function isLetterKind(kind: string): kind is LetterKind {
  return (LETTER_KINDS as readonly string[]).includes(kind)
}

export function isPieceKind(kind: string): kind is PieceKind {
  return isShapeKind(kind) || isJunkKind(kind) || isLetterKind(kind)
}

export type CollagePiece = {
  id: string
  kind: PieceKind
  x: number
  y: number
  width: number
  height: number
  rotation: number
  color: string
}

export const CANVAS_SIZE = 1000
export const MIN_PIECE_SIZE = 16
export const MAX_PIECE_SIZE = 900

export const PALETTE = [
  '#e07a3d',
  '#c45c26',
  '#d7b56d',
  '#f4e6d3',
  '#8b3a3a',
  '#2f5d50',
  '#3d6ea8',
  '#1e3a5f',
  '#6b7c3a',
  '#4a3728',
  '#1a1410',
  '#ffffff',
] as const

export const SHAPE_OPTIONS: { kind: ShapeKind; label: string }[] = [
  { kind: 'circle', label: 'Circle' },
  { kind: 'square', label: 'Square' },
  { kind: 'round', label: 'Round' },
  { kind: 'triangle', label: 'Triangle' },
  { kind: 'diamond', label: 'Diamond' },
  { kind: 'hex', label: 'Hexagon' },
]

export function clampPieceSize(size: number) {
  return Math.min(MAX_PIECE_SIZE, Math.max(MIN_PIECE_SIZE, size))
}

export function newPieceId(salt = 0) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `piece-${Date.now()}-${salt}`
}

export function createPiece(
  kind: PieceKind,
  color: string,
  existingCount: number,
): CollagePiece {
  const offset = (existingCount % 5) * 28 - 56
  const { width, height } = defaultSize(kind)
  return {
    id: newPieceId(existingCount),
    kind,
    x: CANVAS_SIZE / 2 + offset,
    y: CANVAS_SIZE / 2 + offset * 0.4,
    width,
    height,
    rotation: 0,
    color,
  }
}

function defaultSize(kind: PieceKind) {
  if (isLetterKind(kind)) {
    return { width: 120, height: 150 }
  }
  if (isJunkKind(kind)) {
    const aspect = getJunkDef(kind).aspect
    const long = 176
    if (aspect >= 1) {
      return { width: long, height: long / aspect }
    }
    return { width: long * aspect, height: long }
  }
  const base = kind === 'circle' || kind === 'hex' ? 150 : 160
  return {
    width: base,
    height: kind === 'round' ? base * 0.72 : base,
  }
}

export function duplicatePiece(piece: CollagePiece): CollagePiece {
  return {
    ...piece,
    id: newPieceId(),
    x: piece.x + 28,
    y: piece.y + 28,
  }
}

export function movePieceToFront(pieces: CollagePiece[], id: string) {
  const piece = pieces.find((item) => item.id === id)
  if (!piece) return pieces
  return [...pieces.filter((item) => item.id !== id), piece]
}

export function movePieceToBack(pieces: CollagePiece[], id: string) {
  const piece = pieces.find((item) => item.id === id)
  if (!piece) return pieces
  return [piece, ...pieces.filter((item) => item.id !== id)]
}

export type Rect = {
  x: number
  y: number
  width: number
  height: number
}

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  }
}

export function pieceAabb(piece: CollagePiece): Rect {
  const radius = Math.hypot(piece.width, piece.height) / 2
  return {
    x: piece.x - radius,
    y: piece.y - radius,
    width: radius * 2,
    height: radius * 2,
  }
}

export function rectsOverlap(a: Rect, b: Rect) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

export function idsInRect(pieces: CollagePiece[], rect: Rect) {
  return pieces.filter((piece) => rectsOverlap(pieceAabb(piece), rect)).map((piece) => piece.id)
}

export function groupBounds(pieces: CollagePiece[]): Rect | null {
  if (pieces.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const piece of pieces) {
    const box = pieceAabb(piece)
    minX = Math.min(minX, box.x)
    minY = Math.min(minY, box.y)
    maxX = Math.max(maxX, box.x + box.width)
    maxY = Math.max(maxY, box.y + box.height)
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

export function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
}

export function hitTestPiece(piece: CollagePiece, x: number, y: number) {
  const dx = x - piece.x
  const dy = y - piece.y
  const rad = (-piece.rotation * Math.PI) / 180
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad)
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad)
  const hw = piece.width / 2
  const hh = piece.height / 2

  if (hw <= 0 || hh <= 0) return false

  if (piece.kind === 'circle') {
    return (lx / hw) ** 2 + (ly / hh) ** 2 <= 1
  }

  if (piece.kind === 'diamond') {
    return Math.abs(lx) / hw + Math.abs(ly) / hh <= 1
  }

  if (piece.kind === 'triangle') {
    return pointInTriangle(lx, ly, hw, hh)
  }

  if (piece.kind === 'hex') {
    return pointInHex(lx, ly, hw, hh)
  }

  if (piece.kind === 'round') {
    const radius = Math.min(hw, hh) * 0.35
    return pointInRoundedRect(lx, ly, hw, hh, radius)
  }

  return Math.abs(lx) <= hw && Math.abs(ly) <= hh
}

function pointInTriangle(x: number, y: number, hw: number, hh: number) {
  const ax = 0
  const ay = -hh
  const bx = -hw
  const by = hh
  const cx = hw
  const cy = hh
  const d1 = sign(x, y, ax, ay, bx, by)
  const d2 = sign(x, y, bx, by, cx, cy)
  const d3 = sign(x, y, cx, cy, ax, ay)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

function sign(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  return (x - x2) * (y1 - y2) - (x1 - x2) * (y - y2)
}

function pointInHex(x: number, y: number, hw: number, hh: number) {
  const nx = Math.abs(x) / hw
  const ny = Math.abs(y) / hh
  return ny <= 1 && nx <= 1 && nx * 0.5 + ny <= 1
}

function pointInRoundedRect(
  x: number,
  y: number,
  hw: number,
  hh: number,
  radius: number,
) {
  const ax = Math.abs(x)
  const ay = Math.abs(y)
  if (ax <= hw - radius && ay <= hh) return true
  if (ay <= hh - radius && ax <= hw) return true
  const dx = ax - (hw - radius)
  const dy = ay - (hh - radius)
  return dx * dx + dy * dy <= radius * radius
}
