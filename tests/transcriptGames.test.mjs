import assert from 'node:assert/strict'
import test from 'node:test'

import games from '../src/data/games.json' with { type: 'json' }
import gamesMeta from '../src/data/games-meta.json' with { type: 'json' }

const transcriptIds = [
  'transcript-standing-connection-wins',
  'transcript-bottom-offensive-connection',
  'transcript-connection-warmup',
  'transcript-competition-score-rounds',
]

const gamesById = new Map(games.map((game) => [game.id, game]))

test('adds four uniquely identified transcript games and updates metadata totals', () => {
  assert.equal(new Set(games.map((game) => game.id)).size, games.length)
  assert.equal(new Set(transcriptIds).size, transcriptIds.length)
  for (const id of transcriptIds) {
    assert.ok(gamesById.has(id), `missing ${id}`)
    assert.equal(gamesById.get(id).source, 'User-supplied transcript')
    assert.equal(gamesById.get(id).sourceUrl, null)
  }

  const categoryCounts = Object.fromEntries(
    Object.entries(games.reduce((counts, game) => {
      counts[game.category] = (counts[game.category] ?? 0) + 1
      return counts
    }, {})).sort(([left], [right]) => left.localeCompare(right)),
  )
  assert.equal(gamesMeta.totalGames, games.length)
  assert.deepEqual(gamesMeta.categories, categoryCounts)
  assert.equal(gamesMeta.totalGames, 165)
})

test('preserves the standing connection game transcript conditions', () => {
  const game = gamesById.get('transcript-standing-connection-wins')
  const text = JSON.stringify(game)
  assert.match(text, /rear-facing/i)
  assert.match(text, /both legs collected/i)
  assert.match(text, /chest-to-chest/i)
  assert.match(text, /stand up|get away/i)
  assert.match(text, /break all connections/i)
  assert.match(text, /flip roles after every win/i)
  assert.match(game.designRationale, /2:41-5:23/)
})

test('preserves the bottom offensive game transcript conditions', () => {
  const game = gamesById.get('transcript-bottom-offensive-connection')
  const text = JSON.stringify(game)
  assert.match(text, /belly-up/i)
  assert.match(text, /non-entanglement/i)
  assert.match(text, /single or double feet inside/i)
  assert.match(text, /cross-leg/i)
  assert.match(text, /cross-arm/i)
  assert.match(text, /connected hands/i)
  assert.match(text, /stay in the pocket/i)
  assert.match(text, /not necessarily trying to pass/i)
  assert.match(text, /continuous defense/i)
  assert.match(game.designRationale, /9:04-12:45/)
})

test('preserves the connection warm-up and competition round formats', () => {
  const warmup = gamesById.get('transcript-connection-warmup')
  const warmupText = JSON.stringify(warmup)
  assert.match(warmup.startingPosition, /start standing/i)
  assert.match(warmupText, /six-minute/i)
  assert.match(warmupText, /leg off the ground/i)
  assert.match(warmupText, /front-facing/i)
  assert.match(warmupText, /rear-facing/i)
  assert.match(warmupText, /shoulder/i)
  assert.match(warmupText, /new partner every round/i)

  const competition = gamesById.get('transcript-competition-score-rounds')
  const competitionText = JSON.stringify(competition)
  assert.match(competitionText, /takedown/i)
  assert.match(competitionText, /pass/i)
  assert.match(competitionText, /back take/i)
  assert.match(competitionText, /submission/i)
  assert.match(competitionText, /restart after every/i)
  assert.match(competitionText, /four 10-minute rounds/i)
  assert.match(competitionText, /chooses the next start/i)
  assert.match(competition.designRationale, /18:24-20:20/)
})
