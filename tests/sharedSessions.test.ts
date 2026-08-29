import assert from 'node:assert/strict'
import test from 'node:test'
import type { SessionPlan } from '../src/types.ts'
import { isSessionPlan, parseLegacySessions } from '../src/sharedSessions.ts'

const validSession: SessionPlan = {
  id: 'session-user',
  title: 'Saved class',
  date: '2026-08-23T10:00:00.000Z',
  duration: 18,
  level: 'beginner',
  focus: '',
  notes: '',
  games: [{ gameId: 'guard-game', duration: 6, notes: 'Start connected.' }],
}

test('accepts a complete SessionPlan and rejects malformed session-like values', () => {
  assert.equal(isSessionPlan(validSession), true)
  assert.equal(isSessionPlan({ ...validSession, title: '' }), false)
  assert.equal(isSessionPlan({ ...validSession, games: [{ gameId: 'guard-game', duration: -1 }] }), false)
  assert.equal(isSessionPlan({ ...validSession, notes: null }), false)
  assert.equal(isSessionPlan('seed-fundamentals'), false)
})

test('imports only valid non-seed local sessions once', () => {
  const parsed = parseLegacySessions(JSON.stringify([
    validSession,
    { ...validSession, title: 'Duplicate id' },
    { ...validSession, id: 'seed-fundamentals' },
    'seed-all-levels',
    { id: 'incomplete' },
  ]), new Set(['seed-fundamentals', 'seed-all-levels']))

  assert.deepEqual(parsed.sessions.map(session => session.id), [validSession.id])
  assert.equal(parsed.ignoredCount, 4)
})

test('treats absent or malformed browser data as having no import candidates', () => {
  assert.deepEqual(parseLegacySessions(null, new Set()), { sessions: [], ignoredCount: 0 })
  assert.deepEqual(parseLegacySessions('{broken', new Set()), { sessions: [], ignoredCount: 0 })
})
