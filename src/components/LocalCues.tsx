import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { QuietSeconds, RoomCue } from '../game/protocol'
import { remainingLockSeconds } from '../game/roomLogic'

const CUE_MS = 2200

function stampFromCue(cue: RoomCue) {
  if (cue.kind === 'quiet') return cue.seconds === 30 ? 'QUIET 30!!!!!' : 'QUIET!!!!!'
  if (cue.kind === 'mute') {
    const name = (cue.name ?? '').trim().slice(0, 10).toUpperCase()
    return name ? `SHHH ${name}!!!!!` : 'SHHH!!!!!'
  }
  if (cue.kind === 'cleared') return 'NICE TRY'
  return 'NO SPELLING!!!!!'
}

export function LocalCues({
  cue,
  quietUntil,
  onCue,
  onQuiet,
  onClearGuesses,
  showButton,
}: {
  cue?: RoomCue | null
  quietUntil?: number | null
  onCue: () => void
  onQuiet: (seconds: QuietSeconds) => void
  onClearGuesses: () => void
  showButton: boolean
}) {
  const [visible, setVisible] = useState(false)
  const [stamp, setStamp] = useState('NO SPELLING!!!!!')
  const [now, setNow] = useState(() => Date.now())
  const quietLeft = remainingLockSeconds(quietUntil, now)

  useEffect(() => {
    if (!cue) return
    const age = Date.now() - cue.at
    if (age > 5000) return
    setStamp(stampFromCue(cue))
    setVisible(true)
    const timer = window.setTimeout(() => setVisible(false), CUE_MS)
    return () => window.clearTimeout(timer)
  }, [cue?.at, cue?.kind, cue?.seconds, cue?.name])

  useEffect(() => {
    if (!showButton || quietLeft <= 0) return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [showButton, quietLeft])

  function flash(next: string) {
    setStamp(next)
    setVisible(true)
    window.setTimeout(() => setVisible(false), CUE_MS)
  }

  function fireNoSpelling() {
    flash('NO SPELLING!!!!!')
    onCue()
  }

  function fireQuiet(seconds: QuietSeconds) {
    flash(seconds === 30 ? 'QUIET 30!!!!!' : 'QUIET!!!!!')
    onQuiet(seconds)
  }

  function fireClear() {
    flash('NICE TRY')
    onClearGuesses()
  }

  const wideStamp = stamp.length > 14

  return (
    <>
      {showButton ? (
        <div className="local-cues">
          <p className="local-cues-label">This computer</p>
          <div className="local-cue-row">
            <button className="btn compact local-cue-btn" type="button" onClick={fireNoSpelling}>
              No spelling!!!!!
            </button>
            <button className="btn compact local-cue-btn" type="button" onClick={() => fireQuiet(10)}>
              Quiet 10s
            </button>
            <button className="btn compact local-cue-btn" type="button" onClick={() => fireQuiet(30)}>
              Quiet 30s
            </button>
            <button className="btn compact ghost local-cue-btn" type="button" onClick={fireClear}>
              Clear guesses
            </button>
          </div>
          {quietLeft > 0 ? (
            <p className="local-cues-status">Quiet {quietLeft}s</p>
          ) : null}
        </div>
      ) : null}
      {visible && typeof document !== 'undefined'
        ? createPortal(
            <div className="local-cue-overlay" role="status" aria-live="assertive">
              <p className={wideStamp ? 'local-cue-stamp is-wide' : 'local-cue-stamp'}>{stamp}</p>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
