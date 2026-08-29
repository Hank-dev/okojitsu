import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applySessionDraftPatches,
  createBlankSessionDraft,
  createSessionDraftFromSession,
  mergeRemoteSessionDraft,
} from '../src/sharedSessionDrafts.ts'

test('derives a draft session duration from its added games', () => {
  const draft = createBlankSessionDraft('draft-session')
  const updated = applySessionDraftPatches(draft, [{
    path: 'games', value: [{ gameId: 'guard-game', duration: 6 }, { gameId: 'mount-game', duration: 4 }],
  }])

  assert.equal(updated.session.duration, 10)
  assert.deepEqual(updated.session.games, [
    { gameId: 'guard-game', duration: 6 }, { gameId: 'mount-game', duration: 4 },
  ])
})

test('merges remote changes without replacing an active local text field', () => {
  const local = applySessionDraftPatches(createBlankSessionDraft('draft-session'), [{ path: 'title', value: 'Typing locally' }])
  const remote = {
    ...local,
    revision: 2,
    session: { ...local.session, title: 'Remote title', focus: 'Passing' },
  }

  const merged = mergeRemoteSessionDraft(local, remote, 'title')

  assert.equal(merged.session.title, 'Typing locally')
  assert.equal(merged.session.focus, 'Passing')
})

test('copies a published session into a distinct final session id', () => {
  const source = applySessionDraftPatches(createBlankSessionDraft('source-draft'), [{ path: 'games', value: [{ gameId: 'guard-game', duration: 6 }] }]).session
  const copy = createSessionDraftFromSession('copy-draft', source)

  assert.notEqual(copy.id, 'source-draft')
  assert.notEqual(copy.session.id, source.id)
  assert.deepEqual(copy.session.games, source.games)
})
