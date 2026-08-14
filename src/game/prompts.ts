export const CATEGORIES: Record<string, string[]> = {
  Animals: [
    'cat',
    'dog',
    'fish',
    'owl',
    'duck',
    'horse',
    'shark',
    'dinosaur',
    'spider',
    'penguin',
  ],
  Food: [
    'pizza',
    'taco',
    'ice cream',
    'cookie',
    'banana',
    'hot dog',
    'popcorn',
    'sandwich',
    'apple',
    'cake',
  ],
  Places: [
    'beach',
    'farm',
    'castle',
    'school',
    'ocean',
    'moon',
    'carnival',
    'treehouse',
    'haunted house',
    'volcano',
  ],
  Things: [
    'robot',
    'pirate',
    'unicorn',
    'rocket',
    'bicycle',
    'guitar',
    'umbrella',
    'treasure',
    'cactus',
    'rainbow',
  ],
  Silly: [
    'monster',
    'alien',
    'ninja',
    'wizard',
    'dragon',
    'zombie',
    'mermaid',
    'superhero',
    'ghost',
    'robot dog',
  ],
}

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'in',
  'on',
  'at',
  'with',
  'of',
  'and',
  'to',
  'for',
  'from',
  'into',
  'by',
  'is',
  'it',
])

export type CategoryOptions = {
  category: string
  prompts: string[]
}

function shuffle<T>(items: T[]) {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = next[i]
    const b = next[j]
    if (a === undefined || b === undefined) continue
    next[i] = b
    next[j] = a
  }
  return next
}

export function dealPromptOptions(): CategoryOptions[] {
  const names = shuffle(Object.keys(CATEGORIES)).slice(0, 3)
  return names.map((category) => {
    const list = CATEGORIES[category] ?? []
    return {
      category,
      prompts: shuffle(list).slice(0, 3),
    }
  })
}

export function normalizeAnswer(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stem(word: string) {
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1)
  }
  return word
}

export function contentWords(value: string) {
  return normalizeAnswer(value)
    .split(' ')
    .filter((word) => word.length >= 2 && !STOPWORDS.has(word))
    .map(stem)
}

export function answersMatch(guess: string, prompt: string) {
  const guessWords = contentWords(guess)
  const promptWords = contentWords(prompt)
  if (guessWords.length === 0 || promptWords.length === 0) return false

  const guessSet = new Set(guessWords)
  if (promptWords.every((word) => guessSet.has(word))) return true

  const hits = promptWords.filter((word) => guessSet.has(word))
  const needed = Math.ceil(promptWords.length / 2)
  return hits.length >= needed && hits.some((word) => word.length >= 3)
}

export function optionExists(options: CategoryOptions[], category: string, prompt: string) {
  const group = options.find((item) => item.category === category)
  return Boolean(group?.prompts.includes(prompt))
}
