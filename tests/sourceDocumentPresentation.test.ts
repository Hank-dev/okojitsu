import assert from 'node:assert/strict'
import test from 'node:test'
import type { Game } from '../src/types.ts'
import {
  getPresentedSharedConstraints,
  getPresentedTaskFocus,
  getPresentedTaskObjective,
  getSourceDocumentGameTaskFocus,
  getSourceDocumentRationale,
  getSourceDocumentTaskFocus,
} from '../src/sourceDocumentPresentation.ts'

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: 'website-only-game',
    title: 'Website-only game',
    category: 'guard',
    source: 'Website',
    level: 'beginner',
    type: 'mixed',
    startingPosition: 'A documented start.',
    players: [
      { role: 'Player 1', objective: 'Reach the target.', winCondition: 'Legacy duplicate.', constraints: ['Keep one hand connected'] },
      { role: 'Player 2', objective: 'Prevent the target.', winCondition: 'Legacy duplicate.', constraints: [] },
    ],
    constraints: [
      'Keep one hand connected',
      'Continuous — switch roles after a score',
      'The game is continuous; there is no terminal score.',
      'Switch after a set time',
    ],
    tags: [],
    skills: ['connection'],
    progression: null,
    ...overrides,
  }
}

test('website-only games retain their existing objective without invented optional fields', () => {
  const websiteGame = game()
  assert.equal(getPresentedTaskObjective(websiteGame, 0), 'Reach the target.')
  assert.deepEqual(getSourceDocumentTaskFocus(websiteGame.id, 0), [])
  assert.deepEqual(getSourceDocumentGameTaskFocus(websiteGame.id), [])
  assert.equal(getSourceDocumentRationale(websiteGame), undefined)
})

test('shows a saved game rationale without requiring a source-document whitelist entry', () => {
  assert.equal(getSourceDocumentRationale(game({ designRationale: 'This constraint makes posture observable.' })), 'This constraint makes posture observable.')
})

test('separates task objectives from exact source-document task focus', () => {
  const sourceGame = game({ id: 'alllevels-arm-figure-four' })
  assert.equal(getPresentedTaskObjective(sourceGame, 0), 'Submit OR take the back')
  assert.deepEqual(getSourceDocumentTaskFocus(sourceGame.id, 0), [
    "Keep hips as close to partner's shoulder as possible at all times",
    'Separate the arm from everything it can touch (body, other arm, leg)',
    'Once separated: chain threats continuously (twisting lock → straight lock → strangle) — no lag time between threats',
  ])
})

test('presents task focus saved on a custom game and removes blank duplicates', () => {
  const customGame = game({
    players: [
      { ...game().players[0], taskFocus: ['Stay connected', 'Stay connected', '  '] },
      game().players[1],
    ],
  })
  assert.deepEqual(getPresentedTaskFocus(customGame, 0), ['Stay connected'])
})

test('keeps shared source focus separate when the document does not assign it to one player', () => {
  assert.deepEqual(getSourceDocumentGameTaskFocus('kguard-dlr-closed-guard-together'), [
    'Players choose their own focus — shoulder connections, leg connections, or entanglements — based on what they want to develop.',
  ])
})

test('removes lifecycle labels, generic winner role flips, and exact player-constraint duplicates', () => {
  assert.deepEqual(getPresentedSharedConstraints(game()), ['Switch after a set time'])
  assert.deepEqual(getPresentedSharedConstraints(game({ constraints: ['Win → roles switch'] })), [])
  assert.deepEqual(getPresentedSharedConstraints(game({ constraints: ['Continuous — flip-flop on win'] })), [])
  assert.deepEqual(getPresentedSharedConstraints(game({ constraints: ['Switch top to bottom every time bottom player wins'] })), [])
  assert.deepEqual(getPresentedSharedConstraints(game({ constraints: ['Resets: Start again each time someone wins.'] })), [])
})

test('preserves the approved rationale override when one exists', () => {
  assert.equal(getSourceDocumentRationale(game({ id: 'outside-camping-line-holding', designRationale: 'A task-focus quote.' })), 'A task-focus quote.')
  assert.equal(
    getSourceDocumentRationale(game({ id: 'just-stand-up-guard-standup', designRationale: 'Stored paraphrase.' })),
    'This emerged live during the session. The design forces the top player to also monitor and prevent the stand-up, not just focus on passing. Naturally surfaces concepts like controlling the bottom leg.',
  )
})
