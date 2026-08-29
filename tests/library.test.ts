import test from 'node:test'
import assert from 'node:assert/strict'
import type { Game } from '../src/types.ts'
import {
  countGamesByCategory,
  filterGames,
  gameMatchesSearch,
  getPlayerGoalType,
  sortGames,
} from '../src/library.ts'

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

test('searches objectives, win conditions, roles, constraints, position, category, tags, and skills', () => {
  for (const query of ['keep the feet', 'touches their butt', 'passer', 'no knees', 'supine', 'guard-passing', 'warmup', 'connection']) {
    assert.equal(gameMatchesSearch(mixed, query), true)
  }
})

test('searches a game subcategory', () => {
  assert.equal(gameMatchesSearch({ ...mixed, subcategory: 'Butterfly guard' }, 'butterfly'), true)
})

test('searches the visible category label', () => {
  const backControlGame: Game = { ...mixed, category: 'back-control' }
  assert.equal(gameMatchesSearch(backControlGame, 'Back Control'), true)
})

test('searches visible category labels that differ from their slug', () => {
  const standingGame: Game = { ...mixed, category: 'standing' }
  assert.deepEqual(filterGames([standingGame], {
    category: 'all',
    level: 'all',
    type: 'all',
    skill: 'all',
    query: "Wraslin'",
    categoryLabels: { standing: "Wraslin'" },
  }), [standingGame])
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

test('sorts by title or visible category while recommended keeps curated order', () => {
  const passing = { ...mixed, id: 'passing', title: 'Beta', category: 'guard-passing' }
  const back = { ...mixed, id: 'back', title: 'Zulu', category: 'back-control' }
  const guard = { ...mixed, id: 'guard', title: 'Alpha', category: 'guard' }
  const games = [passing, back, guard]
  const labels = { 'guard-passing': 'Passing', 'back-control': 'Back Control', guard: 'Guard' }

  assert.deepEqual(sortGames(games, 'recommended', labels).map(game => game.id), ['passing', 'back', 'guard'])
  assert.deepEqual(sortGames(games, 'title', labels).map(game => game.id), ['guard', 'passing', 'back'])
  assert.deepEqual(sortGames(games, 'category', labels).map(game => game.id), ['back', 'guard', 'passing'])
  assert.deepEqual(games.map(game => game.id), ['passing', 'back', 'guard'])
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
