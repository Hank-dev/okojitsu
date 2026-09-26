import test from 'node:test'
import assert from 'node:assert/strict'
import type { Game } from '../src/types.ts'
import {
  countGamesByCategory,
  countGameUsage,
  filterGames,
  gameMatchesSearch,
  getPlayerGoalType,
  mergeGamesWithOverrides,
  sortGames,
} from '../src/library.ts'
import { gameHasSubcategory, getGameSubcategories, inferGameSubcategory, normalizeGameTaxonomy } from '../src/gameSubcategories.ts'

const mixed: Game = {
  id: 'mixed',
  title: 'Feet Off',
  category: 'guard-passing',
  source: 'Test',
  level: 'beginner',
  type: 'mixed',
  startingPosition: 'Top stands over supine guard',
  players: [
    { role: 'Passer', objective: 'Keep the feet away', winCondition: 'Continuous - maintain posture.', constraints: ['No knees down'] },
    { role: 'Guard', objective: 'Make the passer sit', winCondition: 'Passer touches their butt to the mat.', constraints: [] },
  ],
  constraints: ['Reset after a score'],
  designRationale: 'Trains connection and balance.',
  tags: ['warmup'],
  skills: ['connection'],
  progression: null,
}

test('searches only title, starting position, and rationale', () => {
  for (const query of ['feet off', 'supine', 'balance']) {
    assert.equal(gameMatchesSearch(mixed, query), true)
  }
  for (const query of ['keep the feet', 'touches their butt', 'passer', 'no knees', 'guard-passing', 'warmup', 'after a score']) {
    assert.equal(gameMatchesSearch(mixed, query), false)
  }
})

test('does not search category labels or subcategories', () => {
  const standingGame: Game = { ...mixed, category: 'standing' }
  assert.deepEqual(filterGames([{ ...standingGame, subcategory: 'Turtle' }], {
    category: 'all',
    level: 'all',
    type: 'all',
    skill: 'all',
    query: "Wraslin'",
    categoryLabels: { standing: "Wraslin'" },
  }), [])
  assert.equal(gameMatchesSearch({ ...standingGame, subcategory: 'Turtle' }, 'turtle'), false)
})

test('combines category, level, type, skill, and query filters', () => {
  assert.deepEqual(filterGames([mixed], {
    category: 'guard-passing',
    level: 'beginner',
    type: 'mixed',
    skill: 'connection',
    query: 'balance',
  }), [mixed])
  assert.deepEqual(filterGames([mixed], {
    category: 'guard',
    level: 'beginner',
    type: 'mixed',
    skill: 'connection',
    query: '',
  }), [])
})

test('counts categories from live games', () => {
  assert.deepEqual(countGamesByCategory([mixed, { ...mixed, id: 'second' }]), {
    all: 2,
    'guard-passing': 2,
  })
})

test('uses same-id custom games as overrides instead of showing duplicate seed games', () => {
  const edited = { ...mixed, title: 'Edited Feet Off', designRationale: 'Updated rationale.' }
  const customOnly = { ...mixed, id: 'custom-only', title: 'Custom only' }

  assert.deepEqual(mergeGamesWithOverrides(
    [mixed, { ...mixed, id: 'deleted-seed' }],
    [edited, customOnly],
    ['deleted-seed'],
  ), [edited, customOnly])
})

test('sorts recommended games by session-plan use, then by title', () => {
  const passing = { ...mixed, id: 'passing', title: 'Beta', category: 'guard-passing' }
  const back = { ...mixed, id: 'back', title: 'Zulu', category: 'back-control' }
  const guard = { ...mixed, id: 'guard', title: 'Alpha', category: 'guard' }
  const games = [passing, back, guard]
  const labels = { 'guard-passing': 'Passing', 'back-control': 'Back Control', guard: 'Guard' }

  assert.deepEqual(sortGames(games, 'recommended', labels, { back: 3, guard: 3, passing: 1 }).map(game => game.id), ['guard', 'back', 'passing'])
  assert.deepEqual(sortGames(games, 'title', labels).map(game => game.id), ['guard', 'passing', 'back'])
  assert.deepEqual(sortGames(games, 'category', labels).map(game => game.id), ['back', 'guard', 'passing'])
  assert.deepEqual(games.map(game => game.id), ['passing', 'back', 'guard'])
})

test('counts every game use across published session plans', () => {
  assert.deepEqual(countGameUsage([
    { id: 'one', title: 'One', date: '2026-08-29', duration: 12, level: 'beginner', focus: '', notes: '', games: [{ gameId: 'mixed', duration: 6 }, { gameId: 'second', duration: 6 }] },
    { id: 'two', title: 'Two', date: '2026-08-30', duration: 6, level: 'beginner', focus: '', notes: '', games: [{ gameId: 'mixed', duration: 6 }] },
  ]), { mixed: 2, second: 1 })
})

test('classifies standing games into meaningful browse subcategories', () => {
  assert.equal(inferGameSubcategory({ ...mixed, id: 'greg-bteam-hand-fight-collect', category: 'standing' }), 'Hand fighting & inside position')
  assert.equal(inferGameSubcategory({ ...mixed, id: 'greg-single-leg-finish', category: 'standing' }), 'Takedown entries & finishes')
  assert.equal(inferGameSubcategory({ ...mixed, id: 'scott-catch-release-wrestling', category: 'standing' }), 'Open wrestling rounds')
})

test('adds a game series as a second subcategory without replacing existing memberships', () => {
  const seriesGame: Game = {
    ...mixed,
    subcategory: 'Butterfly guard',
    subcategories: ['Wrestle-up'],
    progression: { chain: 'guard-flow', chainLabel: 'Guard Flow', step: 2, totalSteps: 4, prevId: 'one', nextId: 'three' },
  }

  assert.deepEqual(getGameSubcategories(seriesGame), ['Wrestle-up', 'Butterfly guard', 'Series: Guard Flow'])
  assert.equal(gameHasSubcategory(seriesGame, 'Butterfly guard'), true)
  assert.equal(gameHasSubcategory(seriesGame, 'Series: Guard Flow'), true)
})

test('normalizes the revised library taxonomy without deleting games', () => {
  assert.deepEqual(
    normalizeGameTaxonomy({ ...mixed, category: 'armbar' }),
    { ...mixed, category: 'submissions', subcategory: 'Armbar' },
  )
  assert.deepEqual(
    normalizeGameTaxonomy({ ...mixed, category: 'seated-guard' }),
    { ...mixed, category: 'guard', subcategory: 'Seated open guard' },
  )
  assert.equal(normalizeGameTaxonomy({ ...mixed, category: 'guard' }).subcategory, 'Supine open guard')
  assert.equal(normalizeGameTaxonomy({ ...mixed, id: 'crab-ride-hips-shoulders', category: 'pinning' }).subcategory, 'Inside position')
  assert.equal(normalizeGameTaxonomy({ ...mixed, id: 'alllevels-allfours-rear', category: 'back-control' }).category, 'turtle')
})

test('infers each player goal type in mixed games', () => {
  assert.equal(getPlayerGoalType(mixed, 0), 'continuous')
  assert.equal(getPlayerGoalType(mixed, 1), 'terminal')
})

test('infers blank mixed-game win conditions as continuous', () => {
  const blankMixed: Game = {
    ...mixed,
    players: [{ ...mixed.players[0], winCondition: '' }, mixed.players[1]],
  }
  assert.equal(getPlayerGoalType(blankMixed, 0), 'continuous')
})

test('infers no-win and maintenance mixed-game wording as continuous', () => {
  for (const winCondition of ['No win condition.', 'Maintenance only.', 'No win condition — survival/maintenance only.']) {
    const continuousMixed: Game = {
      ...mixed,
      players: [{ ...mixed.players[0], winCondition }, mixed.players[1]],
    }
    assert.equal(getPlayerGoalType(continuousMixed, 0), 'continuous')
  }
})
