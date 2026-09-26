import assert from 'node:assert/strict'
import test from 'node:test'

import games from '../src/data/games.json' with { type: 'json' }
import gamesMeta from '../src/data/games-meta.json' with { type: 'json' }

const gamesById = new Map(games.map((game) => [game.id, game]))

test('adds all four constrained games described in the ØkoJitsu transcript', () => {
  const ids = [
    'okojitsu-get-behind-stay-behind',
    'okojitsu-submit-from-behind',
    'okojitsu-finding-closed-connections',
    'okojitsu-submit-from-chest-to-back',
  ]

  for (const id of ids) {
    assert.ok(gamesById.has(id), `missing ${id}`)
    assert.equal(gamesById.get(id).source, 'ADCC Camp @ 10p South Bay with Greg Souders Part 1')
    assert.equal(gamesById.get(id).sourceUrl, 'https://youtu.be/BaSFza6i3eo?si=9EKQvowf4JAzLpmI')
  }

  const counts = games.reduce((result, game) => {
    result[game.category] = (result[game.category] ?? 0) + 1
    return result
  }, {})
  assert.equal(gamesMeta.totalGames, games.length)
  assert.deepEqual(gamesMeta.categories, counts)
})

test('keeps transcript timestamps out of user-facing game descriptions', () => {
  const ids = [
    'okojitsu-get-behind-stay-behind',
    'okojitsu-submit-from-behind',
    'okojitsu-finding-closed-connections',
    'okojitsu-submit-from-chest-to-back',
  ]

  for (const id of ids) {
    assert.doesNotMatch(gamesById.get(id).designRationale, /\b\d{1,2}:\d{2}\b/)
  }
})

test('preserves the Get Behind, Stay Behind rules', () => {
  const game = gamesById.get('okojitsu-get-behind-stay-behind')
  const text = JSON.stringify(game)
  assert.equal(game.type, 'continuous')
  assert.match(text, /no terminal win condition/i)
  assert.match(text, /no chest-to-chest/i)
  assert.match(text, /no hooks or body triangle/i)
  assert.match(text, /standing in neutral/i)
  assert.match(text, /outside a knee/i)
})

test('preserves the Submit from Behind starts and terminal outcomes', () => {
  const game = gamesById.get('okojitsu-submit-from-behind')
  const text = JSON.stringify(game)
  assert.match(text, /front headlock/i)
  assert.match(text, /rear body/i)
  assert.match(text, /single-leg/i)
  assert.match(text, /closed-hands connection/i)
  assert.match(text, /hooks and leg entanglements are allowed/i)
  assert.match(text, /turn to face and get on top/i)
  assert.match(text, /return to the feet/i)
})

test('preserves both player win sets in Finding Closed Connections', () => {
  const game = gamesById.get('okojitsu-finding-closed-connections')
  const text = JSON.stringify(game)
  assert.match(game.startingPosition, /knee-shield half guard/i)
  assert.match(text, /seated open guard/i)
  assert.match(text, /closed leg connection/i)
  assert.match(text, /reversal/i)
  assert.match(text, /standing up/i)
  assert.match(text, /closed-hands connection/i)
  assert.match(text, /chest-to-chest or chest-to-back/i)
  assert.match(text, /stable/i)
})

test('keeps Submit from Chest to Back distinct from Submit from Behind', () => {
  const behind = gamesById.get('okojitsu-submit-from-behind')
  const chestToBack = gamesById.get('okojitsu-submit-from-chest-to-back')
  assert.notEqual(behind.id, chestToBack.id)

  const text = JSON.stringify(chestToBack)
  assert.match(text, /straight side/i)
  assert.match(text, /cross side/i)
  assert.match(text, /completely clear of the leg-entanglement threat/i)
  assert.match(text, /do not attack the leg/i)
  assert.match(text, /reversal/i)
  assert.match(text, /submission/i)
  assert.match(text, /getting to the feet/i)
  assert.match(text, /merely disconnecting is not a win/i)
})
