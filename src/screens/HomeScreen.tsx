import { useMemo, useState } from 'react'
import { CharacterAvatar } from '../components/CharacterAvatar'
import { CHARACTERS, findCharacter } from '../game/characters'
import {
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  ROOM_CODE_LENGTH,
  normalizeRoomCode,
  sanitizeName,
} from '../game/protocol'
import { generateRoomCode } from '../game/roomCode'
import type { RoomSession } from '../game/useGameRoom'

const NAME_KEY = 'artists-name'
const CHARACTER_KEY = 'artists-character-id'

type HomeScreenProps = {
  initialCode?: string
  onEnter: (session: RoomSession) => void
  onPractice: () => void
}

export function HomeScreen({
  initialCode = '',
  onEnter,
  onPractice,
}: HomeScreenProps) {
  const [characterId, setCharacterId] = useState<string | null>(
    () => findCharacter(localStorage.getItem(CHARACTER_KEY))?.id ?? null,
  )
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '')
  const [code, setCode] = useState(initialCode)
  const [mode, setMode] = useState<'choose' | 'join'>(
    initialCode ? 'join' : 'choose',
  )

  const selected = findCharacter(characterId)
  const cleanedName = useMemo(() => name.replace(/\s+/g, ' ').trim(), [name])
  const displayName = sanitizeName(cleanedName || selected?.name)
  const cleanedCode = useMemo(() => normalizeRoomCode(code), [code])
  const canEnter = Boolean(cleanedName || selected)

  function persistIdentity() {
    localStorage.setItem(NAME_KEY, cleanedName || selected?.name || displayName)
    if (selected) localStorage.setItem(CHARACTER_KEY, selected.id)
    else localStorage.removeItem(CHARACTER_KEY)
  }

  function pickCharacter(id: string) {
    const next = findCharacter(id)
    if (!next) return
    const previous = findCharacter(characterId)
    setCharacterId(next.id)
    if (!cleanedName || cleanedName === previous?.name) {
      setName(next.name)
    }
  }

  function pickGuest() {
    const previous = findCharacter(characterId)
    setCharacterId(null)
    if (cleanedName && previous && cleanedName === previous.name) {
      setName('')
    }
  }

  function createRoom() {
    if (!canEnter) return
    persistIdentity()
    onEnter({
      intent: 'create',
      name: displayName,
      characterId: selected?.id,
      roomCode: generateRoomCode(),
    })
  }

  function joinRoom() {
    if (!canEnter || cleanedCode.length !== ROOM_CODE_LENGTH) return
    persistIdentity()
    onEnter({
      intent: 'join',
      name: displayName,
      characterId: selected?.id,
      roomCode: cleanedCode,
    })
  }

  return (
    <main className="screen home">
      <p className="eyebrow">Party rooms</p>
      <h1>Artists</h1>
      <p className="lede">We Shape Artists</p>

      <div className="field">
        <span>Who’s playing?</span>
        <div className="character-grid">
          {CHARACTERS.map((character) => (
            <button
              key={character.id}
              className={
                characterId === character.id ? 'character-pick selected' : 'character-pick'
              }
              type="button"
              onClick={() => pickCharacter(character.id)}
            >
              <CharacterAvatar characterId={character.id} name={character.name} size={56} />
              <span>{character.name}</span>
            </button>
          ))}
          <button
            className={characterId === null ? 'character-pick selected' : 'character-pick'}
            type="button"
            onClick={pickGuest}
          >
            <CharacterAvatar name={cleanedName || 'Guest'} size={56} />
            <span>Guest</span>
          </button>
        </div>
        <p className="hint">
          Keep the same face each night. The name below can be anything for this game.
        </p>
      </div>

      <label className="field">
        <span>Tonight’s name</span>
        <input
          autoComplete="nickname"
          maxLength={MAX_NAME_LENGTH}
          value={name}
          placeholder={selected?.name ?? 'Artist'}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      {mode === 'choose' ? (
        <div className="actions">
          <button className="btn primary" type="button" onClick={createRoom} disabled={!canEnter}>
            Create room
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={() => setMode('join')}
          >
            Join with a code
          </button>
          <button className="btn ghost" type="button" onClick={onPractice}>
            Practice collage
          </button>
        </div>
      ) : (
        <form
          className="join-form"
          onSubmit={(event) => {
            event.preventDefault()
            joinRoom()
          }}
        >
          <label className="field">
            <span>Room code</span>
            <input
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={ROOM_CODE_LENGTH}
              value={code}
              placeholder="K7QM"
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          </label>
          <div className="actions">
            <button
              className="btn primary"
              type="submit"
              disabled={!canEnter || cleanedCode.length !== ROOM_CODE_LENGTH}
            >
              Join room
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => setMode('choose')}
            >
              Back
            </button>
          </div>
        </form>
      )}

      <p className="hint">Up to {MAX_PLAYERS} players. No accounts needed to join.</p>
    </main>
  )
}
