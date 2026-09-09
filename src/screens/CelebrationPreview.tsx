import { useEffect, useState } from 'react'
import { CharacterAvatar } from '../components/CharacterAvatar'
import { CHARACTERS } from '../game/characters'

const LABELS: Record<string, string> = {
  seth: 'gasp',
  emily: 'fire eyes',
  harper: 'hair shake',
  jaxon: 'thumbs up',
  eloise: 'big smile',
  julia: 'glasses',
}

type CelebrationPreviewProps = {
  onLeave: () => void
}

export function CelebrationPreview({ onLeave }: CelebrationPreviewProps) {
  const [play, setPlay] = useState(0)

  useEffect(() => {
    document.body.classList.add('preview-motion')
    return () => document.body.classList.remove('preview-motion')
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setPlay((n) => n + 1), 2200)
    return () => window.clearInterval(id)
  }, [])

  return (
    <main className="screen celebration-preview">
      <header className="room-header">
        <div>
          <p className="eyebrow">Preview</p>
          <h1>Celebrate poses</h1>
        </div>
        <button className="btn ghost compact" type="button" onClick={onLeave}>
          Back
        </button>
      </header>
      <div className="celebration-grid">
        {CHARACTERS.map((character) => (
          <figure key={`${character.id}-${play}`} className="celebration-card">
            <CharacterAvatar
              characterId={character.id}
              name={character.name}
              size={168}
              mood="surprise"
            />
            <figcaption>
              <strong>{character.name}</strong>
              <span>{LABELS[character.id]}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  )
}
