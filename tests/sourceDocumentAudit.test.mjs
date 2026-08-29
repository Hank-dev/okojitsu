import assert from 'node:assert/strict'
import test from 'node:test'

import games from '../src/data/games.json' with { type: 'json' }

const gamesById = new Map(games.map((game) => [game.id, game]))

test('preserves the original Diego Pato inside-position game conditions', () => {
  const game = gamesById.get('diego-pato-inside-vs-standing')

  assert.match(game.players[0].objective, /ankle to hip/i)
  assert.match(game.players[0].objective, /two-hand connection to both legs/i)
  assert.match(game.players[1].objective, /step inside or outside/i)
  assert.match(game.players[1].objective, /stay right in front/i)
})

test('preserves the original Diego Pato cross-leg game conditions', () => {
  const game = gamesById.get('diego-pato-cross-leg-top')

  assert.match(game.players[0].objective, /at all times/i)
  assert.match(game.players[0].objective, /two-hand connection to both legs/i)
  assert.match(game.players[0].objective, /keeping feet hidden inside/i)
  assert.match(game.players[0].objective, /full space/i)
  assert.match(game.players[1].objective, /order doesn't matter/i)
})

test('preserves the original B-Team day 2 game conditions', () => {
  const threeCondition = gamesById.get('bteam-day2-three-condition')
  const toeCapture = gamesById.get('bteam-day2-toe-capture')
  const progressiveFinishing = gamesById.get('bteam-day2-progressive-finishing')
  const keepThemDown = gamesById.get('bteam-day2-keep-them-down')

  assert.match(threeCondition.players[0].objective, /any order/i)
  assert.match(threeCondition.players[0].objective, /before losing connection/i)
  assert.match(toeCapture.players[0].objective, /without losing connection/i)
  assert.match(progressiveFinishing.players[0].objective, /single leg/i)
  assert.match(progressiveFinishing.players[0].objective, /just inside position/i)
  assert.match(keepThemDown.players[0].objective, /full space/i)
})

test('allows the Just Stand Up hand-denial attacker to connect their hands', () => {
  const game = gamesById.get('just-stand-up-hand-denial')

  assert.equal(game.players[0].constraints.length, 0)
  assert.match(game.players[0].objective, /connect hands/i)
})

test('keeps the documented Fundamentals and All Levels task details', () => {
  const destabilize = gamesById.get('fundamentals-destabilize-knee-line')
  const rearMount = gamesById.get('fundamentals-rear-mount')
  const figureFour = gamesById.get('alllevels-arm-figure-four')
  const allFours = gamesById.get('alllevels-allfours-rear')

  assert.match(destabilize.players[0].objective, /let them stand, restart/i)
  assert.match(destabilize.players[0].objective, /keep them there/i)
  assert.match(rearMount.players[1].objective, /legs.*arm trapping/i)
  assert.match(figureFour.players[0].objective, /at all times/i)
  assert.match(figureFour.players[0].objective, /no lag time/i)
  assert.match(allFours.players[0].objective, /never fall below their hip height/i)
})

test('preserves the safety and foot-use rules for beginner leg entanglements', () => {
  const learning = gamesById.get('leglock-beginner-learning-entanglements')
  const destabilising = gamesById.get('leglock-beginner-destabilising-entangle')

  assert.match(learning.constraints.join(' '), /separate feet first then pull straight back/i)
  assert.match(destabilising.players[0].objective, /tops and bottoms of (the )?feet only/i)
  assert.match(destabilising.constraints.join(' '), /separate feet first then pull straight back/i)
})

test('assigns the PJ takedown-to-back-control continuation to the top player', () => {
  const game = gamesById.get('pj-takedown-to-back-control')

  assert.match(game.players[0].objective, /hooks in, (a )?body triangle, or (a )?guard pass/i)
  assert.match(game.players[1].winCondition, /get to feet or on top/i)
})

test('preserves the initiator and ordering rules in the guard games', () => {
  const destabilizations = gamesById.get('supine-competing-destabilizations')
  const kGuard = gamesById.get('kguard-inside-position')
  const dlr = gamesById.get('dlr-vs-standing')

  assert.match(destabilizations.players[0].objective, /initiated by the bottom player/i)
  assert.match(kGuard.players[0].objective, /in any order/i)
  assert.match(dlr.players[0].objective, /in any order/i)
})

test('preserves the Rob Cole and scaling game details', () => {
  const getUp = gamesById.get('rob-cole-get-up')
  const heelHide = gamesById.get('rob-cole-saddle-heel-hide')
  const finishing = gamesById.get('scaling-finishing')

  assert.match(getUp.players[0].constraints.join(' '), /other player gets up freely/i)
  assert.match(heelHide.players[0].objective, /secondary[- ]leg grip/i)
  assert.match(heelHide.players[1].objective, /spin.*extract/i)
  assert.match(finishing.players[0].objective, /any body part.*legs.*under the elbows/i)
})
