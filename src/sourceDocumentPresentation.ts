import type { Game } from './types'

const TASK_FOCUS_BY_PLAYER: Readonly<Record<string, Readonly<Record<number, readonly string[]>>>> = {
  'pj-adcc-simulation': {
    0: ['Pacing, risk management, staying disciplined with hand fighting when tired'],
  },
  'seminar-segmentation-to-pin': {
    0: [
      "Remove partner's hands",
      'Get under or behind the elbows',
      'Connect to shoulders and cover hips to win',
    ],
  },
  'outside-camping-line-holding': {
    0: ['Keep feet off your body and off the mat. "If the bottom player made your hip touch, that means their feet were on you somehow."'],
  },
  'greg-single-leg-finish': {
    0: ['Focus on lifting the ankle as high as possible or double leg control'],
  },
  'outside-camping-outside-knee': {
    0: ['Focus on pulling their head close to you to negate leg pummeling'],
  },
  'seated-wrestling-up-connection': {
    0: [
      "1st priority: Keep top player's hands off of you — remove them as soon as they reach in",
      '2nd priority: Make leg-to-leg connections (combination of legs and hands)',
    ],
  },
  'seated-handfight': {
    1: ['Inside position, more connections on him than he has on you.'],
  },
  'halfguard-segmenting-to-pin': {
    0: ["Segment the periphery sequentially. Don't think side control or mount — think about what's directly in front of you and remove it."],
  },
  'seated-upper-wrist-control': {
    0: ["partner's wrists, elbows, and hands (any combination)"],
  },
  'supine-competing-destabilizations': {
    0: ['Keep tops or bottoms of feet touching partner anywhere on their body'],
  },
  'turtle-stay-behind': {
    0: ["continuously drive defender's hands to the mat to prevent them from fighting your connections"],
  },
  'bteam-stay-under-elbows-submit': {
    0: ['Stay under at least one elbow at all times — even a head counts'],
  },
  'mount-under-elbow-submission': {
    1: ['Focus on causing posting from top player to gain space to retract elbows'],
  },
  'crab-ride-hips-shoulders': {
    0: ['Two-stage destabilization — must make hands or hips touch before progressing to next line. "You must make the hands touch or hips touch before you try to go to the hips. Then once you get to the hips, you must make the hands touch or hips touch again before you get to the shoulders."'],
  },
  'kimura-keeping-arm-bent': {
    0: ['Separate the bent arm from the rest of the body.'],
  },
  'kimura-attack-from-grip': {
    0: [
      'Separate the arm from the rest of the body',
      'For the kimura lock: get the hand behind the back and twist the arm.',
    ],
  },
  'leglock-finish-or-backtake': {
    0: ['Chase hips and hands — alternate between back and legs fluidly. "Play the whole space."'],
  },
  'just-stand-up-chest-free-grip': {
    1: ['Grip fighting — deny attachments while escaping'],
  },
  'woj-control-no-submit': {
    0: ['Focus on control only.'],
  },
  'fundamentals-inside-one-leg': {
    0: ['Treat feet like hands – probe with one leg, retract, use it to close distance.'],
  },
  'alllevels-leg-entanglements': {
    0: [
      'Stay as close to partner as possible, maintain hip attachment',
      'Search for access to both legs as a precursor to heel exposure',
      "Capture the partner's toes with arm/body",
    ],
  },
  'alllevels-arm-figure-four': {
    0: [
      "Keep hips as close to partner's shoulder as possible at all times",
      'Separate the arm from everything it can touch (body, other arm, leg)',
      'Once separated: chain threats continuously (twisting lock → straight lock → strangle) — no lag time between threats',
    ],
  },
  'alllevels-side-control-hip': {
    0: [
      "Remove the bottom player's hands (beat the push, stay chest to chest)",
      'Search for underhooks — prioritize the bottom arm underhook above all else',
    ],
  },
  'alllevels-allfours-rear': {
    0: [
      "Always stay taller/higher than partner's back — never fall below their hip height",
      'Break partner off their base points progressively: feet → knees → hips / hands → elbows → shoulders',
    ],
  },
}

const TASK_FOCUS_BY_GAME: Readonly<Record<string, readonly string[]>> = {
  'kguard-dlr-closed-guard-together': [
    'Players choose their own focus — shoulder connections, leg connections, or entanglements — based on what they want to develop.',
  ],
}

const TASK_OBJECTIVE_BY_PLAYER: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  'pj-adcc-simulation': {
    0: 'Score via ADCC rules (takedowns, guard passes, back takes, sweeps). Submission ends the match.',
  },
  'greg-single-leg-finish': {
    0: 'Takedown (hip or knee touching the mat for 3 seconds)',
  },
  'outside-camping-outside-knee': {
    0: "Same as above but must specifically maintain position outside partner's legs",
  },
  'seminar-segmentation-to-pin': {
    0: 'Chest-to-chest or chest-to-back contact · Get under both elbows with connected hands · Cover the hips',
    1: 'Get both legs back in front, or roll top player over, or stand up',
  },
  'seated-wrestling-up-connection': {
    0: "Go belly up to destabilize partner → then achieve hip entanglement (standard or otherwise) OR get partner's hands to mat · Wrestle up from connection all the way to partner's hips",
    1: 'Work to the outside of the legs, put bottom player on their back · Achieve shin-to-body contact anywhere from hips to shoulders',
  },
  'seated-upper-wrist-control': {
    0: 'cause posting → get hands connected → get behind, on top, or put partner on back',
    1: 'Connect hands around partner · Win by putting bottom player on their back or going around the legs to put them on back',
  },
  'woj-control-no-submit': {
    0: 'Try to establish and hold the Woj lock position without finishing the submission.',
  },
  'turtle-stay-behind': {
    0: "Stay behind both of defender's elbows at all times · Keep defender between your limbs",
  },
  'bteam-stay-under-elbows-submit': {
    0: 'Submit partner — but only while under at least one elbow. All submissions must be executed from underneath the elbow.',
  },
  'alllevels-leg-entanglements': {
    0: 'Finish a leg submission OR come up to take the back',
  },
  'alllevels-arm-figure-four': {
    0: 'Submit OR take the back',
  },
  'alllevels-side-control-hip': {
    0: 'Submit',
  },
  'alllevels-allfours-rear': {
    0: 'Submit from any pin (chest to chest or chest to back)',
  },
}

const SOURCE_DOCUMENT_RATIONALE_OVERRIDES: Readonly<Record<string, string>> = {
  'just-stand-up-guard-standup': 'This emerged live during the session. The design forces the top player to also monitor and prevent the stand-up, not just focus on passing. Naturally surfaces concepts like controlling the bottom leg.',
}

export function getSourceDocumentTaskFocus(gameId: string, playerIndex: number): readonly string[] {
  return TASK_FOCUS_BY_PLAYER[gameId]?.[playerIndex] ?? []
}

export function getSourceDocumentGameTaskFocus(gameId: string): readonly string[] {
  return TASK_FOCUS_BY_GAME[gameId] ?? []
}

export function getPresentedTaskFocus(game: Game, playerIndex: number): string[] {
  return Array.from(new Set([
    ...getSourceDocumentTaskFocus(game.id, playerIndex),
    ...(game.players[playerIndex]?.taskFocus ?? []),
  ].map(focus => focus.trim()).filter(Boolean)))
}

export function getPresentedTaskObjective(game: Game, playerIndex: number): string {
  return TASK_OBJECTIVE_BY_PLAYER[game.id]?.[playerIndex]
    ?? game.players[playerIndex]?.objective?.trim()
    ?? ''
}

function withoutLifecycleLabel(constraint: string): string {
  const trimmed = constraint.trim()
  if (/^(?:the game is )?continuous(?: task| objective| game)?[.;]?$/i.test(trimmed)) return ''
  if (/^terminal(?: task| objective| game)?[.;]?$/i.test(trimmed)) return ''
  if (/^the game is continuous; there is no terminal (?:score|win condition)\.?$/i.test(trimmed)) return ''

  const withoutPrefix = trimmed.replace(/^(?:continuous|terminal)\s*[—–:-]\s*/i, '')
  if (/^no (?:win|terminal|win condition)\b/i.test(withoutPrefix)) return ''
  return withoutPrefix
}

function isGenericWinnerResetOrRoleFlip(constraint: string): boolean {
  const normalized = constraint.trim().replace(/[.]+$/, '')
  const hasOutcome = /\b(?:win|wins|winner|score|point|success|escape|fall)\b/i.test(normalized)
  const changesRoles = /\b(?:switch|swap|change)\b[^.;]*\b(?:roles?|positions?|top\s*(?:\/|to)\s*bottom)\b/i.test(normalized)
    || /\b(?:roles?|positions?|top\s*(?:\/|to)\s*bottom)\b[^.;]*\b(?:switch|swap|change)\b/i.test(normalized)
    || /\bflip(?:-flop)?\b/i.test(normalized)

  if (hasOutcome && changesRoles) return true
  if (/^switch when\b/i.test(normalized)) return true
  return /^(?:resets?\s*:\s*)?(?:start again|reset|restart)\b[^.;]*\b(?:someone wins|either player (?:wins|reaches)|a win|each win)\b/i.test(normalized)
}

export function getPresentedSharedConstraints(game: Game): string[] {
  const playerConstraints = new Set(game.players.flatMap(player => player.constraints.map(constraint => constraint.trim())))
  return game.constraints
    .map(withoutLifecycleLabel)
    .filter(constraint => (
      constraint.length > 0
      && !playerConstraints.has(constraint)
      && !isGenericWinnerResetOrRoleFlip(constraint)
    ))
}

export function getSourceDocumentRationale(game: Game): string | undefined {
  const override = SOURCE_DOCUMENT_RATIONALE_OVERRIDES[game.id]
  if (override) return override
  return game.designRationale?.trim() || undefined
}
