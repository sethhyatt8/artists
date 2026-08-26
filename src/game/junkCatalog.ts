function circle(cx: number, cy: number, r: number) {
  return `M ${cx - r},${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`
}

function starPath() {
  const points: string[] = []
  for (let i = 0; i < 5; i += 1) {
    const outer = ((-90 + i * 72) * Math.PI) / 180
    const inner = ((-90 + i * 72 + 36) * Math.PI) / 180
    points.push(`${Math.cos(outer) * 48},${Math.sin(outer) * 48}`)
    points.push(`${Math.cos(inner) * 20},${Math.sin(inner) * 20}`)
  }
  return `M ${points.join(' L ')} Z`
}

function burstPath() {
  const points: string[] = []
  for (let i = 0; i < 9; i += 1) {
    const outer = ((-90 + i * 40) * Math.PI) / 180
    const inner = ((-90 + i * 40 + 20) * Math.PI) / 180
    const outerR = i % 2 === 0 ? 48 : 40
    points.push(`${Math.cos(outer) * outerR},${Math.sin(outer) * outerR}`)
    points.push(`${Math.cos(inner) * 16},${Math.sin(inner) * 16}`)
  }
  return `M ${points.join(' L ')} Z`
}

export type JunkDef = {
  kind: string
  label: string
  aspect: number
  paths: string[]
  fillRule?: 'evenodd'
}

export const JUNK_OPTIONS: JunkDef[] = [
  {
    kind: 'star',
    label: 'Star',
    aspect: 1,
    paths: [starPath()],
  },
  {
    kind: 'heart',
    label: 'Heart',
    aspect: 1.05,
    paths: ['M 0,36 C -46,8 -34,-32 0,-12 C 34,-32 46,8 0,36 Z'],
  },
  {
    kind: 'moon',
    label: 'Moon',
    aspect: 0.85,
    fillRule: 'evenodd',
    paths: [`${circle(0, 0, 40)} ${circle(14, -4, 30)}`],
  },
  {
    kind: 'lightning',
    label: 'Bolt',
    aspect: 0.62,
    paths: ['M 10,-48 L -22,2 L 2,4 L -12,48 L 26,-4 L 4,-6 Z'],
  },
  {
    kind: 'cloud',
    label: 'Puff',
    aspect: 1.55,
    paths: [circle(-22, 8, 16), circle(2, -2, 22), circle(26, 10, 15)],
  },
  {
    kind: 'leaf',
    label: 'Leaf',
    aspect: 0.72,
    paths: ['M 0,-46 C 34,-18 36,18 0,48 C -36,18 -34,-18 0,-46 Z'],
  },
  {
    kind: 'blob',
    label: 'Blob',
    aspect: 1.15,
    paths: [
      'M -8,-42 C 18,-48 44,-18 40,4 C 48,28 18,46 -6,42 C -32,46 -48,18 -42,-6 C -46,-30 -28,-40 -8,-42 Z',
    ],
  },
  {
    kind: 'splat',
    label: 'Splat',
    aspect: 1.1,
    paths: [
      'M 0,-46 L 10,-18 L 38,-30 L 20,-4 L 48,8 L 16,12 L 22,42 L 0,20 L -24,44 L -16,12 L -48,10 L -22,-2 L -40,-28 L -8,-16 Z',
    ],
  },
  {
    kind: 'spiral',
    label: 'Swirl',
    aspect: 1,
    paths: [
      'M 0,-6 C 18,-6 22,16 0,20 C -28,24 -34,-20 2,-28 C 42,-34 48,34 0,40 C -52,44 -62,-42 2,-48 L 8,-36 C -38,-32 -32,28 0,26 C 26,24 24,-16 2,-14 C -10,-14 -8,6 0,6 C 6,6 6,-2 0,-2 Z',
    ],
  },
  {
    kind: 'ring',
    label: 'Ring',
    aspect: 1,
    fillRule: 'evenodd',
    paths: [`${circle(0, 0, 42)} ${circle(0, 0, 22)}`],
  },
  {
    kind: 'arch',
    label: 'Arch',
    aspect: 1.2,
    fillRule: 'evenodd',
    paths: [
      'M -46,40 L -46,8 C -46,-36 46,-36 46,8 L 46,40 L 24,40 L 24,8 C 24,-12 -24,-12 -24,8 L -24,40 Z',
    ],
  },
  {
    kind: 'boomerang',
    label: 'Hook',
    aspect: 1.6,
    paths: [
      'M -46,-8 L -10,-36 L 8,-18 L -6,-8 L 36,-28 L 46,-8 L 12,18 L -8,2 L -22,18 Z',
    ],
  },
  {
    kind: 'peanut',
    label: 'Peanut',
    aspect: 1.85,
    paths: [
      'M -36,0 C -36,-28 -8,-32 -2,-10 C 8,-32 36,-28 36,0 C 36,28 8,32 -2,10 C -8,32 -36,28 -36,0 Z',
    ],
  },
  {
    kind: 'teardrop',
    label: 'Drop',
    aspect: 0.72,
    paths: ['M 0,-48 C 28,-12 28,28 0,44 C -28,28 -28,-12 0,-48 Z'],
  },
  {
    kind: 'zigzag',
    label: 'Zigzag',
    aspect: 1.7,
    paths: [
      'M -48,-8 L -18,-36 L -8,-18 L 10,-32 L 20,-12 L 48,-28 L 48,-8 L 22,10 L 12,-8 L -6,8 L -16,-8 L -48,12 Z',
    ],
  },
  {
    kind: 'plus',
    label: 'Plus',
    aspect: 1,
    paths: [
      'M -12,-48 L 12,-48 L 12,-12 L 48,-12 L 48,12 L 12,12 L 12,48 L -12,48 L -12,12 L -48,12 L -48,-12 L -12,-12 Z',
    ],
  },
  {
    kind: 'burst',
    label: 'Burst',
    aspect: 1,
    paths: [burstPath()],
  },
  {
    kind: 'wave',
    label: 'Wave',
    aspect: 1.9,
    paths: [
      'M -48,8 C -28,-28 -8,28 8,-8 C 22,-36 38,-4 48,6 L 48,22 C 34,8 24,-10 12,8 C -4,36 -24,-12 -48,22 Z',
    ],
  },
  {
    kind: 'kidney',
    label: 'Bean',
    aspect: 1.45,
    paths: [
      'M -40,8 C -44,-28 8,-44 28,-18 C 44,4 28,36 -4,38 C -32,40 -36,22 -22,12 C -34,14 -38,18 -40,8 Z',
    ],
  },
  {
    kind: 'amoeba',
    label: 'Lump',
    aspect: 1.2,
    paths: [
      'M -30,-18 C -44,-40 -8,-50 8,-32 C 28,-48 50,-16 36,6 C 52,22 28,46 6,36 C -18,48 -48,24 -38,4 C -52,-8 -20,-2 -30,-18 Z',
    ],
  },
  {
    kind: 'ribbon',
    label: 'Ribbon',
    aspect: 1.7,
    paths: [
      'M -48,-20 C -20,-48 8,-8 4,4 C 0,18 24,8 48,-6 L 48,16 C 18,34 -8,22 -4,8 C 0,-6 -16,-28 -48,2 Z',
    ],
  },
  {
    kind: 'hourglass',
    label: 'Hourglass',
    aspect: 0.7,
    paths: [
      'M -28,-48 L 28,-48 L 28,-36 L 8,-8 L 28,20 L 28,48 L -28,48 L -28,20 L -8,-8 L -28,-36 Z',
    ],
  },
  {
    kind: 'clover',
    label: 'Clover',
    aspect: 1,
    paths: [circle(0, -22, 16), circle(22, 6, 16), circle(-22, 6, 16), circle(0, 24, 14)],
  },
  {
    kind: 'wedge',
    label: 'Wedge',
    aspect: 1.05,
    paths: ['M 0,0 L 42,-28 L 42,28 Z', circle(0, 0, 18)],
  },
  {
    kind: 'loop',
    label: 'Loop',
    aspect: 1.15,
    fillRule: 'evenodd',
    paths: [`${circle(-8, 0, 32)} ${circle(-8, 0, 14)} M 18,-10 L 48,-28 L 48,8 L 22,10 Z`],
  },
  {
    kind: 'spike',
    label: 'Spike',
    aspect: 0.55,
    paths: ['M 0,-48 L 16,20 L 8,48 L -8,48 L -16,20 Z'],
  },
  {
    kind: 'comma',
    label: 'Comma',
    aspect: 0.7,
    paths: [
      'M 4,-28 C 28,-28 28,8 4,12 C -8,14 -6,28 -2,40 L -16,48 C -24,28 -26,12 -18,2 C -32,-8 -24,-40 4,-28 Z',
    ],
  },
  {
    kind: 'notch',
    label: 'Notch',
    aspect: 1,
    fillRule: 'evenodd',
    paths: [`${circle(0, 0, 42)} M 6,-8 L 48,-28 L 48,28 L 6,8 Z`],
  },
  {
    kind: 'trapezoid',
    label: 'Trapezoid',
    aspect: 1.5,
    paths: ['M -20,-28 L 20,-28 L 46,28 L -46,28 Z'],
  },
  {
    kind: 'cross',
    label: 'Cross',
    aspect: 1,
    paths: [
      'M -14,-48 L 14,-48 L 14,-14 L 48,-14 L 48,14 L 14,14 L 14,48 L -14,48 L -14,14 L -48,14 L -48,-14 L -14,-14 Z',
    ],
  },
]

const RETIRED_JUNK: JunkDef[] = [
  {
    kind: 'flower',
    label: 'Flower',
    aspect: 1,
    paths: [
      circle(0, -28, 14),
      circle(24, -10, 14),
      circle(16, 20, 14),
      circle(-16, 20, 14),
      circle(-24, -10, 14),
      circle(0, 0, 12),
    ],
  },
  {
    kind: 'fish',
    label: 'Fish',
    aspect: 1.7,
    paths: [
      'M -36,0 C -32,-22 6,-28 18,-10 L 46,-22 L 32,0 L 46,22 L 18,10 C 6,28 -32,22 -36,0 Z',
    ],
  },
  {
    kind: 'duck',
    label: 'Duck',
    aspect: 1.35,
    paths: [
      'M -38,10 C -38,-16 10,-22 22,-2 C 28,10 10,30 -14,30 C -32,30 -38,20 -38,10 Z',
      circle(16, -16, 13),
      'M 26,-18 L 48,-10 L 26,-4 Z',
    ],
  },
  {
    kind: 'bone',
    label: 'Bone',
    aspect: 2.1,
    paths: [
      'M -28,-7 L 28,-7 L 28,7 L -28,7 Z',
      circle(-32, -12, 11),
      circle(-32, 12, 11),
      circle(32, -12, 11),
      circle(32, 12, 11),
    ],
  },
  {
    kind: 'banana',
    label: 'Banana',
    aspect: 1.8,
    paths: ['M -44,16 C -18,46 28,36 46,4 C 18,28 -18,30 -38,4 C -44,8 -46,12 -44,16 Z'],
  },
  {
    kind: 'apple',
    label: 'Apple',
    aspect: 0.9,
    paths: [
      'M 0,-6 C -34,-10 -40,32 0,42 C 40,32 34,-10 0,-6 Z',
      'M 0,-8 C 2,-24 14,-30 18,-22 C 8,-18 4,-12 0,-8 Z',
    ],
  },
  {
    kind: 'bottle',
    label: 'Bottle',
    aspect: 0.42,
    paths: [
      'M -16,48 L -16,-2 L -8,-2 L -8,-26 L -11,-32 L -11,-40 L 11,-40 L 11,-32 L 8,-26 L 8,-2 L 16,-2 L 16,48 Q 16,50 0,50 Q -16,50 -16,48 Z',
    ],
  },
  {
    kind: 'mug',
    label: 'Mug',
    aspect: 1.15,
    paths: [
      'M -30,-22 L -30,28 Q -30,42 -6,44 L 8,44 Q 26,42 26,28 L 26,-22 Z',
      'M 26,-8 C 48,-10 50,26 26,24 L 26,12 C 38,14 38,2 26,2 Z',
    ],
  },
  {
    kind: 'spoon',
    label: 'Spoon',
    aspect: 0.38,
    paths: [
      'M 0,-46 C 16,-46 18,-18 0,-16 C -18,-18 -16,-46 0,-46 Z',
      'M -5,-16 L -5,48 L 5,48 L 5,-16 Z',
    ],
  },
  {
    kind: 'key',
    label: 'Key',
    aspect: 1.85,
    paths: [
      `${circle(-28, 0, 16)} ${circle(-28, 0, 6)} M -14,-5 L 44,-5 L 44,5 L 28,5 L 28,16 L 18,16 L 18,5 L 8,5 L 8,14 L -2,14 L -2,5 L -14,5 Z`,
    ],
    fillRule: 'evenodd',
  },
  {
    kind: 'shoe',
    label: 'Shoe',
    aspect: 1.7,
    paths: [
      'M -44,8 C -44,-6 -20,-18 4,-16 C 22,-14 28,-4 40,-2 C 48,0 48,12 36,16 L -36,18 C -46,18 -44,12 -44,8 Z',
    ],
  },
  {
    kind: 'hat',
    label: 'Hat',
    aspect: 1.6,
    paths: ['M -48,10 L 48,10 L 48,20 L -48,20 Z', 'M -18,-28 L 18,-28 L 22,10 L -22,10 Z'],
  },
  {
    kind: 'glasses',
    label: 'Glasses',
    aspect: 2,
    paths: [circle(-22, 0, 16), circle(22, 0, 16), 'M -6,-3 L 6,-3 L 6,3 L -6,3 Z'],
  },
  {
    kind: 'umbrella',
    label: 'Umbrella',
    aspect: 1.15,
    paths: [
      'M -46,4 Q 0,-52 46,4 L 46,10 Q 0,-20 -46,10 Z',
      'M -2,4 L -2,36 Q -2,46 -14,46 L -18,46 L -18,40 L -12,40 Q -8,40 -8,36 L -8,4 Z',
    ],
  },
  {
    kind: 'balloon',
    label: 'Balloon',
    aspect: 0.7,
    paths: [
      'M 0,-46 C 24,-46 30,-8 8,10 L 0,18 L -8,10 C -30,-8 -24,-46 0,-46 Z',
      'M -2,18 L 2,18 L 6,48 L 2,48 Z',
    ],
  },
  {
    kind: 'cactus',
    label: 'Cactus',
    aspect: 0.85,
    paths: [
      'M -10,48 L -10,-28 Q -10,-46 0,-46 Q 10,-46 10,-28 L 10,48 Z',
      'M -10,-8 L -32,-8 Q -40,-8 -40,-18 Q -40,-28 -32,-28 L -10,-28 Z',
      'M 10,6 L 30,6 Q 38,6 38,-4 Q 38,-14 30,-14 L 10,-14 Z',
    ],
  },
  {
    kind: 'lightbulb',
    label: 'Lightbulb',
    aspect: 0.7,
    paths: [
      'M 0,-46 C 24,-46 30,-12 12,8 L 12,16 L -12,16 L -12,8 C -30,-12 -24,-46 0,-46 Z',
      'M -12,18 L 12,18 L 10,24 L -10,24 Z',
      'M -10,26 L 10,26 L 8,32 L -8,32 Z',
    ],
  },
  {
    kind: 'wrench',
    label: 'Wrench',
    aspect: 2.2,
    paths: [
      'M -48,-10 L -28,-10 L -22,-4 L 24,-4 L 30,-14 L 48,-8 L 48,8 L 30,14 L 24,4 L -22,4 L -28,10 L -48,10 L -42,0 Z',
    ],
  },
  {
    kind: 'tree',
    label: 'Tree',
    aspect: 0.85,
    paths: ['M -8,48 L -8,8 L 8,8 L 8,48 Z', circle(0, -12, 28), circle(-16, 4, 16), circle(16, 4, 16)],
  },
  {
    kind: 'car',
    label: 'Car',
    aspect: 1.85,
    paths: [
      'M -40,8 L -28,-8 L -8,-18 L 16,-18 L 36,-4 L 46,8 Z',
      'M -46,8 L 46,8 L 46,20 L -46,20 Z',
      circle(-24, 22, 8),
      circle(24, 22, 8),
    ],
  },
]

const junkByKind = new Map([...JUNK_OPTIONS, ...RETIRED_JUNK].map((item) => [item.kind, item]))

export type JunkKind = string

export function getJunkDef(kind: string) {
  const def = junkByKind.get(kind)
  if (!def) throw new Error(`Unknown junk piece: ${kind}`)
  return def
}

export function isJunkKind(kind: string): kind is JunkKind {
  return junkByKind.has(kind)
}
