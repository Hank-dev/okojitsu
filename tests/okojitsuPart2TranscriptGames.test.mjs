import assert from 'node:assert/strict'
import test from 'node:test'

import games from '../src/data/games.json' with { type: 'json' }
import gamesMeta from '../src/data/games-meta.json' with { type: 'json' }

const ids = [
  'okojitsu-part-2-get-behind',
  'okojitsu-part-2-stay-behind',
  'okojitsu-part-2-hips-to-shoulders',
]
const gamesById = new Map(games.map((game) => [game.id, game]))

test('adds the three constrained games and excludes the regular round', () => {
  for (const id of ids) {
    const game = gamesById.get(id)
    assert.ok(game, `missing ${id}`)
    assert.equal(game.source, 'ADCC Camp @ 10p South Bay with Greg Souders Part 2 - Full Session')
    assert.equal(game.sourceUrl, 'https://www.youtube.com/watch?v=CToduYRgjcs&t=445s')
    assert.doesNotMatch(game.designRationale, /\b\d{1,2}:\d{2}\b/)
  }

  assert.equal(games.some((game) => game.id === 'okojitsu-part-2-regular-round'), false)

  const counts = games.reduce((result, game) => {
    result[game.category] = (result[game.category] ?? 0) + 1
    return result
  }, {})
  assert.equal(gamesMeta.totalGames, games.length)
  assert.deepEqual(gamesMeta.categories, counts)
})

test('preserves the Get Behind terminal condition and restart', () => {
  const game = gamesById.get('okojitsu-part-2-get-behind')
  const text = JSON.stringify(game)
  assert.match(text, /closed-hand connections/i)
  assert.match(text, /locked-hands connection/i)
  assert.match(text, /behind an elbow/i)
  assert.match(text, /across the center line/i)
  assert.match(text, /release and restart/i)
})

test('preserves the continuous Stay Behind constraints', () => {
  const game = gamesById.get('okojitsu-part-2-stay-behind')
  const text = JSON.stringify(game)
  assert.equal(game.type, 'continuous')
  assert.match(text, /no chest-to-chest/i)
  assert.match(text, /no hooks/i)
  assert.match(text, /hands or hips on the mat/i)
  assert.match(text, /there is no terminal score/i)
})

test('preserves the Hips to Shoulders sequence and both players outcomes', () => {
  const game = gamesById.get('okojitsu-part-2-hips-to-shoulders')
  const text = JSON.stringify(game)
  assert.match(game.startingPosition, /belly-down or on all fours/i)
  assert.match(game.startingPosition, /belly-up/i)
  assert.match(text, /hips, hands, elbows, then shoulders/i)
  assert.match(text, /initiated from chest-to-back contact/i)
  assert.match(text, /do not initiate or finish from chest-to-chest/i)
  assert.match(text, /get to the feet and break the connection/i)
  assert.match(text, /turn to face/i)
  assert.match(text, /counter-submission/i)
})
