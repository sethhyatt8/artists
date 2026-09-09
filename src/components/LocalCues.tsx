import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RoomCue } from '../game/protocol'

const CUE_MS = 1600

export function LocalCues({
  cue,
  onCue,
}: {
  cue?: RoomCue | null
  onCue: () => void
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
      <div className="local-cues">
        <button className="btn compact local-cue-btn" type="button" onClick={fire}>
          No spelling!!!!!
        </button>
      </div>
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
