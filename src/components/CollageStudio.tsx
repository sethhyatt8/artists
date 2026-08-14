import { type ReactNode, useState } from 'react'
import { CollageCanvas } from './CollageCanvas'
import { PieceGlyph } from './PieceGlyph'
import {
  JUNK_OPTIONS,
  LETTER_KINDS,
  PALETTE,
  SHAPE_OPTIONS,
  clampPieceSize,
  createPiece,
  type CollagePiece,
  type PieceKind,
  type ShapeKind,
} from '../game/collage'
import type { ShapeSet } from '../game/protocol'

type CollageStudioProps = {
  pieces: CollagePiece[]
  onPiecesChange: (pieces: CollagePiece[]) => void
  extraRight?: ReactNode
  hint?: string
  locked?: boolean
  shapeSet?: ShapeSet | 'all'
}

export function CollageStudio({
  pieces,
  onPiecesChange,
  extraRight,
  hint,
  locked = false,
  shapeSet = 'all',
}: CollageStudioProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [color, setColor] = useState<string>(PALETTE[0])
  const showRegular = shapeSet === 'regular' || shapeSet === 'all'
  const showWeird = shapeSet === 'weird' || shapeSet === 'all'
  const showLetters = shapeSet === 'letters' || shapeSet === 'all'
  const selected = selectedIds.length > 0 && !locked

  function addPiece(kind: PieceKind) {
    if (locked) return
    const piece = createPiece(kind, color, pieces.length)
    onPiecesChange([...pieces, piece])
    setSelectedIds([piece.id])
  }

  function applyColor(next: string) {
    setColor(next)
    if (locked || selectedIds.length === 0) return
    const idSet = new Set(selectedIds)
    onPiecesChange(
      pieces.map((piece) =>
        idSet.has(piece.id) ? { ...piece, color: next } : piece,
      ),
    )
  }

  function rotateSelected(delta: number) {
    if (locked || selectedIds.length === 0) return
    const idSet = new Set(selectedIds)
    onPiecesChange(
      pieces.map((piece) =>
        idSet.has(piece.id)
          ? { ...piece, rotation: piece.rotation + delta }
          : piece,
      ),
    )
  }

  function scaleSelected(factor: number) {
    if (locked || selectedIds.length === 0) return
    const idSet = new Set(selectedIds)
    onPiecesChange(
      pieces.map((piece) => {
        if (!idSet.has(piece.id)) return piece
        const width = clampPieceSize(piece.width * factor)
        const ratio = piece.height / piece.width
        return {
          ...piece,
          width,
          height: clampPieceSize(width * ratio),
        }
      }),
    )
  }

  function deleteSelected() {
    if (locked || selectedIds.length === 0) return
    const idSet = new Set(selectedIds)
    onPiecesChange(pieces.filter((piece) => !idSet.has(piece.id)))
    setSelectedIds([])
  }

  return (
    <div className="practice-body">
      <aside className="sidebar sidebar-left">
        {showRegular ? (
          <>
            <p className="drawer-label">Shapes</p>
            <div className="shape-row">
              {SHAPE_OPTIONS.map((shape) => (
                <button
                  key={shape.kind}
                  className="shape-btn"
                  type="button"
                  disabled={locked}
                  aria-label={`Add ${shape.label}`}
                  onClick={() => addPiece(shape.kind)}
                >
                  <ShapeIcon kind={shape.kind} color={color} />
                </button>
              ))}
            </div>
          </>
        ) : null}

        {showWeird ? (
          <>
            <p className="drawer-label">Junk drawer</p>
            <div className="shape-row junk-row">
              {JUNK_OPTIONS.map((item) => (
                <button
                  key={item.kind}
                  className="shape-btn"
                  type="button"
                  disabled={locked}
                  aria-label={`Add ${item.label}`}
                  title={item.label}
                  onClick={() => addPiece(item.kind)}
                >
                  <PieceGlyph kind={item.kind} color={color} />
                </button>
              ))}
            </div>
          </>
        ) : null}

        {showLetters ? (
          <>
            <p className="drawer-label">Letters</p>
            <div className="shape-row letter-row">
              {LETTER_KINDS.map((letter) => (
                <button
                  key={letter}
                  className="shape-btn"
                  type="button"
                  disabled={locked}
                  aria-label={`Add letter ${letter}`}
                  onClick={() => addPiece(letter)}
                >
                  <LetterGlyph letter={letter} color={color} />
                </button>
              ))}
            </div>
          </>
        ) : null}
      </aside>

      <div className="canvas-stage">
        <CollageCanvas
          pieces={pieces}
          selectedIds={locked ? [] : selectedIds}
          onPiecesChange={onPiecesChange}
          onSelect={setSelectedIds}
          readOnly={locked}
        />
      </div>

      <aside className="sidebar sidebar-right">
        {extraRight}
        {hint ? <p className="sidebar-hint">{hint}</p> : null}
        <p className="drawer-label">Color</p>
        <div className="palette-row">
          {PALETTE.map((swatch) => (
            <button
              key={swatch}
              className={swatch === color ? 'swatch active' : 'swatch'}
              type="button"
              disabled={locked}
              aria-label={`Color ${swatch}`}
              style={{ background: swatch }}
              onClick={() => applyColor(swatch)}
            />
          ))}
        </div>

        <p className="drawer-label">Edit</p>
        <div className="transform-row">
          <button
            className="btn ghost compact"
            type="button"
            disabled={!selected}
            onClick={() => rotateSelected(-15)}
          >
            Rotate left
          </button>
          <button
            className="btn ghost compact"
            type="button"
            disabled={!selected}
            onClick={() => rotateSelected(15)}
          >
            Rotate right
          </button>
          <button
            className="btn ghost compact"
            type="button"
            disabled={!selected}
            onClick={() => scaleSelected(0.85)}
          >
            Smaller
          </button>
          <button
            className="btn ghost compact"
            type="button"
            disabled={!selected}
            onClick={() => scaleSelected(1.15)}
          >
            Bigger
          </button>
          <button
            className="btn ghost compact"
            type="button"
            disabled={!selected}
            onClick={deleteSelected}
          >
            Delete
          </button>
        </div>
      </aside>
    </div>
  )
}

function ShapeIcon({ kind, color }: { kind: ShapeKind; color: string }) {
  const common = { fill: color, stroke: '#c4b09a', strokeWidth: 1.5 }
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      {kind === 'circle' ? <circle cx="16" cy="16" r="11" {...common} /> : null}
      {kind === 'square' ? (
        <rect x="6" y="6" width="20" height="20" {...common} />
      ) : null}
      {kind === 'round' ? (
        <rect x="5" y="8" width="22" height="16" rx="6" {...common} />
      ) : null}
      {kind === 'triangle' ? (
        <polygon points="16,5 27,26 5,26" {...common} />
      ) : null}
      {kind === 'diamond' ? (
        <polygon points="16,4 28,16 16,28 4,16" {...common} />
      ) : null}
      {kind === 'hex' ? (
        <polygon points="10,6 22,6 28,16 22,26 10,26 4,16" {...common} />
      ) : null}
    </svg>
  )
}

function LetterGlyph({ letter, color }: { letter: string; color: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <text
        x="16"
        y="18"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={color}
        fontFamily="Arial Black, Impact, sans-serif"
        fontSize="20"
        fontWeight={800}
      >
        {letter}
      </text>
    </svg>
  )
}
