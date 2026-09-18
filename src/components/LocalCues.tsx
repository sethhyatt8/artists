import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Player, RoomCue } from '../game/protocol'
import { remainingLockSeconds } from '../game/roomLogic'
import { CharacterAvatar } from './CharacterAvatar'

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
  mutedUntil,
  players = [],
  selfId,
  artistId,
  onCue,
  onClearGuesses,
  onMutePlayer,
  showButton,
}: {
  cue?: RoomCue | null
  quietUntil?: number | null
  mutedUntil?: Record<string, number>
  players?: Player[]
  selfId?: string
  artistId?: string | null
  onCue: () => void
  onClearGuesses: () => void
  onMutePlayer?: (playerId: string) => void
  showButton: boolean
}) {
  const [visible, setVisible] = useState(false)
  const [stamp, setStamp] = useState('NO SPELLING!!!!!')
  const [now, setNow] = useState(() => Date.now())
  const quietLeft = remainingLockSeconds(quietUntil, now)
  const muteTargets = players.filter(
    (player) => player.id !== selfId && player.id !== artistId,
  )

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
    if (!showButton) return
    const tick = () => setNow(Date.now())
    tick()
    const muteActive = Object.values(mutedUntil ?? {}).some((until) => until > Date.now())
    const quietActive = typeof quietUntil === 'number' && quietUntil > Date.now()
    if (!muteActive && !quietActive) return
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [showButton, quietUntil, mutedUntil])

  function flash(next: string) {
    setStamp(next)
    setVisible(true)
    window.setTimeout(() => setVisible(false), CUE_MS)
  }

  function fireNoSpelling() {
    flash('NO SPELLING!!!!!')
    onCue()
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
          <p className="local-cues-label">Mod · this computer</p>
          {onMutePlayer && muteTargets.length > 0 ? (
            <div className="local-cue-people">
              {muteTargets.map((player) => {
                const mutedLeft = remainingLockSeconds(mutedUntil?.[player.id], now)
                return (
                  <button
                    key={player.id}
                    className={mutedLeft > 0 ? 'local-cue-person is-muted' : 'local-cue-person'}
                    type="button"
                    disabled={mutedLeft > 0}
                    onClick={() => onMutePlayer(player.id)}
                    title={`Mute ${player.name} for 30 seconds`}
                  >
                    <CharacterAvatar
                      characterId={player.characterId}
                      name={player.name}
                      size={36}
                    />
                    <span>{mutedLeft > 0 ? `${mutedLeft}s` : `Mute ${player.name}`}</span>
                  </button>
                )
              })}
            </div>
          ) : null}
          <div className="local-cue-row">
            <button className="btn compact local-cue-btn" type="button" onClick={fireNoSpelling}>
              No spelling!!!!!
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
