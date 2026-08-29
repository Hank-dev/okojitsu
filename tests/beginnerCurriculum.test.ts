import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import gamesData from '../src/data/games.json' with { type: 'json' }
import { BEGINNER_SEMESTER } from '../src/data/beginner-curriculum.ts'

test('the beginner semester has 18 six-game sessions using only library games', () => {
  assert.equal(BEGINNER_SEMESTER.length, 18)
  const gameIds = new Set(gamesData.map(game => game.id))

  for (const session of BEGINNER_SEMESTER) {
    assert.equal(session.games.length, 6, `week ${session.week} must have six games`)
    for (const game of session.games) {
      assert.equal(game.duration, 6, `${game.gameId} must be six minutes`)
      assert.equal(gameIds.has(game.gameId), true, `${game.gameId} must exist in the game library`)
    }
  }
})

test('the primary navigation does not expose the Curriculum tab', () => {
  const app = readFileSync('src/App.tsx', 'utf8')
  const navigation = app.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? ''
  assert.doesNotMatch(navigation, /Curriculum/)
})
