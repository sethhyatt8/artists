import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { celebrateDurationMs, characterFor } from '../game/characters'
import type { Guess, Player } from '../game/protocol'
import { CharacterAvatar } from './CharacterAvatar'

type Burst = {
  id: string
  name: string
  characterId?: string
}

type GuessBurstProps = {
  guesses: Guess[]
  players: Player[]
  turnKey: string
}

export function GuessBurst({ guesses, players, turnKey }: GuessBurstProps) {
  const seen = useRef(new Set<string>())
  const keyRef = useRef<string | null>(null)
  const queue = useRef<Burst[]>([])
  const [burst, setBurst] = useState<Burst | null>(null)

  useEffect(() => {
    const correct = guesses.filter((guess) => guess.correct)
    if (keyRef.current !== turnKey) {
      keyRef.current = turnKey
      seen.current = new Set(correct.map((guess) => guess.id))
      queue.current = []
      setBurst(null)
      return
    }
    const incoming: Burst[] = []
    for (const guess of correct) {
      if (seen.current.has(guess.id)) continue
      seen.current.add(guess.id)
      const player = players.find((item) => item.id === guess.playerId)
      incoming.push({
        id: guess.id,
        name: guess.name,
        characterId: player?.characterId,
      })
    }
    if (incoming.length === 0) return
    queue.current.push(...incoming)
    setBurst((current) => current ?? queue.current.shift() ?? null)
  }, [guesses, players, turnKey])

  useEffect(() => {
    if (!burst) return
    const frames = characterFor(burst.characterId, burst.name).celebrateFrames?.length ?? 0
    const timer = window.setTimeout(() => {
      setBurst(queue.current.shift() ?? null)
    }, celebrateDurationMs(frames))
    return () => window.clearTimeout(timer)
  }, [burst])

  if (!burst || typeof document === 'undefined') return null

  const look = characterFor(burst.characterId, burst.name).look

  return createPortal(
    <div className="guess-burst" role="status" aria-live="polite">
      <div className={`guess-burst-card look-${look}`}>
        <div className="guess-burst-sparks" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <span key={index} className={`guess-burst-spark spark-${index + 1}`} />
          ))}
        </div>
        <div className="guess-burst-puppet">
          <CharacterAvatar
            characterId={burst.characterId}
            name={burst.name}
            size={280}
            className="guess-burst-face"
            mood="surprise"
          />
        </div>
        <p className="guess-burst-name">{burst.name}</p>
        <p className="guess-burst-got">got it!</p>
      </div>
    </div>,
    document.body,
  )
}
