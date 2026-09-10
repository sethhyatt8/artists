import { useCallback, useEffect, useRef, useState } from 'react'
import { isFirebaseConfigured, rtdbGet, rtdbListen, rtdbPatch, rtdbSet, rtdbTransaction } from './rtdb'
import {
  applyMessage,
  emptyRoom,
  ensureSeated,
  finishTurnIfGuessersDone,
  isSpuriousDrawEnd,
  mergeGuessLists,
  normalizeStoredRoom,
  playerRecord,
  roomPatch,
  sameDrawTurn,
  skipStaleArtist,
  toFirebaseRoom,
  toRoomState,
  type StoredRoom,
} from './roomLogic'
import { MAX_PLAYERS, sanitizeName, type ClientMessage, type RoomState } from './protocol'
import { sanitizeCharacterId } from './characters'
import { rememberTabRole, replaceGuestSeat, seatIdFor } from './seats'

export type RoomSession = {
  roomCode: string
  name: string
  intent: 'create' | 'join'
  characterId?: string
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
  const selfId = useRef(seatIdFor(session.roomCode, session.intent))
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
    let id = seatIdFor(code, session.intent)
    selfId.current = id
    rememberTabRole(code, session.intent)
    const name = sanitizeName(session.name)
    const characterId = sanitizeCharacterId(session.characterId) ?? null
    const path = `rooms/${code}`
    let stopped = false
    let sitting = false

    function publish(room: StoredRoom) {
      latestRoom.current = room
      latestState.current = toRoomState(room, id, code)
      setState(latestState.current)
    }

    async function sitDown(allowCreate: boolean): Promise<'ok' | 'missing' | 'full'> {
      const { data, etag } = await rtdbGet(path)
      const room = normalizeStoredRoom(data)
      if (!room) {
        if (data != null) return 'missing'
        if (!allowCreate || session.intent !== 'create') return 'missing'
        const created = emptyRoom(id, name, characterId)
        const response = await rtdbSet(path, toFirebaseRoom(created), etag)
        if (response.status === 412) return sitDown(false)
        if (!response.ok) throw new Error(`Firebase write failed (${response.status})`)
        if (!stopped) publish(created)
        return 'ok'
      }
      if (
        session.intent === 'join' &&
        room.players[id] &&
        (id === room.createdBy || id === room.hostId)
      ) {
        id = replaceGuestSeat(code)
        selfId.current = id
      }
      if (!room.players[id] && Object.keys(room.players).length >= MAX_PLAYERS) {
        return 'full'
      }
      const mine = room.players[id]
        ? {
            ...room.players[id],
            name,
            seenAt: Date.now(),
            characterId: characterId || room.players[id].characterId,
          }
        : playerRecord(id, name, 0, characterId)
      const response = await rtdbSet(`${path}/players/${id}`, mine)
      if (!response.ok) throw new Error(`Firebase write failed (${response.status})`)
      if (!stopped) {
        publish({
          ...room,
          players: { ...room.players, [id]: mine },
        })
      }
      return 'ok'
    }

    function reseat() {
      if (sitting || stopped) return
      sitting = true
      void sitDown(false)
        .catch(() => undefined)
        .finally(() => {
          sitting = false
        })
    }

    const stopListen = rtdbListen(path, (data) => {
      const room = normalizeStoredRoom(data)
      if (!room) return
      setError(null)
      if (latestRoom.current && isSpuriousDrawEnd(latestRoom.current, room)) {
        return
      }
      let visible = room
      if (latestRoom.current && sameDrawTurn(latestRoom.current, room)) {
        visible = {
          ...room,
          guesses: mergeGuessLists(latestRoom.current.guesses, room.guesses),
        }
      }
      publish(visible)
      if (!room.players[id] && room.phase === 'lobby') {
        reseat()
      }
    })

    void sitDown(session.intent === 'create')
      .then((result) => {
        if (stopped) return
        if (result === 'missing') {
          setError('Room not found. Check the code, or create a room.')
          setStatus('closed')
          return
        }
        if (result === 'full') {
          setError('This room is full (6 players).')
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
      const room = latestRoom.current
      const me = room?.players[id]
      if (me) {
        void rtdbSet(`${path}/players/${id}`, { ...me, seenAt: Date.now() })
      } else if (room?.phase === 'lobby') {
        reseat()
      }
      if (!room) return
      if (room.phase === 'picking' && (room.createdBy === id || room.hostId === id)) {
        const skipped = skipStaleArtist(room)
        if (skipped !== room) {
          void rtdbTransaction(path, (current) => {
            const latest = normalizeStoredRoom(current)
            if (!latest) return undefined
            const next = skipStaleArtist(latest)
            if (next === latest) return undefined
            return toFirebaseRoom(next)
          })
        }
      }
    }, 4000)

    return () => {
      stopped = true
      stopListen()
      window.clearInterval(heartbeat)
    }
  }, [session.intent, session.name, session.roomCode, session.characterId])

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

    if (message.type === 'cue') {
      const room = latestRoom.current
      if (!room) return
      const next = applyMessage(room, id, message)
      if ('error' in next) return
      latestRoom.current = next
      latestState.current = toRoomState(next, id, code)
      setState(latestState.current)
      if (next.cue) void rtdbSet(`${path}/cue`, next.cue)
      return
    }

    if (message.type === 'mod') {
      const room = latestRoom.current
      if (!room) return
      const next = applyMessage(room, id, message)
      if ('error' in next) return
      latestRoom.current = next
      latestState.current = toRoomState(next, id, code)
      setState(latestState.current)
      const writes: Promise<unknown>[] = []
      if (next.cue) writes.push(rtdbSet(`${path}/cue`, next.cue))
      if ((next.quietUntil ?? null) !== (room.quietUntil ?? null)) {
        writes.push(rtdbSet(`${path}/quietUntil`, next.quietUntil ?? null))
      }
      if (JSON.stringify(next.mutedUntil ?? {}) !== JSON.stringify(room.mutedUntil ?? {})) {
        writes.push(
          rtdbSet(
            `${path}/mutedUntil`,
            Object.keys(next.mutedUntil ?? {}).length > 0 ? next.mutedUntil : null,
          ),
        )
      }
      if ((next.guessWipe ?? 0) !== (room.guessWipe ?? 0)) {
        writes.push(rtdbSet(`${path}/guesses`, null))
        writes.push(rtdbSet(`${path}/guessWipe`, next.guessWipe ?? 0))
      }
      if (writes.length > 0) void Promise.all(writes)
      return
    }

    if (message.type === 'guess') {
      const room = latestRoom.current
      if (!room) return
      const next = applyMessage(room, id, message)
      if ('error' in next) {
        setError(next.error)
        return
      }
      latestRoom.current = next
      latestState.current = toRoomState(next, id, code)
      setState(latestState.current)
      const added = next.guesses.filter(
        (guess) => !room.guesses.some((item) => item.id === guess.id),
      )
      const patch = roomPatch(room, next)
      delete patch.pieces
      delete patch.guesses
      void Promise.all([
        ...added.map((guess) => rtdbSet(`${path}/guesses/${guess.id}`, guess)),
        Object.keys(patch).length > 0 ? rtdbPatch(path, patch) : Promise.resolve(),
      ]).then(async () => {
        const { data } = await rtdbGet(path)
        const latest = normalizeStoredRoom(data)
        if (!latest) return
        const merged =
          latestRoom.current && sameDrawTurn(latestRoom.current, latest)
            ? { ...latest, guesses: mergeGuessLists(latestRoom.current.guesses, latest.guesses) }
            : latest
        latestRoom.current = merged
        latestState.current = toRoomState(merged, id, code)
        setState(latestState.current)
        const finished = finishTurnIfGuessersDone(merged)
        if (finished === merged) return
        const endPatch = roomPatch(merged, finished)
        delete endPatch.pieces
        delete endPatch.guesses
        if (Object.keys(endPatch).length === 0) return
        await rtdbPatch(path, endPatch)
      })
      return
    }

    void rtdbTransaction(path, (current) => {
      const room = normalizeStoredRoom(current)
      if (!room) return undefined
      const seated = ensureSeated(
        room,
        id,
        sanitizeName(sessionRef.current.name),
        sanitizeCharacterId(sessionRef.current.characterId) ?? null,
      )
      if (typeof seated === 'string') return undefined
      const next = applyMessage(seated, id, message)
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
