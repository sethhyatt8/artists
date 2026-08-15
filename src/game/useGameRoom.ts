import { useCallback, useEffect, useRef, useState } from 'react'
import { isFirebaseConfigured, rtdbGet, rtdbListen, rtdbPatch, rtdbSet, rtdbTransaction } from './rtdb'
import {
  addPlayer,
  applyMessage,
  emptyRoom,
  isSpuriousDrawEnd,
  normalizeStoredRoom,
  playerCount,
  playerRecord,
  staleGuestIds,
  toRoomState,
  type StoredRoom,
} from './roomLogic'
import { sanitizeName, MAX_PLAYERS, type ClientMessage, type RoomState } from './protocol'

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
  const latestState = useRef<RoomState | null>(null)
  const latestRoom = useRef<StoredRoom | null>(null)

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
    let heartbeat: number | null = null
    const healed = new Set<string>()
    latestRoom.current = null

    function writeSelf() {
      return rtdbPatch(`${path}/players/${id}`, { id, name, seenAt: Date.now() })
    }

    const stopListen = rtdbListen(path, (data) => {
      let room = normalizeStoredRoom(data)
      if (!room) return
      const previous = latestRoom.current
      if (previous && isSpuriousDrawEnd(previous, room)) {
        room = {
          ...previous,
          pieces: room.pieces.length > 0 ? room.pieces : previous.pieces,
        }
      }
      latestRoom.current = room
      if (!room.players[id] || !room.players[id]?.name) {
        const key = `${id}-heal`
        if (!healed.has(key)) {
          healed.add(key)
          void writeSelf().catch(() => undefined)
        }
      }
      const visible = room.players[id]
        ? room
        : ({
            ...room,
            players: { ...room.players, [id]: playerRecord(id, name) },
          } satisfies StoredRoom)
      setError(null)
      const view = toRoomState(visible, id, code)
      latestState.current = view
      setState(view)
      for (const guestId of staleGuestIds(room, id)) {
        void rtdbSet(`${path}/players/${guestId}`, null)
      }
    })

    function fail(message: string) {
      if (stopped) return
      setError(message)
      setStatus('closed')
    }

    function connected() {
      if (stopped) return
      setStatus('open')
      void writeSelf().catch(() => undefined)
      heartbeat = window.setInterval(() => {
        void writeSelf().catch(() => undefined)
      }, 4000)
    }

    void rtdbGet(path)
      .then(async ({ data, etag }) => {
        const room = normalizeStoredRoom(data)
        if (session.intent === 'join') {
          if (!room || playerCount(room) === 0) {
            fail('Room not found. Check the code, or create a room.')
            return
          }
          if (playerCount(room) >= MAX_PLAYERS && !room.players[id]) {
            fail('This room is full (6 players).')
            return
          }
          await writeSelf()
          if (!room.order.includes(id)) {
            await rtdbPatch(path, { order: [...room.order, id] })
          }
          connected()
          return
        }

        if (!room || playerCount(room) === 0) {
          const created = emptyRoom(id, name)
          const response = await rtdbSet(path, created, etag)
          if (response.status === 412) {
            await writeSelf()
          } else if (!response.ok) {
            fail('Could not create the room. Try again.')
            return
          }
          connected()
          return
        }

        await writeSelf()
        if (!room.order.includes(id)) {
          await rtdbPatch(path, { order: [...room.order, id] })
        }
        connected()
      })
      .catch(() => {
        fail('Could not reach Firebase. Confirm Realtime Database is created.')
      })

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
    const name = sanitizeName(sessionRef.current.name)
    const path = `rooms/${code}`

    if (message.type === 'canvas') {
      if (latestState.current?.phase !== 'drawing' || latestState.current.artistId !== id) {
        return
      }
      const record = Object.fromEntries(message.pieces.map((piece) => [piece.id, piece]))
      void rtdbSet(`${path}/pieces`, Object.keys(record).length > 0 ? record : null)
      return
    }

    void rtdbTransaction(path, (current) => {
      let room = normalizeStoredRoom(current)
      if (!room) return undefined
      const known = latestState.current?.players ?? []
      if (known.length > 0) {
        const players = { ...room.players }
        for (const player of known) {
          if (!players[player.id]) players[player.id] = player
        }
        room = { ...room, players }
      }
      if (!room.players[id]) {
        const joined = addPlayer(room, id, name)
        if (typeof joined === 'string') return undefined
        room = joined
      }
      const next = applyMessage(room, id, message)
      if ('error' in next) return undefined
      return next
    })
      .then((result) => {
        if (result.committed) {
          const room = normalizeStoredRoom(result.snapshot)
          if (room) {
            const view = toRoomState(room, id, code)
            latestState.current = view
            setState(view)
          }
          return
        }
        const room = normalizeStoredRoom(result.snapshot)
        if (!room) return
        const next = applyMessage(room, id, message)
        if ('error' in next) setError(next.error)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not update the room.')
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
