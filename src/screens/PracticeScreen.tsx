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
        Build a picture from ordinary junk. On a phone, pinch to resize and
        twist two fingers to rotate. Drag empty canvas to lasso a group.
      </p>

      <CollageStudio
        pieces={pieces}
        onPiecesChange={setPieces}
        hint="Drag empty canvas to lasso a group. On a phone, pinch to resize and twist two fingers to rotate. Ctrl+Z / Cmd+Z undoes."
      />
    </main>
  )
}
