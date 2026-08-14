import { useState } from 'react'
import { CollageStudio } from '../components/CollageStudio'
import type { CollagePiece } from '../game/collage'

type PracticeScreenProps = {
  onLeave: () => void
}

export function PracticeScreen({ onLeave }: PracticeScreenProps) {
  const [pieces, setPieces] = useState<CollagePiece[]>([])

  return (
    <main className="screen practice">
      <header className="practice-header">
        <div>
          <p className="eyebrow">Solo</p>
          <h1>Practice</h1>
        </div>
        <button className="btn ghost compact" type="button" onClick={onLeave}>
          Back
        </button>
      </header>

      <p className="hint">
        Build a picture from ordinary junk. Drag on empty canvas to lasso a
        group, then move them together. Shift-click adds to the selection.
      </p>

      <CollageStudio
        pieces={pieces}
        onPiecesChange={setPieces}
        hint="Drag empty canvas to lasso a group. Shift-click adds to the selection. Right-click a piece for duplicate and layers."
      />
    </main>
  )
}
