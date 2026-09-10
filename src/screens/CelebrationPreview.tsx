import { useEffect, useState } from 'react'
import { CharacterAvatar } from '../components/CharacterAvatar'
import { CHARACTERS } from '../game/characters'

const LABELS: Record<string, string> = {
  seth: 'gasp',
  emily: 'dab',
  harper: 'hair whip',
  jaxon: 'thumbs up',
  eloise: 'big smile',
  julia: 'glasses pulse',
}

const JULIA_PINKY_FRAMES = [
  'julia-pinky-f1.png',
  'julia-pinky-f2.png',
  'julia-pinky-f1.png',
  'julia-pinky-f3.png',
  'julia-pinky-f1.png',
]

type CelebrationPreviewProps = {
  onLeave: () => void
}

export function CelebrationPreview({ onLeave }: CelebrationPreviewProps) {
  const [play, setPlay] = useState(0)

  useEffect(() => {
    document.body.classList.add('preview-motion')
    return () => document.body.classList.remove('preview-motion')
  }, [])

  return (
    <main className="screen celebration-preview">
      <header className="room-header">
        <div>
          <p className="eyebrow">Preview</p>
          <h1>Celebrate poses</h1>
        </div>
        <div className="celebration-actions">
          <button className="btn compact" type="button" onClick={() => setPlay((n) => n + 1)}>
            Replay
          </button>
          <button className="btn ghost compact" type="button" onClick={onLeave}>
            Back
          </button>
        </div>
      </header>
      <p className="lede">Play once. Replay to watch again. Pinky-up is a trial only — idle portraits stay handless, and it is not in the live game yet.</p>
      <div className="celebration-grid">
        {CHARACTERS.map((character) => (
          <figure key={`${character.id}-${play}`} className="celebration-card">
            <CharacterAvatar
              characterId={character.id}
              name={character.name}
              size={200}
              mood="surprise"
            />
            <figcaption>
              <strong>{character.name}</strong>
              <span>{LABELS[character.id]}</span>
            </figcaption>
          </figure>
        ))}
        <figure key={`julia-pinky-${play}`} className="celebration-card">
          <CharacterAvatar
            characterId="julia"
            name="Julia"
            size={200}
            mood="surprise"
            poseFrames={JULIA_PINKY_FRAMES}
          />
          <figcaption>
            <strong>Julia</strong>
            <span>pinky-up (trial)</span>
          </figcaption>
        </figure>
      </div>
    </main>
  )
}
