import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyGameDraftPatches,
  createBlankGameDraft,
  createGameDraftFromGame,
  type GameDraft,
  type GameDraftPatch,
} from '../src/sharedGameDrafts.ts'
import {
  createWorker,
  type CategoryStore,
  type CustomGameStore,
  type GameDraftStore,
} from '../src/server/worker.ts'
import type { CategoryMeta, Game } from '../src/types.ts'

const customGame: Game = {
  id: 'custom-turtle',
  title: 'Turtle Circle',
  category: 'guard-passing',
  source: 'Seminar',
  level: 'all-levels',
  type: 'mixed',
  startingPosition: 'Start seated.',
  players: [
    { role: 'Player 1', objective: 'Stay compact.', winCondition: '', constraints: [] },
    { role: 'Player 2', objective: 'Create movement.', winCondition: '', constraints: [] },
  ],
  constraints: [],
  designRationale: 'Keep the center.',
  tags: ['turtle'],
  skills: ['connection'],
  progression: null,
  sourceUrl: null,
}

const existingCategory: CategoryMeta = {
  label: 'Passing',
  emoji: '🦄',
  color: '#3b82f6',
  description: 'Guard passing games',
}

function request(path: string, init?: RequestInit) {
  return new Request(`https://okojitsu.test${path}`, init)
}

function jsonRequest(path: string, method: string, body: unknown) {
  return request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

class MemoryDraftStore implements GameDraftStore {
  readonly drafts = new Map<string, GameDraft>()
  replaceCalls = 0
  conflictCount = 0
  concurrentUpdate: ((draft: GameDraft) => GameDraft) | null = null

  async list() {
    return [...this.drafts.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(draft => ({
        id: draft.id,
        sourceGameId: draft.sourceGameId,
        title: draft.game.title,
        updatedAt: draft.updatedAt,
      }))
  }

  async get(id: string) {
    const draft = this.drafts.get(id)
    return draft ? clone(draft) : null
  }

  async findBySourceGameId(sourceGameId: string) {
    const draft = [...this.drafts.values()].find(candidate => candidate.sourceGameId === sourceGameId)
    return draft ? clone(draft) : null
  }

  async create(draft: GameDraft) {
    if (this.drafts.has(draft.id) || (draft.sourceGameId !== null && await this.findBySourceGameId(draft.sourceGameId))) return null
    this.drafts.set(draft.id, clone(draft))
    return clone(draft)
  }

  async replaceIfRevision(draft: GameDraft, expectedRevision: number) {
    this.replaceCalls += 1
    const current = this.drafts.get(draft.id)
    if (!current || current.revision !== expectedRevision) return null
    if (this.conflictCount > 0) {
      this.conflictCount -= 1
      const updated = this.concurrentUpdate ? this.concurrentUpdate(clone(current)) : clone(current)
      this.drafts.set(draft.id, updated)
      return null
    }
    const saved = { ...clone(draft), revision: expectedRevision + 1, updatedAt: new Date().toISOString() }
    this.drafts.set(draft.id, saved)
    return clone(saved)
  }

  async delete(id: string) {
    return this.drafts.delete(id)
  }

  async deleteIfRevision(id: string, expectedRevision: number) {
    const current = this.drafts.get(id)
    if (!current || current.revision !== expectedRevision) return false
    this.drafts.delete(id)
    return true
  }
}

class MemoryGameStore implements CustomGameStore {
  readonly games = new Map<string, Game>()
  createCalls = 0
  replaceCalls = 0
  publishWithCategoryCalls = 0
  failCreate = false
  failReplace = false
  failAfterCategoryPublication = false
  batchError: Error | null = null
  beforeCreate: (() => Promise<void>) | null = null
  beforePublication: (() => Promise<void>) | null = null

  constructor(
    private readonly draftStore: MemoryDraftStore,
    private readonly categoryStore: { categories: Record<string, CategoryMeta>; concurrentCategory: CategoryMeta | null },
  ) {}

  async list() {
    return [...this.games.values()].map(clone)
  }

  async create(game: Game) {
    this.createCalls += 1
    if (this.beforeCreate) await this.beforeCreate()
    if (this.failCreate || this.games.has(game.id)) return null
    this.games.set(game.id, clone(game))
    return clone(game)
  }

  async replace(id: string, game: Game) {
    this.replaceCalls += 1
    if (this.failReplace || !this.games.has(id)) return null
    this.games.set(id, clone(game))
    return clone(game)
  }

  async publishWithCategory(
    game: Game,
    pendingCategory: { key: string; category: CategoryMeta },
    mode: 'create' | 'replace',
    draftId?: string,
    claimedRevision?: number,
  ) {
    this.publishWithCategoryCalls += 1
    return this.publishClaimedGame(game, pendingCategory, mode, draftId, claimedRevision)
  }

  async publishWithoutCategory(
    game: Game,
    mode: 'create' | 'replace',
    draftId: string,
    claimedRevision: number,
  ) {
    return this.publishClaimedGame(game, null, mode, draftId, claimedRevision)
  }

  private async publishClaimedGame(
    game: Game,
    pendingCategory: { key: string; category: CategoryMeta } | null,
    mode: 'create' | 'replace',
    draftId?: string,
    claimedRevision?: number,
  ) {
    if (this.beforePublication) await this.beforePublication()
    if (this.batchError) throw this.batchError
    const previousGames = new Map([...this.games.entries()].map(([id, value]) => [id, clone(value)] as const))
    const previousCategories = clone(this.categoryStore.categories)
    const previousDrafts = new Map([...this.draftStore.drafts.entries()].map(([id, value]) => [id, clone(value)] as const))

    try {
      if (draftId !== undefined && claimedRevision !== undefined) {
        const claimedDraft = this.draftStore.drafts.get(draftId)
        if (!claimedDraft || !claimedDraft.isPublishing || claimedDraft.revision !== claimedRevision) {
          return { kind: 'draft-conflict' as const }
        }
      }

      if (pendingCategory) {
        if (this.categoryStore.concurrentCategory) {
          this.categoryStore.categories[pendingCategory.key] = clone(this.categoryStore.concurrentCategory)
          this.categoryStore.concurrentCategory = null
          return { kind: 'category-conflict' as const }
        }
        if (Object.hasOwn(this.categoryStore.categories, pendingCategory.key)) return { kind: 'category-conflict' as const }
      }

      if (mode === 'create') {
        this.createCalls += 1
        if (this.failCreate || this.games.has(game.id)) return { kind: 'game-conflict' as const }
      } else {
        this.replaceCalls += 1
        if (this.failReplace || !this.games.has(game.id)) return { kind: 'game-conflict' as const }
      }

      if (pendingCategory) this.categoryStore.categories[pendingCategory.key] = clone(pendingCategory.category)
      if (this.failAfterCategoryPublication) {
        this.failAfterCategoryPublication = false
        throw new Error('simulated game persistence failure')
      }
      this.games.set(game.id, clone(game))
      if (draftId !== undefined && claimedRevision !== undefined) this.draftStore.drafts.delete(draftId)
      return { kind: 'saved' as const, game: clone(game) }
    } catch {
      this.games.clear()
      for (const [id, value] of previousGames) this.games.set(id, value)
      for (const key of Object.keys(this.categoryStore.categories)) delete this.categoryStore.categories[key]
      Object.assign(this.categoryStore.categories, previousCategories)
      this.draftStore.drafts.clear()
      for (const [id, value] of previousDrafts) this.draftStore.drafts.set(id, value)
      return { kind: 'game-conflict' as const }
    }
  }

  async delete(id: string) {
    return this.games.delete(id)
  }

  async importMissing(games: Game[]) {
    let imported = 0
    for (const game of games) {
      if (this.games.has(game.id)) continue
      this.games.set(game.id, clone(game))
      imported += 1
    }
    return imported
  }
}

class MemoryCategoryStore implements CategoryStore {
  readonly categories: Record<string, CategoryMeta> = {}
  upsertCalls = 0
  createIfAbsentCalls = 0
  concurrentCategory: CategoryMeta | null = null

  async list() {
    return clone(this.categories)
  }

  async upsert(key: string, category: CategoryMeta) {
    this.upsertCalls += 1
    if (this.concurrentCategory) {
      this.categories[key] = clone(this.concurrentCategory)
      this.concurrentCategory = null
    }
    this.categories[key] = clone(category)
    return clone(category)
  }

  async createIfAbsent(key: string, category: CategoryMeta) {
    this.createIfAbsentCalls += 1
    if (this.concurrentCategory) {
      this.categories[key] = clone(this.concurrentCategory)
      this.concurrentCategory = null
      return null
    }
    if (Object.hasOwn(this.categories, key)) return null
    this.categories[key] = clone(category)
    return clone(category)
  }
}

function makeWorker(admin = true) {
  const draftStore = new MemoryDraftStore()
  const categoryStore = new MemoryCategoryStore()
  const gameStore = new MemoryGameStore(draftStore, categoryStore)
  const worker = createWorker({
    store: {
      ensureSeedSessions: async () => {},
      list: async () => [],
      create: async () => null,
      replace: async () => null,
      delete: async () => false,
      importMissing: async () => 0,
    },
    draftStore,
    gameStore,
    categoryStore,
    seedSessions: [],
    isAdmin: async () => admin,
    fetchAsset: async () => new Response('asset'),
  })
  return { worker, draftStore, gameStore, categoryStore }
}

async function responseBody<T>(response: Response) {
  return await response.json() as T
}

async function createDraft(worker: ReturnType<typeof createWorker>, draft: GameDraft) {
  const response = await worker.fetch(jsonRequest('/api/game-drafts', 'POST', draft))
  assert.equal(response.status, 201)
  return responseBody<{ draft: GameDraft }>(response).then(body => body.draft)
}

async function listDrafts(worker: ReturnType<typeof createWorker>) {
  const response = await worker.fetch(request('/api/game-drafts'))
  assert.equal(response.status, 200)
  return responseBody<{ drafts: unknown[] }>(response).then(body => body.drafts)
}

test('does not expose any live-draft route to visitors without an admin session', async () => {
  const { worker } = makeWorker(false)
  const routes: Array<[string, RequestInit?]> = [
    ['/api/game-drafts'],
    ['/api/game-drafts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(createBlankGameDraft('draft-1')) }],
    ['/api/game-drafts/draft-1'],
    ['/api/game-drafts/draft-1', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ patches: [] }) }],
    ['/api/game-drafts/draft-1/publish', { method: 'POST' }],
    ['/api/game-drafts/draft-1', { method: 'DELETE' }],
  ]

  for (const [path, init] of routes) {
    const response = await worker.fetch(request(path, init))
    assert.equal(response.status, 401, path)
  }
})

test('creates new drafts and joins the existing draft for a source game', async () => {
  const { worker } = makeWorker()
  const first = await createDraft(worker, createGameDraftFromGame('draft-1', customGame, 'replace'))
  const joinedResponse = await worker.fetch(jsonRequest(
    '/api/game-drafts',
    'POST',
    createGameDraftFromGame('draft-2', { ...customGame, title: 'A newer title' }, 'replace'),
  ))

  assert.equal(joinedResponse.status, 200)
  assert.equal((await responseBody<{ draft: GameDraft }>(joinedResponse)).draft.id, first.id)
  assert.deepEqual(await listDrafts(worker), [{
    id: first.id,
    sourceGameId: customGame.id,
    title: customGame.title,
    updatedAt: first.updatedAt,
  }])
})

test('validates patch payloads and returns missing drafts as not found', async () => {
  const { worker } = makeWorker()
  const invalidCreate = await worker.fetch(jsonRequest('/api/game-drafts', 'POST', { draft: 'not-a-draft' }))
  assert.equal(invalidCreate.status, 400)
  const claimedCreate = await worker.fetch(jsonRequest('/api/game-drafts', 'POST', {
    ...createBlankGameDraft('claimed-draft'),
    isPublishing: true,
  }))
  assert.equal(claimedCreate.status, 400)

  const missingGet = await worker.fetch(request('/api/game-drafts/missing'))
  assert.equal(missingGet.status, 404)
  const missingPatch = await worker.fetch(jsonRequest('/api/game-drafts/missing', 'PATCH', { patches: [] }))
  assert.equal(missingPatch.status, 404)
  const missingPublish = await worker.fetch(request('/api/game-drafts/missing/publish', { method: 'POST' }))
  assert.equal(missingPublish.status, 404)
  const missingDelete = await worker.fetch(request('/api/game-drafts/missing', { method: 'DELETE' }))
  assert.equal(missingDelete.status, 404)

  const draft = await createDraft(worker, createBlankGameDraft('draft-1'))
  const invalidPatch = await worker.fetch(jsonRequest(`/api/game-drafts/${draft.id}`, 'PATCH', { patches: [{ path: 'game.id', value: 'unsafe' }] }))
  assert.equal(invalidPatch.status, 400)
  assert.deepEqual((await worker.fetch(request(`/api/game-drafts/${draft.id}`))).status, 200)
})

test('merges separate admin patches after a revision retry', async () => {
  const { worker, draftStore } = makeWorker()
  const draft = await createDraft(worker, createBlankGameDraft('draft-1'))
  draftStore.conflictCount = 1
  draftStore.concurrentUpdate = current => ({
    ...current,
    revision: current.revision + 1,
    game: { ...current.game, title: 'Turtle Circle' },
  })

  const response = await worker.fetch(jsonRequest(`/api/game-drafts/${draft.id}`, 'PATCH', {
    patches: [{ path: 'source', value: 'Seminar' }],
  }))

  assert.equal(response.status, 200)
  const updated = (await responseBody<{ draft: GameDraft }>(response)).draft
  assert.equal(updated.game.title, 'Turtle Circle')
  assert.equal(updated.game.source, 'Seminar')
  assert.equal(updated.revision, 2)
  assert.equal(draftStore.replaceCalls, 2)
})

test('returns a conflict after three failed revision retries without overwriting the draft', async () => {
  const { worker, draftStore } = makeWorker()
  const draft = await createDraft(worker, createBlankGameDraft('draft-1'))
  draftStore.conflictCount = 3
  draftStore.concurrentUpdate = current => ({ ...current, revision: current.revision + 1 })

  const response = await worker.fetch(jsonRequest(`/api/game-drafts/${draft.id}`, 'PATCH', {
    patches: [{ path: 'source', value: 'Seminar' }],
  }))

  assert.equal(response.status, 409)
  assert.equal(draftStore.replaceCalls, 3)
  assert.equal((await draftStore.get(draft.id))?.game.source, '')
})

test('publishes a complete draft with a pending category, forces beginner level, then removes the draft', async () => {
  const { worker, draftStore, gameStore, categoryStore } = makeWorker()
  const sourceDraft = createGameDraftFromGame('draft-1', customGame, 'create')
  const draft = await createDraft(worker, applyGameDraftPatches(sourceDraft, [
    { path: 'pendingCategory.label', value: 'Turtle Games' },
    { path: 'pendingCategory.emoji', value: '🐢' },
  ]))

  const response = await worker.fetch(request(`/api/game-drafts/${draft.id}/publish`, { method: 'POST' }))

  assert.equal(response.status, 201)
  const published = (await responseBody<{ game: Game }>(response)).game
  assert.equal(published.category, 'turtle-games')
  assert.equal(published.level, 'beginner')
  assert.deepEqual(categoryStore.categories['turtle-games'], {
    label: 'Turtle Games',
    emoji: '🐢',
    color: '#00ff88',
    description: 'Turtle Games games',
  })
  assert.equal(gameStore.games.get(customGame.id)?.level, 'beginner')
  assert.equal(gameStore.createCalls, 1)
  assert.equal(await draftStore.get(draft.id), null)
  assert.deepEqual(await listDrafts(worker), [])
})

test('rolls back a pending category after game creation fails so the same draft can retry', async () => {
  const { worker, draftStore, gameStore, categoryStore } = makeWorker()
  gameStore.failAfterCategoryPublication = true
  const draft = await createDraft(worker, applyGameDraftPatches(
    createGameDraftFromGame('draft-create-retry', customGame, 'create'),
    [
      { path: 'pendingCategory.label', value: 'Turtle Games' },
      { path: 'pendingCategory.emoji', value: '🐢' },
    ],
  ))

  const failed = await worker.fetch(request(`/api/game-drafts/${draft.id}/publish`, { method: 'POST' }))

  assert.equal(failed.status, 409)
  assert.equal(Object.hasOwn(categoryStore.categories, 'turtle-games'), false)
  assert.equal((await draftStore.get(draft.id))?.isPublishing, false)

  const retry = await worker.fetch(request(`/api/game-drafts/${draft.id}/publish`, { method: 'POST' }))

  assert.equal(retry.status, 201)
  assert.equal(categoryStore.categories['turtle-games']?.label, 'Turtle Games')
  assert.equal(await draftStore.get(draft.id), null)
})

test('rolls back a pending category after game replacement fails so the same draft can retry', async () => {
  const { worker, draftStore, gameStore, categoryStore } = makeWorker()
  gameStore.games.set(customGame.id, clone(customGame))
  gameStore.failAfterCategoryPublication = true
  const draft = await createDraft(worker, applyGameDraftPatches(
    createGameDraftFromGame('draft-replace-retry', customGame, 'replace'),
    [
      { path: 'pendingCategory.label', value: 'Turtle Games' },
      { path: 'pendingCategory.emoji', value: '🐢' },
    ],
  ))

  const failed = await worker.fetch(request(`/api/game-drafts/${draft.id}/publish`, { method: 'POST' }))

  assert.equal(failed.status, 409)
  assert.equal(Object.hasOwn(categoryStore.categories, 'turtle-games'), false)
  assert.equal((await draftStore.get(draft.id))?.isPublishing, false)

  const retry = await worker.fetch(request(`/api/game-drafts/${draft.id}/publish`, { method: 'POST' }))

  assert.equal(retry.status, 201)
  assert.equal(categoryStore.categories['turtle-games']?.label, 'Turtle Games')
  assert.equal(await draftStore.get(draft.id), null)
})

test('recovers an interrupted stale publish claim before retrying publication', async () => {
  const { worker, draftStore, gameStore } = makeWorker()
  const draft = await createDraft(worker, createGameDraftFromGame('draft-stale-claim', customGame, 'create'))
  draftStore.drafts.set(draft.id, {
    ...draft,
    isPublishing: true,
    revision: 7,
    updatedAt: '2000-01-01T00:00:00.000Z',
  })

  const response = await worker.fetch(request(`/api/game-drafts/${draft.id}/publish`, { method: 'POST' }))

  assert.equal(response.status, 201)
  assert.equal(gameStore.games.get(customGame.id)?.title, customGame.title)
  assert.equal(await draftStore.get(draft.id), null)
})

test('recovers a stale publish claim before allowing PATCH and DELETE', async () => {
  const patchWorker = makeWorker()
  const patchDraftResult = await createDraft(patchWorker.worker, createBlankGameDraft('draft-stale-patch'))
  patchWorker.draftStore.drafts.set(patchDraftResult.id, {
    ...patchDraftResult,
    isPublishing: true,
    revision: 4,
    updatedAt: '2000-01-01T00:00:00.000Z',
  })

  const patch = await patchWorker.worker.fetch(jsonRequest(`/api/game-drafts/${patchDraftResult.id}`, 'PATCH', {
    patches: [{ path: 'title', value: 'Recovered title' }],
  }))

  assert.equal(patch.status, 200)
  assert.equal((await patchWorker.draftStore.get(patchDraftResult.id))?.game.title, 'Recovered title')

  const deleteWorker = makeWorker()
  const deleteDraftResult = await createDraft(deleteWorker.worker, createBlankGameDraft('draft-stale-delete'))
  deleteWorker.draftStore.drafts.set(deleteDraftResult.id, {
    ...deleteDraftResult,
    isPublishing: true,
    revision: 4,
    updatedAt: '2000-01-01T00:00:00.000Z',
  })

  const deletion = await deleteWorker.worker.fetch(request(`/api/game-drafts/${deleteDraftResult.id}`, { method: 'DELETE' }))

  assert.equal(deletion.status, 204)
  assert.equal(await deleteWorker.draftStore.get(deleteDraftResult.id), null)
})

test('fences an expired holder before it can save after stale recovery patches the draft', async () => {
  const { worker, draftStore, gameStore, categoryStore } = makeWorker()
  const draft = await createDraft(worker, applyGameDraftPatches(
    createGameDraftFromGame('draft-fenced-patch', customGame, 'create'),
    [
      { path: 'pendingCategory.label', value: 'Old Turtle' },
      { path: 'pendingCategory.emoji', value: '🐢' },
    ],
  ))
  let notifyPublicationStarted: () => void
  const publicationStarted = new Promise<void>(resolve => { notifyPublicationStarted = resolve })
  let allowPublication: () => void
  const publicationAllowed = new Promise<void>(resolve => { allowPublication = resolve })
  gameStore.beforePublication = async () => {
    notifyPublicationStarted()
    await publicationAllowed
  }

  const originalPublishing = worker.fetch(request(`/api/game-drafts/${draft.id}/publish`, { method: 'POST' }))
  await publicationStarted
  const claimed = await draftStore.get(draft.id)
  assert.ok(claimed)
  draftStore.drafts.set(draft.id, { ...claimed, updatedAt: '2000-01-01T00:00:00.000Z' })

  const patch = await worker.fetch(jsonRequest(`/api/game-drafts/${draft.id}`, 'PATCH', {
    patches: [{ path: 'title', value: 'Recovered title' }],
  }))
  allowPublication()
  const original = await originalPublishing

  assert.equal(patch.status, 200)
  assert.equal(original.status, 409)
  assert.equal(gameStore.games.has(customGame.id), false)
  assert.equal(Object.hasOwn(categoryStore.categories, 'old-turtle'), false)
  assert.equal((await draftStore.get(draft.id))?.game.title, 'Recovered title')
})

test('fences an expired holder before it can save after stale recovery deletes the draft', async () => {
  const { worker, draftStore, gameStore, categoryStore } = makeWorker()
  const draft = await createDraft(worker, applyGameDraftPatches(
    createGameDraftFromGame('draft-fenced-delete', customGame, 'create'),
    [
      { path: 'pendingCategory.label', value: 'Old Turtle' },
      { path: 'pendingCategory.emoji', value: '🐢' },
    ],
  ))
  let notifyPublicationStarted: () => void
  const publicationStarted = new Promise<void>(resolve => { notifyPublicationStarted = resolve })
  let allowPublication: () => void
  const publicationAllowed = new Promise<void>(resolve => { allowPublication = resolve })
  gameStore.beforePublication = async () => {
    notifyPublicationStarted()
    await publicationAllowed
  }

  const originalPublishing = worker.fetch(request(`/api/game-drafts/${draft.id}/publish`, { method: 'POST' }))
  await publicationStarted
  const claimed = await draftStore.get(draft.id)
  assert.ok(claimed)
  draftStore.drafts.set(draft.id, { ...claimed, updatedAt: '2000-01-01T00:00:00.000Z' })

  const deletion = await worker.fetch(request(`/api/game-drafts/${draft.id}`, { method: 'DELETE' }))
  allowPublication()
  const original = await originalPublishing

  assert.equal(deletion.status, 204)
  assert.equal(original.status, 409)
  assert.equal(gameStore.games.has(customGame.id), false)
  assert.equal(Object.hasOwn(categoryStore.categories, 'old-turtle'), false)
})

test('fences an expired holder after a recovered publisher saves a newer replacement snapshot', async () => {
  const { worker, draftStore, gameStore, categoryStore } = makeWorker()
  gameStore.games.set(customGame.id, { ...customGame, title: 'Existing title' })
  const draft = await createDraft(worker, applyGameDraftPatches(
    createGameDraftFromGame('draft-fenced-republish', customGame, 'replace'),
    [
      { path: 'pendingCategory.label', value: 'Old Turtle' },
      { path: 'pendingCategory.emoji', value: '🐢' },
    ],
  ))
  let publicationAttempts = 0
  let notifyFirstPublication: () => void
  const firstPublicationStarted = new Promise<void>(resolve => { notifyFirstPublication = resolve })
  let allowFirstPublication: () => void
  const firstPublicationAllowed = new Promise<void>(resolve => { allowFirstPublication = resolve })
  gameStore.beforePublication = async () => {
    publicationAttempts += 1
    if (publicationAttempts === 1) {
      notifyFirstPublication()
      await firstPublicationAllowed
    }
  }

  const originalPublishing = worker.fetch(request(`/api/game-drafts/${draft.id}/publish`, { method: 'POST' }))
  await firstPublicationStarted
  const claimed = await draftStore.get(draft.id)
  assert.ok(claimed)
  draftStore.drafts.set(draft.id, { ...claimed, updatedAt: '2000-01-01T00:00:00.000Z' })

  const patch = await worker.fetch(jsonRequest(`/api/game-drafts/${draft.id}`, 'PATCH', {
    patches: [
      { path: 'title', value: 'Recovered title' },
      { path: 'pendingCategory.label', value: 'New Turtle' },
    ],
  }))
  const recoveredPublishing = await worker.fetch(request(`/api/game-drafts/${draft.id}/publish`, { method: 'POST' }))
  allowFirstPublication()
  const original = await originalPublishing

  assert.equal(patch.status, 200)
  assert.equal(recoveredPublishing.status, 201)
  assert.equal(original.status, 409)
  assert.equal(gameStore.games.get(customGame.id)?.title, 'Recovered title')
  assert.equal(Object.hasOwn(categoryStore.categories, 'new-turtle'), true)
  assert.equal(Object.hasOwn(categoryStore.categories, 'old-turtle'), false)
})

test('does not acknowledge PATCH or DELETE while a publish claim is saving its snapshot', async () => {
  const { worker, draftStore, gameStore } = makeWorker()
  const draft = await createDraft(worker, createGameDraftFromGame('draft-claim-window', customGame, 'create'))
  let notifyCreateStarted: () => void
  const createStarted = new Promise<void>(resolve => { notifyCreateStarted = resolve })
  let allowCreate: () => void
  const createAllowed = new Promise<void>(resolve => { allowCreate = resolve })
  const waitForPublication = async () => {
    notifyCreateStarted()
    await createAllowed
  }
  gameStore.beforeCreate = waitForPublication
  gameStore.beforePublication = waitForPublication

  const publishing = worker.fetch(request(`/api/game-drafts/${draft.id}/publish`, { method: 'POST' }))
  await createStarted

  const claimedState = (await draftStore.get(draft.id))?.isPublishing
  const patch = await worker.fetch(jsonRequest(`/api/game-drafts/${draft.id}`, 'PATCH', {
    patches: [{ path: 'title', value: 'Late title' }],
  }))
  const deletion = await worker.fetch(request(`/api/game-drafts/${draft.id}`, { method: 'DELETE' }))

  allowCreate()
  const published = await publishing
  assert.equal(claimedState, true)
  assert.equal(patch.status, 409)
  assert.equal(deletion.status, 409)
  assert.equal(published.status, 201)
  assert.equal((await responseBody<{ game: Game }>(published)).game.title, customGame.title)
})

test('surfaces an unknown publication batch failure as 500 rather than a conflict', async () => {
  const { worker, draftStore, gameStore, categoryStore } = makeWorker()
  const draft = await createDraft(worker, applyGameDraftPatches(
    createGameDraftFromGame('draft-unknown-batch-error', customGame, 'create'),
    [
      { path: 'pendingCategory.label', value: 'Turtle' },
      { path: 'pendingCategory.emoji', value: '🐢' },
    ],
  ))
  gameStore.batchError = new Error('D1 service unavailable')

  const response = await worker.fetch(request(`/api/game-drafts/${draft.id}/publish`, { method: 'POST' }))

  assert.equal(response.status, 500)
  assert.equal(gameStore.games.has(customGame.id), false)
  assert.equal(Object.hasOwn(categoryStore.categories, 'turtle'), false)
  assert.equal((await draftStore.get(draft.id))?.isPublishing, false)
})

test('rejects an incomplete draft publication and keeps it available for editing', async () => {
  const { worker, draftStore, gameStore } = makeWorker()
  const draft = await createDraft(worker, createBlankGameDraft('draft-1'))

  const response = await worker.fetch(request(`/api/game-drafts/${draft.id}/publish`, { method: 'POST' }))

  assert.equal(response.status, 400)
  assert.equal(gameStore.createCalls, 0)
  assert.ok(await draftStore.get(draft.id))
  assert.equal((await draftStore.get(draft.id))?.isPublishing, false)
})

test('rejects a pending-category collision before saving or deleting the draft', async () => {
  const { worker, draftStore, gameStore, categoryStore } = makeWorker()
  categoryStore.categories.turtle = existingCategory
  const draft = await createDraft(worker, applyGameDraftPatches(
    createGameDraftFromGame('draft-1', customGame, 'create'),
    [
      { path: 'pendingCategory.label', value: 'Turtle' },
      { path: 'pendingCategory.emoji', value: '🐢' },
    ],
  ))

  const response = await worker.fetch(request(`/api/game-drafts/${draft.id}/publish`, { method: 'POST' }))

  assert.equal(response.status, 409)
  assert.equal(gameStore.createCalls, 0)
  assert.equal(categoryStore.upsertCalls, 0)
  assert.ok(await draftStore.get(draft.id))
})

test('does not overwrite a concurrent custom category winner during publication', async () => {
  const { worker, draftStore, gameStore, categoryStore } = makeWorker()
  const winner: CategoryMeta = {
    label: 'Turtle winner',
    emoji: '🐢',
    color: '#ff00aa',
    description: 'The concurrent category',
  }
  categoryStore.concurrentCategory = winner
  const draft = await createDraft(worker, applyGameDraftPatches(
    createGameDraftFromGame('draft-category-race', customGame, 'create'),
    [
      { path: 'pendingCategory.label', value: 'Turtle' },
      { path: 'pendingCategory.emoji', value: '🐢' },
    ],
  ))

  const response = await worker.fetch(request(`/api/game-drafts/${draft.id}/publish`, { method: 'POST' }))

  assert.equal(response.status, 409)
  assert.deepEqual(categoryStore.categories.turtle, winner)
  assert.equal(gameStore.publishWithCategoryCalls, 1)
  assert.equal(categoryStore.upsertCalls, 0)
  assert.equal(gameStore.createCalls, 0)
  assert.equal((await draftStore.get(draft.id))?.isPublishing, false)
})

test('rejects a pending category that would shadow a built-in category key', async () => {
  const { worker, draftStore, gameStore, categoryStore } = makeWorker()
  const draft = await createDraft(worker, applyGameDraftPatches(
    createGameDraftFromGame('draft-1', customGame, 'create'),
    [
      { path: 'pendingCategory.label', value: 'Guard Passing' },
      { path: 'pendingCategory.emoji', value: '🛡️' },
    ],
  ))

  const response = await worker.fetch(request(`/api/game-drafts/${draft.id}/publish`, { method: 'POST' }))

  assert.equal(response.status, 409)
  assert.equal(gameStore.createCalls, 0)
  assert.equal(categoryStore.upsertCalls, 0)
  assert.ok(await draftStore.get(draft.id))
})

test('allows a custom category key inherited from the built-in metadata prototype', async () => {
  const { worker, categoryStore } = makeWorker()
  const draft = await createDraft(worker, applyGameDraftPatches(
    createGameDraftFromGame('draft-constructor-category', customGame, 'create'),
    [
      { path: 'pendingCategory.label', value: 'Constructor' },
      { path: 'pendingCategory.emoji', value: '🏗️' },
    ],
  ))

  const response = await worker.fetch(request(`/api/game-drafts/${draft.id}/publish`, { method: 'POST' }))

  assert.equal(response.status, 201)
  assert.deepEqual(categoryStore.categories.constructor, {
    label: 'Constructor',
    emoji: '🏗️',
    color: '#00ff88',
    description: 'Constructor games',
  })
})

test('returns a duplicate final-game conflict and leaves the draft intact', async () => {
  const { worker, draftStore, gameStore } = makeWorker()
  gameStore.games.set(customGame.id, clone(customGame))
  const draft = await createDraft(worker, createGameDraftFromGame('draft-1', customGame, 'create'))

  const response = await worker.fetch(request(`/api/game-drafts/${draft.id}/publish`, { method: 'POST' }))

  assert.equal(response.status, 409)
  assert.equal(gameStore.createCalls, 1)
  assert.ok(await draftStore.get(draft.id))
  assert.equal((await draftStore.get(draft.id))?.isPublishing, false)
})

test('does not delete a draft when replacing its published game fails', async () => {
  const { worker, draftStore, gameStore } = makeWorker()
  gameStore.failCreate = false
  const draft = await createDraft(worker, createGameDraftFromGame('draft-1', customGame, 'replace'))

  const response = await worker.fetch(request(`/api/game-drafts/${draft.id}/publish`, { method: 'POST' }))

  assert.equal(response.status, 409)
  assert.equal(gameStore.replaceCalls, 1)
  assert.ok(await draftStore.get(draft.id))
  assert.equal((await draftStore.get(draft.id))?.isPublishing, false)
})

test('discards an existing draft and reports a missing draft on repeat deletion', async () => {
  const { worker } = makeWorker()
  const draft = await createDraft(worker, createBlankGameDraft('draft-1'))

  const deleted = await worker.fetch(request(`/api/game-drafts/${draft.id}`, { method: 'DELETE' }))
  assert.equal(deleted.status, 204)
  assert.equal(await deleted.text(), '')

  const repeated = await worker.fetch(request(`/api/game-drafts/${draft.id}`, { method: 'DELETE' }))
  assert.equal(repeated.status, 404)
})
