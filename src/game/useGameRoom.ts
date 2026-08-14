import { useCallback, useEffect, useRef, useState } from 'react'
import { isFirebaseConfigured, rtdbListen, rtdbSet, rtdbTransaction } from './rtdb'
import {
  addPlayer,
  applyMessage,
  emptyRoom,
  normalizeStoredRoom,
  playerCount,
  reconcileRoom,
  toRoomState,
} from './roomLogic'
import { sanitizeName, type ClientMessage, type RoomState } from './protocol'

export type RoomSession = {
  roomCode: string
  name: string
  intent: 'create' | 'join'
}

function tabId() {
  const key = 'artists-tab-id'
  const existing = sessionStorage.getItem(key)
  if (existing) return existing
  const id = crypto.randomUUID()
  sessionStorage.setItem(key, id)
  return id
}

export function useGameRoom(session: RoomSession) {
  const [state, setState] = useState<RoomState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>(
    'connecting',
  )
  const selfId = useRef(tabId())
  const sessionRef = useRef(session)
  sessionRef.current = session

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setError('Firebase is not configured yet.')
      setStatus('closed')
      return
    }

    const code = session.roomCode
    const id = selfId.current
    const name = sanitizeName(session.name)
    const path = `rooms/${code}`
    let stopped = false
    let lastReconcile = ''

    const stopListen = rtdbListen(path, (data) => {
      const room = normalizeStoredRoom(data)
      if (!room || !room.players[id]) return
      setError(null)
      setState(toRoomState(room, id, code))
      const fixed = reconcileRoom(room)
      const serialized = JSON.stringify(fixed)
      if (serialized !== JSON.stringify(room) && serialized !== lastReconcile) {
        lastReconcile = serialized
        void rtdbTransaction(path, (current) => {
          const live = normalizeStoredRoom(current)
          return live ? reconcileRoom(live) : undefined
        })
      }
    })

    void rtdbTransaction(path, (current) => {
      const room = normalizeStoredRoom(current)
      if (session.intent === 'join') {
        if (!room || playerCount(room) === 0) return undefined
        const next = addPlayer(room, id, name)
        return typeof next === 'string' ? undefined : next
      }
      if (room && playerCount(room) > 0) {
        const next = addPlayer(room, id, name)
        return typeof next === 'string' ? undefined : next
      }
      return emptyRoom(id, name)
    })
      .then((result) => {
        if (stopped) return
        if (!result.committed) {
          setError(
            session.intent === 'join'
              ? 'Room not found. Check the code, or create a room.'
              : 'This room is full (6 players).',
          )
          setStatus('closed')
          return
        }
        setStatus('open')
      })
      .catch(() => {
        if (stopped) return
        setError('Could not reach Firebase. Confirm Realtime Database is created.')
        setStatus('closed')
      })

    const heartbeat = window.setInterval(() => {
      void rtdbSet(`rooms/${code}/players/${id}/seenAt`, Date.now())
    }, 4000)

    return () => {
      stopped = true
      stopListen()
      window.clearInterval(heartbeat)
      void rtdbSet(`rooms/${code}/players/${id}`, null)
    }
  }, [session.intent, session.name, session.roomCode])

  const send = useCallback((message: ClientMessage) => {
    if (!isFirebaseConfigured()) return
    const code = sessionRef.current.roomCode
    const id = selfId.current
    const path = `rooms/${code}`

    if (message.type === 'canvas') {
      void rtdbSet(`${path}/pieces`, message.pieces)
      return
    }

    void rtdbTransaction(path, (current) => {
      const room = normalizeStoredRoom(current)
      if (!room) return undefined
      const next = applyMessage(room, id, message)
      if ('error' in next) return undefined
      return next
    }).then((result) => {
      if (result.committed) return
      const room = normalizeStoredRoom(result.snapshot)
      if (!room) return
      const next = applyMessage(room, id, message)
      if ('error' in next) setError(next.error)
    })
  }, [])

  return {
    state,
    error,
    status,
    send,
  }
}
