import { useEffect, useMemo, useState } from 'react'
import { normalizeRoomCode } from './game/protocol'
import { CelebrationPreview } from './screens/CelebrationPreview'
import { HomeScreen } from './screens/HomeScreen'
import { PracticeScreen } from './screens/PracticeScreen'
import { RoomScreen } from './screens/RoomScreen'
import type { RoomSession } from './game/useGameRoom'
import './App.css'

function readRoomFromUrl() {
  const params = new URLSearchParams(window.location.search)
  return normalizeRoomCode(params.get('room'))
}

function readPracticeFromUrl() {
  return new URLSearchParams(window.location.search).has('practice')
}

function readCelebrationsFromUrl() {
  return new URLSearchParams(window.location.search).has('celebrations')
}

function readSavedSession(code: string): RoomSession | null {
  if (!code) return null
  try {
    const name = localStorage.getItem('artists-name')
    const seat = localStorage.getItem(`artists-seat:${code}`)
    if (!name || !seat) return null
    const characterId = localStorage.getItem('artists-character-id') ?? undefined
    const created = localStorage.getItem(`artists-cue-board:${code}`) === '1'
    return {
      roomCode: code,
      name,
      characterId: characterId || undefined,
      intent: created ? 'create' : 'join',
    }
  } catch {
    return null
  }
}

export default function App() {
  const initialCode = useMemo(() => readRoomFromUrl(), [])
  const [session, setSession] = useState<RoomSession | null>(() => readSavedSession(initialCode))
  const [practice, setPractice] = useState(() => readPracticeFromUrl() && !initialCode)
  const [celebrations, setCelebrations] = useState(
    () => readCelebrationsFromUrl() && !initialCode,
  )

  useEffect(() => {
    const root = document.getElementById('root')
    root?.classList.toggle('wide', practice || celebrations || Boolean(session))
    return () => root?.classList.remove('wide')
  }, [practice, celebrations, session])

  function enter(next: RoomSession) {
    const url = new URL(window.location.href)
    url.searchParams.delete('practice')
    url.searchParams.delete('celebrations')
    url.searchParams.set('room', next.roomCode)
    window.history.replaceState(null, '', url)
    setPractice(false)
    setCelebrations(false)
    setSession(next)
  }

  function enterPractice() {
    const url = new URL(window.location.href)
    url.searchParams.delete('room')
    url.searchParams.delete('celebrations')
    url.searchParams.set('practice', '1')
    window.history.replaceState(null, '', url)
    setSession(null)
    setCelebrations(false)
    setPractice(true)
  }

  function leave() {
    const url = new URL(window.location.href)
    url.searchParams.delete('room')
    url.searchParams.delete('practice')
    url.searchParams.delete('celebrations')
    window.history.replaceState(null, '', url)
    setSession(null)
    setPractice(false)
    setCelebrations(false)
  }

  if (celebrations) {
    return <CelebrationPreview onLeave={leave} />
  }

  if (practice) {
    return <PracticeScreen onLeave={leave} />
  }

  if (!session) {
    return (
      <HomeScreen
        initialCode={initialCode}
        onEnter={enter}
        onPractice={enterPractice}
      />
    )
  }

  return <RoomScreen session={session} onLeave={leave} />
}
