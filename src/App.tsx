import { useEffect, useMemo, useState } from 'react'
import { normalizeRoomCode } from './game/protocol'
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

export default function App() {
  const initialCode = useMemo(() => readRoomFromUrl(), [])
  const [session, setSession] = useState<RoomSession | null>(null)
  const [practice, setPractice] = useState(() => readPracticeFromUrl() && !initialCode)

  useEffect(() => {
    const root = document.getElementById('root')
    root?.classList.toggle('wide', practice || Boolean(session))
    return () => root?.classList.remove('wide')
  }, [practice, session])

  function enter(next: RoomSession) {
    const url = new URL(window.location.href)
    url.searchParams.delete('practice')
    url.searchParams.set('room', next.roomCode)
    window.history.replaceState(null, '', url)
    setPractice(false)
    setSession(next)
  }

  function enterPractice() {
    const url = new URL(window.location.href)
    url.searchParams.delete('room')
    url.searchParams.set('practice', '1')
    window.history.replaceState(null, '', url)
    setSession(null)
    setPractice(true)
  }

  function leave() {
    const url = new URL(window.location.href)
    url.searchParams.delete('room')
    url.searchParams.delete('practice')
    window.history.replaceState(null, '', url)
    setSession(null)
    setPractice(false)
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
