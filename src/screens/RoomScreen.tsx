import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CollageCanvas } from '../components/CollageCanvas'
import { CollageStudio } from '../components/CollageStudio'
import type { CollagePiece } from '../game/collage'
import {
  MAX_GUESS_LENGTH,
  MAX_PLAYERS,
  MAX_ROUNDS,
  MIN_ROUNDS,
  TURN_SECONDS_OPTIONS,
  type GameSettings,
  type Guess,
  type Player,
  type RoomState,
} from '../game/protocol'
import { useGameRoom, type RoomSession } from '../game/useGameRoom'

type RoomScreenProps = {
  session: RoomSession
  onLeave: () => void
}

export function RoomScreen({ session, onLeave }: RoomScreenProps) {
  const { state, error, status, send } = useGameRoom(session)
  const [copied, setCopied] = useState(false)
  const [pieces, setPieces] = useState<CollagePiece[]>([])
  const [guessText, setGuessText] = useState('')
  const canvasTimer = useRef<number | null>(null)
  const latestPieces = useRef<CollagePiece[]>([])
  const timesUpSent = useRef(false)

  const connectionId = state?.selfId ?? ''
  const isHost = Boolean(state && state.hostId === connectionId)
  const isArtist = Boolean(state && state.artistId === connectionId)
  const seconds = useCountdown(state?.deadlineMs ?? null)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])

  useEffect(() => {
    if (state?.phase === 'drawing' && isArtist) {
      setPieces([])
      latestPieces.current = []
    }
  }, [state?.phase, state?.artistId, isArtist])

  useEffect(() => {
    timesUpSent.current = false
  }, [state?.deadlineMs])

  useEffect(() => {
    if (state?.phase !== 'drawing' || seconds !== 0 || timesUpSent.current) return
    timesUpSent.current = true
    send({ type: 'timesUp' })
  }, [seconds, state?.phase, send])

  function queueCanvas(next: CollagePiece[]) {
    setPieces(next)
    latestPieces.current = next
    if (canvasTimer.current !== null) return
    canvasTimer.current = window.setTimeout(() => {
      canvasTimer.current = null
      send({ type: 'canvas', pieces: latestPieces.current })
    }, 80)
  }

  async function copyCode() {
    const code = state?.roomCode ?? session.roomCode
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  function sendGuess(event: FormEvent) {
    event.preventDefault()
    const text = guessText.trim()
    if (!text) return
    send({ type: 'guess', text })
    setGuessText('')
  }

  if (error && !state) {
    return (
      <main className="screen">
        <h1>Couldn’t join</h1>
        <p className="lede">{error}</p>
        <button className="btn primary" type="button" onClick={onLeave}>
          Back home
        </button>
      </main>
    )
  }

  if (!state) {
    return (
      <main className="screen">
        <p className="eyebrow">{session.roomCode}</p>
        <h1>{status === 'closed' ? 'Disconnected' : 'Connecting…'}</h1>
        <p className="lede">
          {status === 'closed'
            ? 'The room server isn’t reachable. Keep the web and room processes running, then try again.'
            : 'Finding the others…'}
        </p>
        <button className="btn ghost" type="button" onClick={onLeave}>
          Cancel
        </button>
      </main>
    )
  }

  if (state.phase === 'picking' && isArtist && state.options) {
    return (
      <main className="screen room pick">
        <TurnHeader state={state} seconds={null} onLeave={onLeave} />
        <p className="lede">
          Pick one prompt. The {state.settings.turnSeconds}-second timer starts
          as soon as you tap it.
        </p>
        <div className="pick-grid">
          {state.options.map((group) => (
            <section key={group.category} className="panel">
              <h2>{group.category}</h2>
              <div className="prompt-choices">
                {group.prompts.map((prompt) => (
                  <button
                    key={prompt}
                    className="btn ghost"
                    type="button"
                    onClick={() => send({ type: 'pick', category: group.category, prompt })}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    )
  }

  if (state.phase === 'picking') {
    return (
      <main className="screen room">
        <TurnHeader state={state} seconds={null} onLeave={onLeave} />
        <section className="panel">
          <h2>{state.artistName} is picking</h2>
          <p>The artist is choosing a prompt from a few categories. Get ready to guess.</p>
        </section>
        <ScoreList players={state.players} connectionId={connectionId} />
      </main>
    )
  }

  if (state.phase === 'drawing' && isArtist) {
    return (
      <main className="screen practice">
        <TurnHeader state={state} seconds={seconds} onLeave={onLeave} prompt={state.prompt} />
        <p className="hint">Collage that prompt. Guessers can see your board live.</p>
        <CollageStudio
          pieces={pieces}
          onPiecesChange={queueCanvas}
          hint={`You have ${state.settings.turnSeconds} seconds. Watch the guesses on the right and keep adding pieces until someone gets it.`}
          extraRight={<GuessFeed guesses={state.guesses} />}
          shapeSet={state.settings.shapeSet}
        />
      </main>
    )
  }

  if (state.phase === 'drawing') {
    return (
      <main className="screen practice">
        <TurnHeader state={state} seconds={seconds} onLeave={onLeave} />
        <p className="hint">
          {state.artistName} is collaging. Type what you think it is.
        </p>
        <div className="practice-body guesser-body">
          <div className="canvas-stage">
            <CollageCanvas
              pieces={state.pieces}
              selectedIds={[]}
              onPiecesChange={() => undefined}
              onSelect={() => undefined}
              readOnly
            />
          </div>
          <aside className="sidebar sidebar-right">
            <GuessFeed guesses={state.guesses} />
            <form className="guess-form" onSubmit={sendGuess}>
              <label className="field">
                <span>Your guess</span>
                <input
                  value={guessText}
                  maxLength={MAX_GUESS_LENGTH}
                  autoComplete="off"
                  placeholder="pizza"
                  onChange={(event) => setGuessText(event.target.value)}
                />
              </label>
              <button className="btn primary" type="submit">
                Guess
              </button>
            </form>
          </aside>
        </div>
      </main>
    )
  }

  if (state.phase === 'reveal') {
    return (
      <main className="screen practice">
        <TurnHeader state={state} seconds={null} onLeave={onLeave} prompt={state.prompt} />
        <p className="lede">
          {state.winnerName
            ? `${state.winnerName} got it!`
            : 'Time’s up — nobody guessed it.'}
        </p>
        <div className="practice-body guesser-body">
          <div className="canvas-stage">
            <CollageCanvas
              pieces={state.pieces}
              selectedIds={[]}
              onPiecesChange={() => undefined}
              onSelect={() => undefined}
              readOnly
            />
          </div>
          <aside className="sidebar sidebar-right">
            <GuessFeed guesses={state.guesses} />
            <ScoreList players={state.players} connectionId={connectionId} />
            {isHost ? (
              <button
                className="btn primary"
                type="button"
                onClick={() => send({ type: 'nextTurn' })}
              >
                {state.round >= state.settings.rounds ? 'Back to lobby' : 'Next turn'}
              </button>
            ) : (
              <p className="hint">
                {state.round >= state.settings.rounds
                  ? 'Waiting for the host to return to the lobby.'
                  : 'Waiting for the host to start the next turn.'}
              </p>
            )}
          </aside>
        </div>
      </main>
    )
  }

  return (
    <main className="screen room">
      <header className="room-header">
        <div>
          <p className="eyebrow">{isHost ? 'You are the host' : 'Joined'}</p>
          <h1 className="room-code">{state.roomCode}</h1>
        </div>
        <button className="btn ghost compact" type="button" onClick={copyCode}>
          {copied ? 'Copied' : 'Copy code'}
        </button>
      </header>

      <ScoreList players={state.players} connectionId={connectionId} hostId={state.hostId} />

      <section className="panel">
        <h2>Game settings</h2>
        {isHost ? (
          <LobbySettings
            settings={state.settings}
            onChange={(settings) => send({ type: 'settings', settings })}
          />
        ) : (
          <p>
            {state.settings.shapeSet === 'regular'
              ? 'Regular shapes'
              : state.settings.shapeSet === 'letters'
                ? 'Letters A–Z'
                : 'Weird junk'}
            {' · '}
            {state.settings.turnSeconds} seconds
            {' · '}
            {state.settings.rounds} {state.settings.rounds === 1 ? 'round' : 'rounds'}
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Lobby</h2>
        <p>
          {state.players.length} of {MAX_PLAYERS} players. Need at least two
          players.
        </p>
        {error ? <p className="hint">{error}</p> : null}
        {isHost ? (
          <button
            className="btn primary"
            type="button"
            onClick={() => send({ type: 'start', settings: state.settings })}
            disabled={state.players.length < 2}
          >
            {state.players.length < 2 ? 'Waiting for another player' : 'Start game'}
          </button>
        ) : (
          <p className="hint">Waiting for the host to start.</p>
        )}
      </section>

      <button className="btn ghost leave" type="button" onClick={onLeave}>
        Leave room
      </button>
    </main>
  )
}

function LobbySettings({
  settings,
  onChange,
}: {
  settings: GameSettings
  onChange: (settings: GameSettings) => void
}) {
  function patch(next: Partial<GameSettings>) {
    onChange({ ...settings, ...next })
  }

  return (
    <div className="settings">
      <div className="field">
        <span>Shape set</span>
        <div className="choice-row">
          <button
            className={settings.shapeSet === 'regular' ? 'btn compact primary' : 'btn ghost compact'}
            type="button"
            onClick={() => patch({ shapeSet: 'regular' })}
          >
            Regular
          </button>
          <button
            className={settings.shapeSet === 'weird' ? 'btn compact primary' : 'btn ghost compact'}
            type="button"
            onClick={() => patch({ shapeSet: 'weird' })}
          >
            Weird
          </button>
          <button
            className={settings.shapeSet === 'letters' ? 'btn compact primary' : 'btn ghost compact'}
            type="button"
            onClick={() => patch({ shapeSet: 'letters' })}
          >
            Letters
          </button>
        </div>
        <p className="hint">
          {settings.shapeSet === 'regular'
            ? 'Circles, squares, and other basic shapes.'
            : settings.shapeSet === 'letters'
              ? 'Uppercase English letters A through Z.'
              : 'Odd junk silhouettes: fish, shoes, wrenches, and the rest.'}
        </p>
      </div>

      <label className="field">
        <span>Seconds per turn</span>
        <select
          value={settings.turnSeconds}
          onChange={(event) => patch({ turnSeconds: Number(event.target.value) })}
        >
          {TURN_SECONDS_OPTIONS.map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Rounds</span>
        <select
          value={settings.rounds}
          onChange={(event) => patch({ rounds: Number(event.target.value) })}
        >
          {Array.from({ length: MAX_ROUNDS - MIN_ROUNDS + 1 }, (_, index) => {
            const rounds = MIN_ROUNDS + index
            return (
              <option key={rounds} value={rounds}>
                {rounds}
              </option>
            )
          })}
        </select>
      </label>
    </div>
  )
}

function TurnHeader({
  state,
  seconds,
  onLeave,
  prompt,
}: {
  state: RoomState
  seconds: number | null
  onLeave: () => void
  prompt?: string | null
}) {
  return (
    <header className="practice-header">
      <div>
        <p className="eyebrow">
          {state.roomCode}
          {state.round > 0 ? ` · Turn ${state.round} of ${state.settings.rounds}` : ''}
          {state.artistName ? ` · ${state.artistName}` : ''}
        </p>
        <h1>{prompt ?? (state.phase === 'drawing' ? 'Guess!' : 'Artists')}</h1>
      </div>
      <div className="turn-tools">
        {seconds !== null ? (
          <p className={seconds <= 10 ? 'timer urgent' : 'timer'}>{formatTime(seconds)}</p>
        ) : null}
        <button className="btn ghost compact" type="button" onClick={onLeave}>
          Leave
        </button>
      </div>
    </header>
  )
}

function GuessFeed({ guesses }: { guesses: Guess[] }) {
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = scroller.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [guesses])

  return (
    <div className="guess-feed" ref={scroller}>
      <h2>Guesses</h2>
      {guesses.length === 0 ? (
        <p className="hint">Guesses will scroll here.</p>
      ) : (
        guesses.map((guess) => (
          <p key={guess.id} className={guess.correct ? 'guess correct' : 'guess'}>
            <strong>{guess.name}:</strong> {guess.text}
          </p>
        ))
      )}
    </div>
  )
}

function ScoreList({
  players,
  connectionId,
  hostId,
}: {
  players: Player[]
  connectionId: string
  hostId?: string | null
}) {
  return (
    <ul className="player-list">
      {players.map((player) => (
        <li key={player.id}>
          <span className="player-name">
            {player.name}
            {player.id === connectionId ? ' (you)' : ''}
          </span>
          <span className="player-tags">
            {player.id === hostId ? <span className="tag">Host</span> : null}
            <span className="tag">{player.score} pts</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function useCountdown(deadlineMs: number | null) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (deadlineMs === null) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [deadlineMs])

  if (deadlineMs === null) return null
  return Math.max(0, Math.ceil((deadlineMs - now) / 1000))
}
