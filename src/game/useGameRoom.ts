import { useCallback, useState } from 'react'
import usePartySocket from 'partysocket/react'
import { getPartyKitHost } from './partyHost'
import {
  parseServerMessage,
  type ClientMessage,
  type RoomState,
} from './protocol'

export type RoomSession = {
  roomCode: string
  name: string
  intent: 'create' | 'join'
}

export function useGameRoom(session: RoomSession) {
  const [state, setState] = useState<RoomState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>(
    'connecting',
  )

  const socket = usePartySocket({
    host: getPartyKitHost(),
    room: session.roomCode,
    query: {
      intent: session.intent,
      name: session.name,
    },
    onOpen() {
      setStatus('open')
    },
    onMessage(event) {
      const message = parseServerMessage(event.data)
      if (!message) return
      if (message.type === 'error') {
        setError(message.message)
        return
      }
      setError(null)
      setState(message.state)
    },
    onClose() {
      setStatus('closed')
    },
    onError() {
      setStatus('closed')
    },
  })

  const send = useCallback(
    (message: ClientMessage) => {
      socket.send(JSON.stringify(message))
    },
    [socket],
  )

  return {
    state,
    error,
    status,
    send,
  }
}
