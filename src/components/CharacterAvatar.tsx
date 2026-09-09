import { characterFor, type Character, type CharacterLook } from '../game/characters'

export type AvatarMood = 'idle' | 'surprise'

type CharacterAvatarProps = {
  characterId?: string | null
  name?: string
  size?: number
  className?: string
  mood?: AvatarMood
}

export function CharacterAvatar({
  characterId,
  name,
  size = 48,
  className,
  mood = 'idle',
}: CharacterAvatarProps) {
  const character = characterFor(characterId, name)
  const radius = Math.round(size * 0.22)
  const idleSrc = character.portrait ? portraitUrl(character.portrait) : null
  const surpriseSrc =
    mood === 'surprise' && character.surprisePortrait
      ? portraitUrl(character.surprisePortrait)
      : null

  if (idleSrc && surpriseSrc) {
    const classes = ['avatar-pose', `pose-${character.id}`, 'character-avatar', className]
      .filter(Boolean)
      .join(' ')
    const altSrc =
      mood === 'surprise' && character.altPortrait
        ? portraitUrl(character.altPortrait)
        : null
    return (
      <span className={classes} style={{ width: size, height: size, borderRadius: radius }}>
        <img className="pose-idle" src={idleSrc} alt="" width={size} height={size} />
        <img className="pose-surprise" src={surpriseSrc} alt="" width={size} height={size} />
        {altSrc ? (
          <img className="pose-alt" src={altSrc} alt="" width={size} height={size} />
        ) : null}
      </span>
    )
  }

  if (idleSrc) {
    return (
      <img
        className={className ? `${className} character-avatar` : 'character-avatar'}
        src={idleSrc}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    )
  }

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 80 80"
      aria-hidden="true"
      focusable="false"
    >
      <title>{character.name}</title>
      <rect width="80" height="80" rx="18" fill={character.paper} />
      <Portrait look={character.look} character={character} />
    </svg>
  )
}

function portraitUrl(file: string) {
  return `${import.meta.env.BASE_URL}avatars/${file}`
}

function Portrait({ look, character }: { look: CharacterLook; character: Character }) {
  const { color, ink } = character
  if (look === 'cap') {
    return (
      <>
        <ellipse cx="40" cy="48" rx="22" ry="20" fill={color} />
        <circle cx="40" cy="38" r="16" fill="#f4e6d3" />
        <rect x="22" y="24" width="36" height="10" rx="4" fill={ink} />
        <rect x="18" y="30" width="44" height="6" rx="3" fill={ink} />
        <circle cx="34" cy="38" r="2" fill={ink} />
        <circle cx="46" cy="38" r="2" fill={ink} />
      </>
    )
  }
  if (look === 'flower') {
    return (
      <>
        <circle cx="40" cy="46" r="18" fill={color} />
        <circle cx="40" cy="36" r="14" fill="#f4e6d3" />
        <circle cx="40" cy="16" r="7" fill={color} />
        <circle cx="28" cy="20" r="6" fill={color} />
        <circle cx="52" cy="20" r="6" fill={color} />
        <circle cx="40" cy="16" r="3" fill="#f0c84a" />
        <circle cx="35" cy="35" r="2" fill={ink} />
        <circle cx="45" cy="35" r="2" fill={ink} />
      </>
    )
  }
  if (look === 'star') {
    return (
      <>
        <polygon points="40,18 46,32 62,34 50,44 54,60 40,50 26,60 30,44 18,34 34,32" fill={color} />
        <circle cx="40" cy="42" r="12" fill="#f4e6d3" />
        <circle cx="35" cy="41" r="2" fill={ink} />
        <circle cx="45" cy="41" r="2" fill={ink} />
      </>
    )
  }
  if (look === 'bolt') {
    return (
      <>
        <polygon points="28,18 52,18 40,36 58,36 30,66 38,44 22,44" fill={color} />
        <circle cx="40" cy="42" r="13" fill="#f4e6d3" />
        <circle cx="35" cy="41" r="2" fill={ink} />
        <circle cx="45" cy="41" r="2" fill={ink} />
      </>
    )
  }
  if (look === 'bow') {
    return (
      <>
        <circle cx="40" cy="48" r="18" fill={color} />
        <circle cx="40" cy="38" r="14" fill="#f4e6d3" />
        <polygon points="40,16 28,28 40,24 52,28" fill="#c46aad" />
        <circle cx="40" cy="24" r="4" fill="#f2a6c8" />
        <circle cx="35" cy="37" r="2" fill={ink} />
        <circle cx="45" cy="37" r="2" fill={ink} />
      </>
    )
  }
  if (look === 'curl') {
    return (
      <>
        <circle cx="40" cy="46" r="18" fill={color} />
        <circle cx="40" cy="38" r="14" fill="#f4e6d3" />
        <path
          d="M24 34c4-14 28-16 32-4 2 6-6 8-8 2"
          fill="none"
          stroke={ink}
          strokeWidth="5"
          strokeLinecap="round"
        />
        <circle cx="35" cy="38" r="2" fill={ink} />
        <circle cx="45" cy="38" r="2" fill={ink} />
      </>
    )
  }
  const letter = character.name.trim().slice(0, 1).toUpperCase() || '?'
  return (
    <>
      <circle cx="40" cy="40" r="20" fill={color} />
      <text
        x="40"
        y="47"
        textAnchor="middle"
        fontSize="22"
        fontFamily="Palatino, Georgia, serif"
        fill="#f4e6d3"
      >
        {letter}
      </text>
    </>
  )
}
