import type * as Party from 'partykit/server'
import type { CollagePiece } from '../src/game/collage'
import {
  DEFAULT_SETTINGS,
  MAX_PLAYERS,
  parseClientMessage,
  sanitizeGameSettings,
  sanitizeName,
  type GameSettings,
  type Guess,
  type Player,
  type RoomState,
} from '../src/game/protocol'
import {
  answersMatch,
  dealPromptOptions,
  optionExists,
  type CategoryOptions,
} from '../src/game/prompts'

type PlayerRecord = {
  id: string
  name: string
  score: number
}

export default class GameRoom implements Party.Server {
  readonly options = {
    hibernate: false,
  }

  private hostId: string | null = null
  private phase: RoomState['phase'] = 'lobby'
  private players = new Map<string, PlayerRecord>()
  private order: string[] = []
  private artistIndex = 0
  private artistId: string | null = null
  private prompt: string | null = null
  private promptOptions: CategoryOptions[] | null = null
  private pieces: CollagePiece[] = []
  private guesses: Guess[] = []
  private deadlineMs: number | null = null
  private winnerName: string | null = null
  private guessSerial = 0
  private settings: GameSettings = { ...DEFAULT_SETTINGS }
  private round = 0

  constructor(readonly room: Party.Room) {}

  onConnect(connection: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url)
    const intent = url.searchParams.get('intent') ?? 'join'
    const name = sanitizeName(url.searchParams.get('name'))

    if (intent === 'join' && this.players.size === 0) {
      this.sendError(connection, 'Room not found. Check the code, or create a room.')
      connection.close()
      return
    }

    if (this.players.size >= MAX_PLAYERS) {
      this.sendError(connection, 'This room is full (6 players).')
      connection.close()
      return
    }

    this.players.set(connection.id, {
      id: connection.id,
      name,
      score: 0,
    })

    if (!this.hostId) {
      this.hostId = connection.id
    }

    if (this.phase !== 'lobby') {
      this.order.push(connection.id)
    }

    this.broadcastState()
  }

  async onMessage(message: string | ArrayBuffer, sender: Party.Connection) {
    const parsed = parseClientMessage(message)
    if (!parsed) return

    const player = this.players.get(sender.id)
    if (!player) return

    if (parsed.type === 'settings' && sender.id === this.hostId && this.phase === 'lobby') {
      this.settings = sanitizeGameSettings(parsed.settings)
      this.broadcastState()
      return
    }

    if (parsed.type === 'start' && sender.id === this.hostId && this.phase === 'lobby') {
      if (this.players.size < 2) {
        this.sendError(sender, 'Need at least two players to start.')
        return
      }
      this.settings = sanitizeGameSettings(parsed.settings)
      this.order = [...this.players.keys()]
      this.artistIndex = 0
      this.round = 1
      for (const item of this.players.values()) item.score = 0
      this.beginPick()
      this.broadcastState()
      return
    }

    if (parsed.type === 'pick' && this.phase === 'picking' && sender.id === this.artistId) {
      if (!this.promptOptions || !optionExists(this.promptOptions, parsed.category, parsed.prompt)) return
      this.prompt = parsed.prompt
      this.promptOptions = null
      this.phase = 'drawing'
      this.deadlineMs = Date.now() + this.settings.turnSeconds * 1000
      await this.room.storage.setAlarm(this.deadlineMs)
      this.broadcastState()
      return
    }

    if (parsed.type === 'canvas' && this.phase === 'drawing' && sender.id === this.artistId) {
      this.pieces = parsed.pieces
      this.broadcastState()
      return
    }

    if (parsed.type === 'guess' && this.phase === 'drawing' && sender.id !== this.artistId) {
      const text = parsed.text.trim()
      if (!text || !this.prompt) return
      const correct = answersMatch(text, this.prompt)
      this.guessSerial += 1
      this.guesses.push({
        id: `g-${this.guessSerial}`,
        playerId: sender.id,
        name: player.name,
        text,
        correct,
      })
      if (this.guesses.length > 40) this.guesses = this.guesses.slice(-40)
      if (correct) {
        this.winnerName = player.name
        player.score += 1
        const artist = this.artistId ? this.players.get(this.artistId) : undefined
        if (artist) artist.score += 1
        await this.endTurn()
      }
      this.broadcastState()
      return
    }

    if (parsed.type === 'timesUp' && this.phase === 'drawing') {
      if (this.deadlineMs && Date.now() + 1500 < this.deadlineMs) return
      await this.endTurn()
      this.broadcastState()
      return
    }

    if (parsed.type === 'nextTurn' && sender.id === this.hostId && this.phase === 'reveal') {
      if (this.round >= this.settings.rounds) {
        this.phase = 'lobby'
        this.clearTurn()
        this.broadcastState()
        return
      }
      this.round += 1
      if (this.order.length === 0) {
        this.phase = 'lobby'
        this.clearTurn()
        this.broadcastState()
        return
      }
      let tries = 0
      do {
        this.artistIndex = (this.artistIndex + 1) % this.order.length
        tries += 1
      } while (
        !this.players.has(this.order[this.artistIndex] ?? '') &&
        tries <= this.order.length
      )
      this.beginPick()
      this.broadcastState()
      return
    }

    if (parsed.type === 'backToLobby' && sender.id === this.hostId) {
      this.phase = 'lobby'
      this.clearTurn()
      this.broadcastState()
    }
  }

  async onAlarm() {
    if (this.phase !== 'drawing') return
    await this.endTurn()
    this.broadcastState()
  }

  onClose(connection: Party.Connection) {
    this.players.delete(connection.id)
    this.order = this.order.filter((id) => id !== connection.id)

    if (this.players.size === 0) {
      this.reset()
      return
    }

    if (this.hostId === connection.id) {
      this.hostId = this.players.keys().next().value ?? null
    }

    if (connection.id === this.artistId && (this.phase === 'picking' || this.phase === 'drawing')) {
      if (this.order.length === 0) {
        this.phase = 'lobby'
        this.clearTurn()
      } else {
        this.artistIndex = this.artistIndex % this.order.length
        this.beginPick()
      }
    }

    this.broadcastState()
  }

  private beginPick() {
    while (this.artistIndex < this.order.length && !this.players.has(this.order[this.artistIndex] ?? '')) {
      this.artistIndex += 1
    }
    const artistId = this.order[this.artistIndex]
    if (!artistId || !this.players.has(artistId)) {
      this.phase = 'lobby'
      this.clearTurn()
      return
    }
    this.phase = 'picking'
    this.artistId = artistId
    this.prompt = null
    this.promptOptions = dealPromptOptions()
    this.pieces = []
    this.guesses = []
    this.deadlineMs = null
    this.winnerName = null
  }

  private async endTurn() {
    this.phase = 'reveal'
    this.deadlineMs = null
    try {
      await this.room.storage.deleteAlarm()
    } catch {
      // Alarm may already be gone.
    }
  }

  private clearTurn() {
    this.artistId = null
    this.prompt = null
    this.promptOptions = null
    this.pieces = []
    this.guesses = []
    this.deadlineMs = null
    this.winnerName = null
    this.order = []
    this.artistIndex = 0
    this.round = 0
  }

  private reset() {
    this.hostId = null
    this.phase = 'lobby'
    this.players.clear()
    this.settings = { ...DEFAULT_SETTINGS }
    this.clearTurn()
  }

  private playerList(): Player[] {
    return [...this.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
    }))
  }

  private artistName() {
    if (!this.artistId) return null
    return this.players.get(this.artistId)?.name ?? null
  }

  private snapshotFor(viewerId: string): RoomState {
    const isArtist = viewerId === this.artistId
    const showPrompt = isArtist || this.phase === 'reveal'
    const showOptions = isArtist && this.phase === 'picking'
    return {
      roomCode: this.room.id.toUpperCase(),
      phase: this.phase,
      selfId: viewerId,
      hostId: this.hostId,
      players: this.playerList(),
      artistId: this.artistId,
      artistName: this.artistName(),
      prompt: showPrompt ? this.prompt : null,
      options: showOptions ? this.promptOptions : null,
      pieces: this.phase === 'lobby' ? [] : this.pieces,
      guesses: this.guesses,
      deadlineMs: this.deadlineMs,
      winnerName: this.winnerName,
      settings: this.settings,
      round: this.round,
    }
  }

  private sendState(connection: Party.Connection) {
    connection.send(JSON.stringify({ type: 'state', state: this.snapshotFor(connection.id) }))
  }

  private broadcastState() {
    for (const connection of this.room.getConnections()) {
      this.sendState(connection)
    }
  }

  private sendError(connection: Party.Connection, message: string) {
    connection.send(JSON.stringify({ type: 'error', message }))
  }
}

GameRoom satisfies Party.Worker
