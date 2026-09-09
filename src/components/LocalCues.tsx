import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const CUE_MS = 1600

export function LocalCues() {
  const [cue, setCue] = useState<'no-spelling' | null>(null)

  useEffect(() => {
    if (!cue) return
    const timer = window.setTimeout(() => setCue(null), CUE_MS)
    return () => window.clearTimeout(timer)
  }, [cue])

  const stage =
    typeof document === 'undefined' ? null : document.querySelector('.canvas-stage')

  return (
    <>
      <div className="local-cues">
        <p className="local-cues-label">This computer</p>
        <button
          className="btn compact local-cue-btn"
          type="button"
          onClick={() => setCue('no-spelling')}
        >
          No spelling!!!!!
        </button>
      </div>
      {cue === 'no-spelling' && typeof document !== 'undefined'
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
