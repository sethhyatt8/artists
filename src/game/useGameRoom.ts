import { useCallback, useEffect, useRef, useState } from 'react'
import { isFirebaseConfigured, rtdbGet, rtdbListen, rtdbPatch, rtdbSet, rtdbTransaction } from './rtdb'
import {
  addPlayer,
  applyMessage,
  emptyRoom,
  normalizeStoredRoom,
  playerCount,
  reconcileRoom,
  roomPatch,
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

  useEffect(() => {
    sessionRef.current = session
  }, [session])

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
    let heartbeat: number | null = null

    const stopListen = rtdbListen(path, (data) => {
      const room = normalizeStoredRoom(data)
      if (!room || !room.players[id]) return
      setError(null)
      setState(toRoomState(room, id, code))
      const fixed = reconcileRoom(room)
      const patch = roomPatch(room, fixed)
      delete patch.hostId
      delete patch.createdBy
      const serialized = JSON.stringify(patch)
      if (Object.keys(patch).length === 0 || serialized === lastReconcile) return
      lastReconcile = serialized
      void rtdbPatch(path, patch).catch(() => undefined)
    })

    function fail(message: string) {
      if (stopped) return
      setError(message)
      setStatus('closed')
    }

    function connected() {
      if (stopped) return
      setStatus('open')
      heartbeat = window.setInterval(() => {
        void rtdbSet(`rooms/${code}/players/${id}/seenAt`, Date.now())
      }, 4000)
    }

    if (session.intent === 'join') {
      void rtdbGet(path)
        .then(async ({ data }) => {
          const room = normalizeStoredRoom(data)
          if (!room || playerCount(room) === 0) {
            fail('Room not found. Check the code, or create a room.')
            return
          }
          const next = addPlayer(room, id, name)
          if (typeof next === 'string') {
            fail(next)
            return
          }
          await rtdbPatch(path, { players: next.players, order: next.order })
          connected()
        })
        .catch(() => {
          fail('Could not reach Firebase. Confirm Realtime Database is created.')
        })
    } else {
      void rtdbTransaction(path, (current) => {
        const room = normalizeStoredRoom(current)
        if (room && playerCount(room) > 0) {
          const next = addPlayer(room, id, name)
          return typeof next === 'string' ? undefined : next
        }
        return emptyRoom(id, name)
      })
        .then((result) => {
          if (!result.committed) {
            fail('This room is full (6 players).')
            return
          }
          connected()
        })
        .catch(() => {
          fail('Could not reach Firebase. Confirm Realtime Database is created.')
        })
    }

    return () => {
      stopped = true
      stopListen()
      if (heartbeat !== null) window.clearInterval(heartbeat)
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

    void rtdbGet(path)
      .then(async ({ data }) => {
        const room = normalizeStoredRoom(data)
        if (!room) return
        const next = applyMessage(room, id, message)
        if ('error' in next) {
          setError(next.error)
          return
        }
        const patch = roomPatch(room, next)
        if (sessionRef.current.intent !== 'create') {
          delete patch.hostId
          delete patch.createdBy
        }
        const addedGuesses = next.guesses.filter(
          (guess) => !room.guesses.some((item) => item.id === guess.id),
        )
        if (addedGuesses.length > 0) {
          delete patch.guesses
          await Promise.all(
            addedGuesses.map((guess) => rtdbSet(`${path}/guesses/${guess.id}`, guess)),
          )
        }
        if (Object.keys(patch).length === 0) return
        await rtdbPatch(path, patch)
      })
      .catch(() => undefined)
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
