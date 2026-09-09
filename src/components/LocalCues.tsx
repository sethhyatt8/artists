import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RoomCue } from '../game/protocol'

const CUE_MS = 2200

export function LocalCues({
  cue,
  onCue,
  showButton,
}: {
  cue?: RoomCue | null
  onCue: () => void
  showButton: boolean
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!cue || cue.kind !== 'no-spelling') return
    const age = Date.now() - cue.at
    if (age > 5000) return
    setVisible(true)
    const timer = window.setTimeout(() => setVisible(false), CUE_MS)
    return () => window.clearTimeout(timer)
  }, [cue?.at, cue?.kind])

  function fire() {
    setVisible(true)
    window.setTimeout(() => setVisible(false), CUE_MS)
    onCue()
  }

  return (
    <>
      {showButton ? (
        <div className="local-cues">
          <p className="local-cues-label">This computer</p>
          <button className="btn compact local-cue-btn" type="button" onClick={fire}>
            No spelling!!!!!
          </button>
        </div>
      ) : null}
      {visible && typeof document !== 'undefined'
        ? createPortal(
            <div className="local-cue-overlay" role="status" aria-live="assertive">
              <p className="local-cue-stamp">NO SPELLING!!!!!</p>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
