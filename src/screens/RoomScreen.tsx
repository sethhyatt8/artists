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
  type RankedCollage,
  type RoomState,
  type SavedCollage,
} from '../game/protocol'
import { useGameRoom, type RoomSession } from '../game/useGameRoom'
import { turnRemainingSeconds } from '../game/roomLogic'

type RoomScreenProps = {
  session: RoomSession
  onLeave: () => void
}

export function RoomScreen({ session, onLeave }: RoomScreenProps) {
  const { state, error, status, send, disconnect } = useGameRoom(session)
  const [copied, setCopied] = useState(false)
  const [pieces, setPieces] = useState<CollagePiece[]>([])
  const [guessText, setGuessText] = useState('')
  const canvasTimer = useRef<number | null>(null)
  const latestPieces = useRef<CollagePiece[]>([])
  const timesUpSent = useRef(false)

  const connectionId = state?.selfId ?? ''
  const isHost = session.intent === 'create'
  const isArtist = Boolean(state && state.artistId === connectionId)
  const seconds = useTurnCountdown(state)
  const winnerName =
    state?.winnerName ?? state?.guesses.find((guess) => guess.correct)?.name ?? null
  const hostName = state?.players.find(
    (player) => player.id === (state.createdBy ?? state.hostId),
  )?.name

  function leave() {
    disconnect()
    onLeave()
  }

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])

  const turnKey = `${state?.round ?? 0}:${state?.artistId ?? ''}:${state?.prompt ?? ''}`
  const lastTurnKey = useRef('')

  useEffect(() => {
    if (state?.phase !== 'drawing' || !isArtist) return
    if (lastTurnKey.current === turnKey) return
    lastTurnKey.current = turnKey
    setPieces([])
    latestPieces.current = []
  }, [turnKey, state?.phase, isArtist])

  const drawingSince = useRef<number | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    if (state?.phase === 'drawing') {
      if (drawingSince.current == null) drawingSince.current = Date.now()
      return
    }
    drawingSince.current = null
    timesUpSent.current = false
  }, [state?.phase])

  useEffect(() => {
    if (state?.phase !== 'drawing' || !isArtist) return
    const id = window.setInterval(() => {
      const current = stateRef.current
      if (!current || current.phase !== 'drawing') return
      if (timesUpSent.current || drawingSince.current == null) return
      const guessers = current.players.filter((player) => player.id !== current.artistId)
      const allGotIt =
        guessers.length > 0 &&
        guessers.every((player) =>
          current.guesses.some((guess) => guess.correct && guess.playerId === player.id),
        )
      if (allGotIt) {
        timesUpSent.current = true
        send({ type: 'timesUp' })
        return
      }
      const elapsed = Date.now() - drawingSince.current
      if (elapsed < 15_000) return
      const remaining = turnRemainingSeconds({
        drawStartedMs: current.drawStartedMs,
        deadlineMs: current.deadlineMs,
        turnSeconds: current.settings.turnSeconds,
        localStartedMs: drawingSince.current,
      })
      if (remaining > 1) return
      timesUpSent.current = true
      send({ type: 'timesUp' })
    }, 500)
    return () => window.clearInterval(id)
  }, [state?.phase, isArtist, send])

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
        <button className="btn primary" type="button" onClick={leave}>
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
        <button className="btn ghost" type="button" onClick={leave}>
          Cancel
        </button>
      </main>
    )
  }

  if (state.phase === 'picking' && isArtist && state.options) {
    return (
      <main className="screen room pick">
        <TurnHeader state={state} seconds={null} onLeave={leave} />
        <p className="lede">
          Pick one prompt. The {formatTurnLength(state.settings.turnSeconds)} timer starts
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
        <TurnHeader state={state} seconds={null} onLeave={leave} />
        <section className="panel">
          <h2>{state.artistName} is picking</h2>
          <p>The artist is choosing a prompt from a few categories. Get ready to guess.</p>
        </section>
        <ScoreList players={state.players} connectionId={connectionId} />
      </main>
    )
  }

  if (state.phase === 'drawing' && isArtist) {
    const guesserCount = Math.max(0, state.players.length - 1)
    const solvedCount = new Set(
      state.guesses.filter((guess) => guess.correct).map((guess) => guess.playerId),
    ).size
    return (
      <main className="screen practice">
        <TurnHeader state={state} seconds={seconds} onLeave={leave} prompt={state.prompt} />
        <p className="hint">
          Collage that prompt. Guessers can see your board live.
          {guesserCount > 1 ? ` ${solvedCount} of ${guesserCount} guessed it.` : ''}
        </p>
        <CollageStudio
          key={turnKey}
          pieces={pieces}
          onPiecesChange={queueCanvas}
          hint={`You have ${formatTurnLength(state.settings.turnSeconds)}. Keep going until everyone guesses it or time runs out.`}
          extraRight={<GuessFeed guesses={state.guesses} />}
          shapeSet={state.settings.shapeSet}
        />
      </main>
    )
  }

  if (state.phase === 'drawing') {
    const alreadyGotIt = state.guesses.some(
      (guess) => guess.correct && guess.playerId === connectionId,
    )
    const guesserCount = Math.max(0, state.players.length - 1)
    const solvedCount = new Set(
      state.guesses.filter((guess) => guess.correct).map((guess) => guess.playerId),
    ).size
    return (
      <main className="screen practice">
        <TurnHeader state={state} seconds={seconds} onLeave={leave} />
        <p className="hint">
          {alreadyGotIt
            ? 'You got it! Don’t say the word out loud.'
            : `${state.artistName} is collaging. Type what you think it is.`}
          {guesserCount > 1 ? ` ${solvedCount} of ${guesserCount} guessed it.` : ''}
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
            {alreadyGotIt ? (
              <p className="hint">Your guess is in. Hang tight until the turn ends.</p>
            ) : (
              <form className="guess-form" onSubmit={sendGuess} autoComplete="off">
                <label className="field">
                  <span>Your guess</span>
                  <input
                    value={guessText}
                    maxLength={MAX_GUESS_LENGTH}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    name="artists-guess"
                    placeholder="Type a guess"
                    onChange={(event) => setGuessText(event.target.value)}
                  />
                </label>
                <button className="btn primary" type="submit">
                  Guess
                </button>
              </form>
            )}
          </aside>
        </div>
      </main>
    )
  }

  if (state.phase === 'reveal') {
    return (
      <main className="screen practice">
        <TurnHeader state={state} seconds={null} onLeave={leave} prompt={state.prompt} />
        <p className="lede">{revealLede(state, winnerName)}</p>
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
            {state.round < state.settings.rounds ? (
              <p className="hint">Next artist: {nextArtistName(state)}</p>
            ) : null}
            <button
              className="btn primary"
              type="button"
              onClick={() => send({ type: 'nextTurn' })}
            >
              {state.round >= state.settings.rounds ? 'Vote on favorites' : 'Next turn'}
            </button>
          </aside>
        </div>
      </main>
    )
  }

  if (state.phase === 'voting') {
    return (
      <VoteScreen
        state={state}
        connectionId={connectionId}
        onLeave={leave}
        onVote={(ranks) => send({ type: 'vote', ranks })}
      />
    )
  }

  if (state.phase === 'finale') {
    return (
      <FinaleScreen
        state={state}
        isHost={isHost}
        onLeave={leave}
        onBackToLobby={() => send({ type: 'backToLobby' })}
      />
    )
  }

  return (
    <main className="screen room">
      <header className="room-header">
        <div>
          <p className="eyebrow">
            {isHost ? 'You are the host' : 'Joined'}
            {hostName ? ` · Host: ${hostName}` : ''}
          </p>
          <h1 className="room-code">{state.roomCode}</h1>
        </div>
        <button className="btn ghost compact" type="button" onClick={copyCode}>
          {copied ? 'Copied' : 'Copy code'}
        </button>
      </header>

      <ScoreList
        players={state.players}
        connectionId={connectionId}
        hostId={state.createdBy ?? state.hostId}
      />

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
            {formatTurnLength(state.settings.turnSeconds)}
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

      <button className="btn ghost leave" type="button" onClick={leave}>
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
        <span>Time per turn</span>
        <select
          value={settings.turnSeconds}
          onChange={(event) => patch({ turnSeconds: Number(event.target.value) })}
        >
          {TURN_SECONDS_OPTIONS.map((seconds) => (
            <option key={seconds} value={seconds}>
              {formatTurnLength(seconds)}
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

function revealLede(state: RoomState, winnerName: string | null) {
  const guesserIds = state.players
    .filter((player) => player.id !== state.artistId)
    .map((player) => player.id)
  const solvers = new Set(
    state.guesses.filter((guess) => guess.correct).map((guess) => guess.playerId),
  )
  if (guesserIds.length > 1 && guesserIds.every((id) => solvers.has(id))) {
    return 'Everyone got it!'
  }
  if (winnerName) return `${winnerName} got it!`
  return 'Time’s up — nobody guessed it.'
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
          </span>
        </li>
      ))}
    </ul>
  )
}

function VoteScreen({
  state,
  connectionId,
  onLeave,
  onVote,
}: {
  state: RoomState
  connectionId: string
  onLeave: () => void
  onVote: (ranks: string[]) => void
}) {
  const needed = Math.min(3, state.collages.length)
  const alreadyVoted = Boolean(state.myVote && state.myVote.length > 0)
  const [ranks, setRanks] = useState<(string | null)[]>([null, null, null])

  function setRank(collageId: string, rankIndex: number) {
    setRanks((current) => {
      const next: (string | null)[] = [current[0] ?? null, current[1] ?? null, current[2] ?? null]
      if (next[rankIndex] === collageId) {
        next[rankIndex] = null
        return next
      }
      for (let index = 0; index < 3; index += 1) {
        if (next[index] === collageId) next[index] = null
      }
      next[rankIndex] = collageId
      return next
    })
  }

  const chosen = ranks.filter((id): id is string => Boolean(id))
  const canSubmit = chosen.length === needed

  return (
    <main className="screen room vote">
      <header className="room-header">
        <div>
          <p className="eyebrow">{state.roomCode} · Favorites</p>
          <h1>Vote for the best collages</h1>
        </div>
        <button className="btn ghost compact" type="button" onClick={onLeave}>
          Leave
        </button>
      </header>
      <p className="lede">
        {alreadyVoted
          ? `Vote in. Waiting for everyone else (${state.votedCount} of ${state.voterCount}).`
          : `Pick your top ${needed}. First gets 3 points, second 2, third 1.`}
      </p>
      <div className="vote-grid">
        {state.collages.map((collage) => {
          const place = alreadyVoted
            ? (state.myVote?.indexOf(collage.id) ?? -1)
            : ranks.indexOf(collage.id)
          return (
            <CollageCard
              key={collage.id}
              collage={collage}
              place={place >= 0 ? place + 1 : null}
              you={collage.artistId === connectionId}
              voteDisabled={alreadyVoted}
              needed={needed}
              onRank={(rankIndex) => setRank(collage.id, rankIndex)}
            />
          )
        })}
      </div>
      {alreadyVoted ? (
        <p className="hint">Hang tight — the finale starts when every player has voted.</p>
      ) : (
        <button
          className="btn primary"
          type="button"
          disabled={!canSubmit}
          onClick={() => onVote(chosen)}
        >
          {canSubmit ? 'Lock in vote' : `Pick ${needed} collage${needed === 1 ? '' : 's'}`}
        </button>
      )}
    </main>
  )
}

function FinaleScreen({
  state,
  isHost,
  onLeave,
  onBackToLobby,
}: {
  state: RoomState
  isHost: boolean
  onLeave: () => void
  onBackToLobby: () => void
}) {
  const champion = state.guessChampion
  return (
    <main className="screen room finale">
      <header className="room-header">
        <div>
          <p className="eyebrow">{state.roomCode} · Finale</p>
          <h1>Tonight’s favorites</h1>
        </div>
        <button className="btn ghost compact" type="button" onClick={onLeave}>
          Leave
        </button>
      </header>

      <section className="panel champion-card">
        <h2>Fastest guesser</h2>
        {champion ? (
          <p>
            <strong>{champion.name}</strong> averaged{' '}
            {formatAverageMs(champion.averageMs)} on {champion.correctCount}{' '}
            correct {champion.correctCount === 1 ? 'guess' : 'guesses'}.
          </p>
        ) : (
          <p>Nobody landed a correct guess this game.</p>
        )}
      </section>

      <section>
        <h2>Favorite collages</h2>
        {state.favorites.length === 0 ? (
          <p className="hint">No collages were saved this game.</p>
        ) : (
          <div className="vote-grid finale-grid">
            {state.favorites.map((collage) => (
              <CollageCard
                key={collage.id}
                collage={collage}
                place={collage.place}
                voteDisabled
                needed={0}
                points={collage.votePoints}
              />
            ))}
          </div>
        )}
      </section>

      {isHost ? (
        <button className="btn primary" type="button" onClick={onBackToLobby}>
          Back to lobby
        </button>
      ) : (
        <p className="hint">Waiting for the host to return to the lobby.</p>
      )}
    </main>
  )
}

function CollageCard({
  collage,
  place,
  you,
  voteDisabled = false,
  needed,
  onRank,
  points,
}: {
  collage: SavedCollage | RankedCollage
  place: number | null
  you?: boolean
  voteDisabled?: boolean
  needed: number
  onRank?: (rankIndex: number) => void
  points?: number
}) {
  const labels = ['1st', '2nd', '3rd']
  return (
    <article className={place ? `vote-card ranked ranked-${place}` : 'vote-card'}>
      <div className="vote-stage">
        <CollageCanvas
          pieces={collage.pieces}
          selectedIds={[]}
          onPiecesChange={() => undefined}
          onSelect={() => undefined}
          readOnly
        />
      </div>
      <div className="vote-meta">
        <p className="vote-prompt">{collage.prompt}</p>
        <p className="hint">
          {collage.artistName}
          {you ? ' (you)' : ''}
          {' · '}round {collage.round}
          {typeof points === 'number' ? ` · ${points} pts` : ''}
        </p>
      </div>
      {place ? <p className="vote-place">{placeLabel(place)}</p> : null}
      {voteDisabled || !onRank ? null : (
        <div className="rank-row">
          {labels.slice(0, needed).map((label, index) => (
            <button
              key={label}
              className={place === index + 1 ? 'btn compact primary' : 'btn ghost compact'}
              type="button"
              onClick={() => onRank(index)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </article>
  )
}

function placeLabel(place: number) {
  if (place === 1) return '1st'
  if (place === 2) return '2nd'
  if (place === 3) return '3rd'
  return `${place}th`
}

function formatAverageMs(ms: number) {
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const mins = Math.floor(seconds / 60)
  const rest = seconds - mins * 60
  return `${mins}m ${rest.toFixed(1)}s`
}

function nextArtistName(state: RoomState) {
  const ids = state.players.map((player) => player.id)
  const creator = state.createdBy
  const order =
    creator && ids.includes(creator)
      ? [creator, ...ids.filter((id) => id !== creator).sort()]
      : [...ids].sort()
  if (order.length === 0) return 'the other player'
  const current = state.artistId ? order.indexOf(state.artistId) : -1
  const nextId = order[(current + 1) % order.length]
  return state.players.find((player) => player.id === nextId)?.name ?? 'the other player'
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatTurnLength(seconds: number) {
  if (seconds % 60 === 0) {
    const mins = seconds / 60
    return mins === 1 ? '1 minute' : `${mins} minutes`
  }
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins} min ${secs} sec`
}

function useTurnCountdown(state: RoomState | null) {
  const localStarted = useRef<number | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (state?.phase === 'drawing') {
      if (localStarted.current == null) localStarted.current = Date.now()
      const id = window.setInterval(() => setTick((tick) => tick + 1), 250)
      return () => window.clearInterval(id)
    }
    localStarted.current = null
  }, [state?.phase])

  if (!state || state.phase !== 'drawing') return null
  return turnRemainingSeconds({
    drawStartedMs: state.drawStartedMs,
    deadlineMs: state.deadlineMs,
    turnSeconds: state.settings.turnSeconds,
    localStartedMs: localStarted.current,
  })
}
