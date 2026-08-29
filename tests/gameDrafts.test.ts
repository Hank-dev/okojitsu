import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyGameDraftPatches,
  createBlankGameDraft,
  createGameDraftFromGame,
  isGameDraft,
  isGameDraftPatch,
  mergeRemoteDraft,
  type GameDraftPatch,
} from '../src/sharedGameDrafts.ts'
import {
  LIVE_DRAFT_TIMING,
  endLiveGameDraftField,
  flushLiveGameDraftPatches,
  getLiveGameDraftTerminalTransition,
  getLiveGameDraftTerminalState,
  getQueuedGameDraftPatches,
  mergeLiveGameDraft,
  reconcileLiveGameDraftPublishIntent,
  startLiveGameDraftClose,
  startLiveGameDraftLifecycle,
  startLiveGameDraftPublish,
} from '../src/useLiveGameDraft.ts'

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}

test('uses a 400ms debounce delay and a 1000ms refresh interval', () => {
  assert.deepEqual(LIVE_DRAFT_TIMING, { saveDelayMs: 400, pollIntervalMs: 1000 })
})

test('reactivates mounted state after StrictMode effect replay and blocks writes after unmount', () => {
  const mounted = { current: false }
  let pollingStarts = 0
  let timerClears = 0
  let pollingStops = 0
  let writes = 0
  const writeIfMounted = () => {
    if (mounted.current) writes += 1
  }

  const firstCleanup = startLiveGameDraftLifecycle(
    mounted,
    () => { pollingStarts += 1 },
    () => { timerClears += 1 },
    () => { pollingStops += 1 },
  )
  assert.equal(mounted.current, true)
  firstCleanup()
  assert.equal(mounted.current, false)

  const replayCleanup = startLiveGameDraftLifecycle(
    mounted,
    () => { pollingStarts += 1 },
    () => { timerClears += 1 },
    () => { pollingStops += 1 },
  )
  assert.equal(mounted.current, true)
  writeIfMounted()
  replayCleanup()
  writeIfMounted()

  assert.equal(writes, 1)
  assert.equal(mounted.current, false)
  assert.equal(pollingStarts, 2)
  assert.equal(timerClears, 2)
  assert.equal(pollingStops, 2)
})

test('waits for spawned A2 and free B saves before publishing', async () => {
  const a1 = deferred<boolean>()
  const a2 = deferred<boolean>()
  const b = deferred<boolean>()
  const patchA2 = { path: 'title' as const, value: 'A2' }
  const patchB = { path: 'source' as const, value: 'B' }
  const pending = new Map([['title', patchA2], ['source', patchB]] as const)
  const inFlight = new Map<'title' | 'source', Promise<boolean>>()
  const events: string[] = ['save:A1']

  const a1Operation = a1.promise.then(result => {
    inFlight.delete('title')
    events.push('save:A2')
    const a2Operation = a2.promise.then(a2Result => {
      if (a2Result && pending.get('title') === patchA2) pending.delete('title')
      return a2Result
    }).finally(() => {
      if (inFlight.get('title') === a2Operation) inFlight.delete('title')
    })
    inFlight.set('title', a2Operation)
    return result
  })
  inFlight.set('title', a1Operation)

  const save = async (patches: GameDraftPatch[]) => {
    const free = patches.filter(patch => !inFlight.has(patch.path))
    assert.deepEqual(free, [patchB])
    events.push('save:B')
    const bOperation = b.promise.then(result => {
      if (result && pending.get('source') === patchB) pending.delete('source')
      return result
    }).finally(() => {
      if (inFlight.get('source') === bOperation) inFlight.delete('source')
    })
    inFlight.set('source', bOperation)
    return bOperation
  }

  const publishSlot: { current: Promise<string | null> | null } = { current: null }
  const publishResult = startLiveGameDraftPublish(publishSlot, async () => {
    const flushed = await flushLiveGameDraftPatches({
      isActive: () => true,
      pendingPatches: () => [...pending.values()],
      inFlightPromises: () => inFlight.values(),
      hasFailedPatches: () => false,
      save,
    })
    if (!flushed) return null
    events.push('publish')
    return 'published-game'
  })
  let publishSettled = false
  void publishResult.finally(() => { publishSettled = true })

  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(events, ['save:A1', 'save:B'])

  a1.resolve(true)
  await Promise.resolve()
  assert.deepEqual(events, ['save:A1', 'save:B', 'save:A2'])

  b.resolve(true)
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(publishSettled, false)
  assert.equal(events.includes('publish'), false)

  a2.resolve(true)
  assert.equal(await publishResult, 'published-game')
  assert.deepEqual(events, ['save:A1', 'save:B', 'save:A2', 'publish'])
})

test('queues newer same-path patches after an older save settles in request order', () => {
  const savedTitle = { path: 'title' as const, value: 'First title' }
  const savedSource = { path: 'source' as const, value: 'First source' }
  const newerTitle = { path: 'title' as const, value: 'Second title' }
  const newerSource = { path: 'source' as const, value: 'Second source' }
  const pending = new Map([
    [newerTitle.path, newerTitle],
    [newerSource.path, newerSource],
  ])

  assert.deepEqual(getQueuedGameDraftPatches(pending, [savedTitle, savedSource]), [newerTitle, newerSource])
  assert.deepEqual(getQueuedGameDraftPatches(pending, [newerTitle]), [])
})

test('keeps a focused local field through remote merges until its matching blur', () => {
  const local = applyGameDraftPatches(createBlankGameDraft('draft-focus'), [{ path: 'title', value: 'Local title' }])
  const remote = applyGameDraftPatches(createBlankGameDraft('draft-focus'), [
    { path: 'title', value: 'Remote title' },
    { path: 'source', value: 'Seminar' },
  ])

  const stillFocused = mergeLiveGameDraft(local, remote, 'title', [])
  const afterDifferentFieldBlur = endLiveGameDraftField('title', 'source')
  const afterMatchingBlur = endLiveGameDraftField(afterDifferentFieldBlur, 'title')

  assert.equal(stillFocused.game.title, 'Local title')
  assert.equal(stillFocused.game.source, 'Seminar')
  assert.equal(afterDifferentFieldBlur, 'title')
  assert.equal(afterMatchingBlur, null)
  assert.equal(mergeLiveGameDraft(local, remote, afterMatchingBlur, []).game.title, 'Remote title')
})

test('classifies a missing draft as published after local publish intent', () => {
  const draft = createBlankGameDraft('draft-publish-intent')

  assert.equal(getLiveGameDraftTerminalState(draft, false), 'discarded')
  assert.equal(getLiveGameDraftTerminalState(draft, true), 'published')
  assert.equal(getLiveGameDraftTerminalState({ ...draft, isPublishing: true }, false), 'published')
})

test('keeps local publish intent when a nonpublishing poll precedes a 404 publish failure', async () => {
  const draft = createBlankGameDraft('draft-publish-race')
  let publishIntent = false
  let publishInFlight = false
  let rejectPublish: (reason: Error) => void = () => undefined
  const publish = new Promise<never>((_resolve, reject) => { rejectPublish = reject })

  publishIntent = true
  publishInFlight = true
  const polledDraft = await Promise.resolve({ ...draft, isPublishing: false })
  publishIntent = reconcileLiveGameDraftPublishIntent(publishIntent, publishInFlight, polledDraft)
  rejectPublish(Object.assign(new Error('Draft not found.'), { status: 404 }))

  await assert.rejects(publish, error => error instanceof Error && error.message === 'Draft not found.')
  publishInFlight = false

  assert.equal(getLiveGameDraftTerminalState(draft, publishIntent), 'published')
  assert.equal(reconcileLiveGameDraftPublishIntent(publishIntent, publishInFlight, polledDraft), false)
})

test('coalesces duplicate publish calls before a second async publish operation starts', async () => {
  const publishSlot: { current: Promise<string> | null } = { current: null }
  let publishCalls = 0
  let resolvePublish: (gameId: string) => void = () => undefined
  const published = new Promise<string>(resolve => { resolvePublish = resolve })
  const startPublish = async () => {
    publishCalls += 1
    return published
  }

  const first = startLiveGameDraftPublish(publishSlot, startPublish)
  const duplicate = startLiveGameDraftPublish(publishSlot, startPublish)

  assert.strictEqual(duplicate, first)
  await Promise.resolve()
  assert.equal(publishCalls, 1)

  resolvePublish('published-game')
  assert.equal(await duplicate, 'published-game')
  assert.equal(publishSlot.current, null)
})

test('drains an immediate edit before close cancels its 400ms debounce', async () => {
  const immediatePatch = { path: 'title' as const, value: 'Persisted before close' }
  const pending = new Map([[immediatePatch.path, immediatePatch]])
  const closeSlot: { current: Promise<boolean> | null } = { current: null }
  const savedTitles: string[] = []
  let clearedDebounce = false

  const flush = async () => {
    clearedDebounce = true
    return flushLiveGameDraftPatches({
      isActive: () => true,
      pendingPatches: () => [...pending.values()],
      inFlightPromises: () => [],
      hasFailedPatches: () => false,
      save: async patches => {
        savedTitles.push(...patches.map(patch => String(patch.value)))
        for (const patch of patches) pending.delete(patch.path)
        return true
      },
    })
  }

  const firstClose = startLiveGameDraftClose(closeSlot, flush)
  const duplicateClose = startLiveGameDraftClose(closeSlot, flush)

  assert.strictEqual(duplicateClose, firstClose)
  assert.equal(await firstClose, true)
  assert.equal(clearedDebounce, true)
  assert.deepEqual(savedTitles, ['Persisted before close'])
  assert.equal(closeSlot.current, null)
})

test('preserves the first terminal state and only transitions out of active once', () => {
  const published = getLiveGameDraftTerminalTransition('active', 'published')
  const laterDiscard = getLiveGameDraftTerminalTransition(published.remoteState, 'discarded')

  assert.deepEqual(published, { remoteState: 'published', didTransition: true })
  assert.deepEqual(laterDiscard, { remoteState: 'published', didTransition: false })
})

test('applies changes to different draft fields without dropping either change', () => {
  const draft = createBlankGameDraft('draft-new')
  const afterTitle = applyGameDraftPatches(draft, [{ path: 'title', value: 'Turtle Circle' }])
  const afterObjective = applyGameDraftPatches(afterTitle, [{ path: 'players.1.objective', value: 'Open the turtle' }])

  assert.equal(afterObjective.game.title, 'Turtle Circle')
  assert.equal(afterObjective.game.players[1].objective, 'Open the turtle')
})

test('keeps an active local field while applying a remote draft update', () => {
  const local = applyGameDraftPatches(createBlankGameDraft('draft-new'), [{ path: 'title', value: 'Local typing' }])
  const remote = applyGameDraftPatches(createBlankGameDraft('draft-new'), [{ path: 'source', value: 'Seminar' }])

  const merged = mergeRemoteDraft(local, remote, 'title')
  assert.equal(merged.game.title, 'Local typing')
  assert.equal(merged.game.source, 'Seminar')
})

test('does not let a stale save response overwrite a newer accepted poll revision', () => {
  const initial = createBlankGameDraft('draft-revisions')
  const localTitlePatch = { path: 'title' as const, value: 'Local title' }
  const local = applyGameDraftPatches(initial, [localTitlePatch])
  const newerPoll = {
    ...initial,
    revision: 2,
    game: { ...initial.game, source: 'Collaborator update' },
  }
  const staleSave = {
    ...initial,
    revision: 1,
    game: { ...initial.game, title: 'Local title' },
  }

  const acceptedPoll = mergeLiveGameDraft(local, newerPoll, null, [localTitlePatch])
  const afterStaleSave = mergeLiveGameDraft(acceptedPoll, staleSave, null, [])

  assert.equal(acceptedPoll.revision, 2)
  assert.equal(afterStaleSave.revision, 2)
  assert.equal(afterStaleSave.game.title, 'Local title')
  assert.equal(afterStaleSave.game.source, 'Collaborator update')
})

test('rejects an unapproved draft patch path', () => {
  assert.equal(isGameDraftPatch({ path: 'game.id', value: 'other-id' }), false)
})

test('persists a free subcategory through draft patches and remote merges', () => {
  const blank = createBlankGameDraft('draft-subcategory')
  const local = applyGameDraftPatches(blank, [{ path: 'subcategory', value: 'Butterfly guard' }])
  const remote = applyGameDraftPatches(blank, [{ path: 'subcategory', value: 'Knee shield' }])

  assert.equal(isGameDraftPatch({ path: 'subcategory', value: 'Butterfly guard' }), true)
  assert.equal(local.game.subcategory, 'Butterfly guard')
  assert.equal(mergeRemoteDraft(local, remote, 'subcategory').game.subcategory, 'Butterfly guard')
})

test('defaults and validates persisted publishing state across draft copies', () => {
  const blank = createBlankGameDraft('draft-publishing')
  const fromGame = createGameDraftFromGame('draft-from-game', blank.game, 'create', null)
  const claimed = { ...blank, isPublishing: true }
  const copied = applyGameDraftPatches(claimed, [{ path: 'title', value: 'Claimed title' }])
  const { isPublishing: _, ...missingPublishingState } = blank

  assert.equal(blank.isPublishing, false)
  assert.equal(fromGame.isPublishing, false)
  assert.equal(isGameDraft(claimed), true)
  assert.equal(copied.isPublishing, true)
  assert.equal(isGameDraft({ ...blank, isPublishing: 'true' }), false)
  assert.equal(isGameDraft(missingPublishingState), false)
})

test('rejects unapproved keys at every draft boundary', () => {
  const draft = createBlankGameDraft('draft-keys')
  const progression = { chain: 'chain', chainLabel: 'Chain', step: 1, totalSteps: 1, prevId: null, nextId: null }
  const cases: Array<[string, unknown]> = [
    ['draft', { ...draft, unexpected: true }],
    ['game', { ...draft, game: { ...draft.game, unexpected: true } }],
    ['player', { ...draft, game: { ...draft.game, players: [{ ...draft.game.players[0], unexpected: true }, draft.game.players[1]] } }],
    ['progression', { ...draft, game: { ...draft.game, progression: { ...progression, unexpected: true } } }],
    ['pending category', { ...draft, pendingCategory: { label: '', emoji: '', unexpected: true } }],
  ]

  for (const [boundary, candidate] of cases) assert.equal(isGameDraft(candidate), false, boundary)
})

test('normalizes source game keys when creating a draft', () => {
  const source = createBlankGameDraft('source-game').game
  const progression = { chain: 'chain', chainLabel: 'Chain', step: 1, totalSteps: 1, prevId: null, nextId: null }
  const polluted = {
    ...source,
    unexpected: true,
    players: [{ ...source.players[0], unexpected: true }, source.players[1]],
    progression: { ...progression, unexpected: true },
  }

  const draft = createGameDraftFromGame('draft-normalized', polluted, 'create')
  assert.equal(isGameDraft(draft), true)
  assert.equal(Object.hasOwn(draft.game, 'unexpected'), false)
  assert.equal(Object.hasOwn(draft.game.players[0], 'unexpected'), false)
  assert.equal(Object.hasOwn(draft.game.progression!, 'unexpected'), false)
})

test('rejects factory inputs that would produce invalid draft IDs or levels', () => {
  const source = createBlankGameDraft('source-game').game

  assert.throws(() => createBlankGameDraft(''))
  assert.throws(() => createGameDraftFromGame('', source, 'create'))
  assert.throws(() => createGameDraftFromGame('draft-invalid-level', { ...source, level: 'intermediate' }, 'create'))
})

test('rejects unknown non-enumerable draft keys', () => {
  const candidate = createBlankGameDraft('draft-non-enumerable')
  Object.defineProperty(candidate, 'unexpected', { value: true })

  assert.equal(isGameDraft(candidate), false)
})

test('rejects unknown symbol-keyed game keys', () => {
  const candidate = createBlankGameDraft('draft-symbol')
  const unexpected = Symbol('unexpected')
  candidate.game[unexpected] = true

  assert.equal(isGameDraft(candidate), false)
})
