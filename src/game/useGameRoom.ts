import { useCallback, useEffect, useRef, useState } from 'react'
import { isFirebaseConfigured, rtdbListen, rtdbSet, rtdbTransaction } from './rtdb'
import {
  addPlayer,
  applyMessage,
  emptyRoom,
  isSpuriousDrawEnd,
  normalizeStoredRoom,
  playerCount,
  playerRecord,
  toFirebaseRoom,
  toRoomState,
  type StoredRoom,
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

function piecesRecord(pieces: { id: string }[]) {
  return Object.fromEntries(pieces.map((piece) => [piece.id, piece]))
}

export function useGameRoom(session: RoomSession) {
  const [state, setState] = useState<RoomState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>(
    'connecting',
  )
  const selfId = useRef(tabId())
  const sessionRef = useRef(session)
  const latestState = useRef<RoomState | null>(null)
  const latestRoom = useRef<StoredRoom | null>(null)
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

    const stopListen = rtdbListen(path, (data) => {
      const room = normalizeStoredRoom(data)
      if (!room) return
      const visible = room.players[id]
        ? room
        : ({
            ...room,
            players: { ...room.players, [id]: playerRecord(id, name) },
          } satisfies StoredRoom)
      setError(null)
      if (latestRoom.current && isSpuriousDrawEnd(latestRoom.current, visible)) {
        return
      }
      latestRoom.current = visible
      latestState.current = toRoomState(visible, id, code)
      setState(latestState.current)
    })

    void rtdbTransaction(path, (current) => {
      const room = normalizeStoredRoom(current)
      if (session.intent === 'join') {
        if (!room || playerCount(room) === 0) return undefined
        const next = addPlayer(room, id, name)
        return typeof next === 'string' ? undefined : toFirebaseRoom(next)
      }
      if (room && playerCount(room) > 0) {
        const next = addPlayer(room, id, name)
        return typeof next === 'string' ? undefined : toFirebaseRoom(next)
      }
      return toFirebaseRoom(emptyRoom(id, name))
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
      void rtdbSet(`${path}/players/${id}/seenAt`, Date.now())
    }, 4000)

    return () => {
      stopped = true
      stopListen()
      window.clearInterval(heartbeat)
      void rtdbSet(`${path}/players/${id}`, null)
    }
  }, [session.intent, session.name, session.roomCode])

  const send = useCallback((message: ClientMessage) => {
    if (!isFirebaseConfigured()) return
    const code = sessionRef.current.roomCode
    const id = selfId.current
    const path = `rooms/${code}`

    if (message.type === 'canvas') {
      if (latestState.current?.phase !== 'drawing' || latestState.current.artistId !== id) {
        return
      }
      void rtdbSet(
        `${path}/pieces`,
        message.pieces.length > 0 ? piecesRecord(message.pieces) : null,
      )
      return
    }

    void rtdbTransaction(path, (current) => {
      const room = normalizeStoredRoom(current)
      if (!room) return undefined
      const next = applyMessage(room, id, message)
      if ('error' in next) return undefined
      return toFirebaseRoom(next)
    }).then((result) => {
      if (result.committed) {
        const room = normalizeStoredRoom(result.snapshot)
        if (room) {
          latestRoom.current = room
          latestState.current = toRoomState(room, id, code)
          setState(latestState.current)
        }
        return
      }
      const room = normalizeStoredRoom(result.snapshot)
      if (!room) return
      const next = applyMessage(room, id, message)
      if ('error' in next) setError(next.error)
    })
  }, [])

  const disconnect = useCallback(() => {
    const code = sessionRef.current.roomCode
    const id = selfId.current
    void rtdbSet(`rooms/${code}/players/${id}`, null)
  }, [])

  return {
    state,
    error,
    status,
    send,
    disconnect,
  }
}
