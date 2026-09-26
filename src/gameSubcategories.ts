import type { Game } from './types'

function uniqueLabels(values: Array<string | undefined>) {
  const labels: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const label = value?.trim()
    const key = label?.toLocaleLowerCase()
    if (!label || !key || seen.has(key)) continue
    seen.add(key)
    labels.push(label)
  }
  return labels
}

/** Manual memberships, including the legacy single subcategory value. */
export function getManualGameSubcategories(game: Game): string[] {
  return uniqueLabels([...(game.subcategories ?? []), game.subcategory])
}

export function getGameSeriesSubcategory(game: Game): string | null {
  const label = game.progression?.chainLabel.trim()
  return label ? `Series: ${label}` : null
}

/** All visible memberships. A series is additive and never replaces manual taxonomy. */
export function getGameSubcategories(game: Game): string[] {
  return uniqueLabels([...getManualGameSubcategories(game), getGameSeriesSubcategory(game) ?? undefined])
}

export function gameHasSubcategory(game: Game, subcategory: string): boolean {
  return getGameSubcategories(game).includes(subcategory)
}

function includesAny(value: string, terms: string[]) {
  return terms.some(term => value.includes(term))
}

export function inferGameSubcategory(game: Game): string {
  const id = game.id.toLowerCase()

  switch (game.category) {
    case 'guard-passing':
      return ''
    case 'pinning':
      return ''
    case 'standing':
      if (includesAny(id, ['hand', 'grip', 'hands-down', 'closed-hands', 'connection-warmup'])) return 'Hand fighting & inside position'
      if (includesAny(id, ['overhook', 'underhook', 'over-under', 'stick-and-pull', 'stay-connected', 'connection-cycling'])) return 'Clinch connection & control'
      if (includesAny(id, ['snapdown', 'single-leg', 'foot-sweep', 'dynamic-start'])) return 'Takedown entries & finishes'
      if (includesAny(id, ['get-to-back', 'frame-game', 'back-single-back', 'two-on-one'])) return 'Body-lock & back access'
      return 'Open wrestling rounds'
    case 'guard':
      if (id.startsWith('pj-')) return 'Open guard pressure'
      if (id.startsWith('supine-')) return 'Supine retention & destabilisation'
      if (id.startsWith('butterfly-')) return 'Butterfly guard'
      if (id.startsWith('fundamentals-')) return 'Inside position'
      return 'Offensive open guard'
    case 'half-guard':
      if (id.startsWith('wrist-pin-')) return 'Wrist-pin passing'
      if (id.startsWith('halfguard-knee-shield')) return 'Knee-shield half guard'
      return 'Past-the-knees pinning'
    case 'seated-guard':
      if (includesAny(id, ['wrestling-up', 'destabilising'])) return 'Wrestle-up & destabilise'
      if (id.includes('handfight')) return 'Seated hand fighting'
      if (id.startsWith('seated-upper')) return 'Upper-body connections'
      return 'Seated versus standing'
    case 'k-guard-dlr':
      if (id.startsWith('kguard-')) return 'K-guard'
      if (id.startsWith('dlr-')) return 'De La Riva'
      return 'Closed-guard entries'
    case 'back-control':
      if (id.startsWith('turtle-')) return 'Turtle entries'
      if (id.includes('arm-trap')) return 'Arm-trap control'
      if (includesAny(id, ['no-subs', 'with-subs', 'rear-mount'])) return 'Rear-mount maintenance & finishing'
      if (id.startsWith('alllevels-') || id.startsWith('seminar-') || id.startsWith('pinning-')) return 'Back-take connections'
      return 'Back control'
    case 'armbar':
      if (id.includes('holding')) return 'Armbar retention'
      if (id.includes('isolating')) return 'Arm isolation'
      if (includesAny(id, ['full-process', 'mount-elbow'])) return 'Mount entries to armbar'
      return 'Elbow control & finishing'
    case 'front-headlock':
      if (includesAny(id, ['back-to-mat', 'finishing'])) return 'Front-headlock finishing'
      return 'Front-headlock progression'
    case 'kimura':
      if (id.includes('keeping')) return 'Kimura retention'
      return 'Kimura attacks & back takes'
    case 'leg-locks':
      if (id.includes('leg-drag')) return 'Leg-drag back takes'
      if (includesAny(id, ['straight-ashi', 'inside-heel', 'inside-position'])) return 'Inside position & ashi'
      if (includesAny(id, ['outside-heel', '9010', '5050', 'saddle'])) return 'Outside entanglements & upgrades'
      if (id.includes('ankle-heel')) return 'Ankle-lock & heel-hook dilemmas'
      if (id.startsWith('supine-') || id.startsWith('diego-')) return 'Supine entries & wrestle-up'
      if (id.startsWith('bteam-')) return 'Entanglement flow & control'
      if (id.startsWith('rob-cole-')) return 'Leg-entanglement systems'
      if (id.startsWith('woj-')) return 'Woj lock'
      return 'Leg-entanglement fundamentals'
    case 'triangle':
      return id.includes('finish') ? 'Triangle finish' : 'Triangle threat & lock'
    case 'whole-space':
      return id.startsWith('transcript-') ? 'Competition score rounds' : 'Whole-space navigation'
    case 'stand-up':
      if (includesAny(id, ['hand-denial', 'reattack'])) return 'Hand denial & re-attacks'
      if (id.includes('turtle')) return 'Turtle breakdowns'
      if (includesAny(id, ['chest', 'one-hand'])) return 'Grounded get-ups'
      return 'Guard connections & standing up'
    case 'submissions':
      return id.startsWith('scaling-') ? 'Submission finishing' : 'Whole-game submissions'
    default:
      return 'General'
  }
}

const UPPER_BODY_SUBMISSION_SUBCATEGORIES: Record<string, string> = {
  armbar: 'Armbar',
  triangle: 'Triangle',
  kimura: 'Kimura',
  'front-headlock': 'Front headlock',
}

const GUARD_SUBCATEGORIES: Record<string, string> = {
  'seated-guard': 'Seated open guard',
  'half-guard': 'Half guard',
  'k-guard-dlr': 'K-Guard & DLR',
}

export const CONSOLIDATED_CATEGORY_KEYS = new Set([
  ...Object.keys(UPPER_BODY_SUBMISSION_SUBCATEGORIES),
  ...Object.keys(GUARD_SUBCATEGORIES),
])

/** Keep the source records stable while presenting the revised library taxonomy. */
export function normalizeGameTaxonomy(game: Game): Game {
  const upperBodySubcategory = UPPER_BODY_SUBMISSION_SUBCATEGORIES[game.category]
  if (upperBodySubcategory) {
    return { ...game, category: 'submissions', subcategory: upperBodySubcategory }
  }

  const guardSubcategory = GUARD_SUBCATEGORIES[game.category]
  if (guardSubcategory) {
    return { ...game, category: 'guard', subcategory: guardSubcategory }
  }

  if (game.id === 'crab-ride-hips-shoulders') {
    return { ...game, category: 'guard', subcategory: 'Inside position' }
  }

  if (game.id === 'alllevels-allfours-rear') {
    return { ...game, category: 'turtle', subcategory: '' }
  }

  if (game.category === 'guard') {
    return { ...game, subcategory: 'Supine open guard' }
  }

  if (game.category === 'guard-passing' || game.category === 'pinning') {
    return { ...game, subcategory: '' }
  }

  return game
}
