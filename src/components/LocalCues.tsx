import { useEffect, useRef, useState } from 'react'
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
  const seenAt = useRef<number | null>(null)

  useEffect(() => {
    if (!cue || cue.kind !== 'no-spelling') return
    if (seenAt.current === cue.at) return
    if (seenAt.current === null && Date.now() - cue.at > CUE_MS) {
      seenAt.current = cue.at
      return
    }
    seenAt.current = cue.at
    setVisible(true)
    const timer = window.setTimeout(() => setVisible(false), CUE_MS)
    return () => window.clearTimeout(timer)
  }, [cue])

  const stage =
    typeof document === 'undefined' ? null : document.querySelector('.canvas-stage')

  return (
    <>
      <div className="local-cues">
        <button className="btn compact local-cue-btn" type="button" onClick={onCue}>
          No spelling!!!!!
        </button>
      </div>
      {visible && typeof document !== 'undefined'
        ? createPortal(
            <div className="local-cue-overlay" role="status" aria-live="assertive">
              <p className="local-cue-stamp">NO SPELLING!!!!!</p>
            </div>,
            stage ?? document.body,
          )
        : null}
    </>
  )
}
