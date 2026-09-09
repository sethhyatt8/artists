export const GUEST_CHARACTER_ID = 'guest'

export type CharacterLook = 'cap' | 'flower' | 'star' | 'bolt' | 'bow' | 'curl' | 'guest'

export type Character = {
  id: string
  name: string
  color: string
  paper: string
  ink: string
  look: CharacterLook
  portrait?: string
  celebrateFrames?: [string, string, string, string]
}

export const CHARACTERS: Character[] = [
  {
    id: 'seth',
    name: 'Seth',
    color: '#c45c26',
    paper: '#e7c9a4',
    ink: '#1a1410',
    look: 'cap',
    portrait: 'seth.png',
    celebrateFrames: ['seth-f1.png', 'seth-f2.png', 'seth-f3.png', 'seth-f4.png'],
  },
  {
    id: 'emily',
    name: 'Emily',
    color: '#d7b56d',
    paper: '#f0d7b0',
    ink: '#1a1410',
    look: 'flower',
    portrait: 'emily.png',
    celebrateFrames: ['emily-f1.png', 'emily-f2.png', 'emily-f3.png', 'emily-f4.png'],
  },
  {
    id: 'harper',
    name: 'Harper',
    color: '#3dbf8c',
    paper: '#d8e7c8',
    ink: '#1a1410',
    look: 'star',
    portrait: 'harper.png',
    celebrateFrames: ['harper-f1.png', 'harper-f2.png', 'harper-f3.png', 'harper-f4.png'],
  },
  {
    id: 'jaxon',
    name: 'Jaxon',
    color: '#3d6ea8',
    paper: '#c9d8ea',
    ink: '#1a1410',
    look: 'bolt',
    portrait: 'jaxon.png',
    celebrateFrames: ['jaxon-f1.png', 'jaxon-f2.png', 'jaxon-f3.png', 'jaxon-f4.png'],
  },
  {
    id: 'eloise',
    name: 'Eloise',
    color: '#7a4ea3',
    paper: '#ddd0ea',
    ink: '#1a1410',
    look: 'bow',
    portrait: 'eloise.png',
    celebrateFrames: ['eloise-f1.png', 'eloise-f2.png', 'eloise-f3.png', 'eloise-f4.png'],
  },
  {
    id: 'julia',
    name: 'Julia',
    color: '#d4483a',
    paper: '#edcfc4',
    ink: '#1a1410',
    look: 'curl',
    portrait: 'julia.png',
    celebrateFrames: ['julia-f1.png', 'julia-f2.png', 'julia-f3.png', 'julia-f4.png'],
  },
]

export const GUEST_CHARACTER: Character = {
  id: GUEST_CHARACTER_ID,
  name: 'Guest',
  color: '#8a8680',
  paper: '#d8c4a8',
  ink: '#1a1410',
  look: 'guest',
}

const byId = new Map(CHARACTERS.map((item) => [item.id, item]))

export function findCharacter(id: string | null | undefined): Character | undefined {
  if (!id || id === GUEST_CHARACTER_ID) return undefined
  return byId.get(id)
}

export function sanitizeCharacterId(raw: string | null | undefined): string | undefined {
  return findCharacter(raw)?.id
}

export function characterFor(
  characterId: string | null | undefined,
  name?: string,
): Character {
  return findCharacter(characterId) ?? guestFromName(name)
}

function guestFromName(name?: string): Character {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return GUEST_CHARACTER
  return { ...GUEST_CHARACTER, name: trimmed }
}
