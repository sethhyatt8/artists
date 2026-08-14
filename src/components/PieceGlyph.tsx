import { getJunkDef, type JunkKind } from '../game/junkCatalog'

type PiecePathsProps = {
  kind: JunkKind
  color: string
}

export function PiecePaths({ kind, color }: PiecePathsProps) {
  const def = getJunkDef(kind)
  return (
    <>
      {def.paths.map((d, index) => (
        <path
          key={index}
          d={d}
          fill={color}
          fillRule={def.fillRule}
          stroke="#1a1410"
          strokeWidth="1.5"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </>
  )
}

export function PieceGlyph({ kind, color }: PiecePathsProps) {
  return (
    <svg viewBox="-50 -50 100 100" aria-hidden="true">
      <PiecePaths kind={kind} color={color} />
    </svg>
  )
}
