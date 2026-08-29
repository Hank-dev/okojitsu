import { SEED_SESSIONS } from '../data/sessions-seed'
import gamesData from '../data/games.json'
import { categoryKey, isGameDraft, applyGameDraftPatches, isGameDraftPatch, type GameDraft, type GameDraftPatch } from '../sharedGameDrafts'
import { isCategoryKey, isCategoryMeta, isCategoryMetaMap, isGame } from '../sharedGames'
import { isSessionPlan } from '../sharedSessions'
import { applySessionDraftPatches, isSessionDraft, isSessionDraftPatch, type SessionDraft, type SessionDraftPatch } from '../sharedSessionDrafts'
import { CATEGORY_META, type CategoryMeta, type Game, type SessionPlan } from '../types'
import { D1CustomCategoryStore, D1CustomGameStore, D1DeletedSeedGameStore, type CategoryStore, type CustomGameStore, type DeletedSeedGameStore } from './customGameStore'
import { D1GameDraftStore, type GameDraftStore } from './gameDraftStore'
import { D1SessionStore, type D1Database, type SessionStore } from './sessionStore'
import { D1SessionDraftStore, type SessionDraftStore } from './sessionDraftStore'

export type { SessionStore } from './sessionStore'
export type { CategoryStore, CustomGameStore } from './customGameStore'
export type { DeletedSeedGameStore } from './customGameStore'
export type { GameDraftStore } from './gameDraftStore'
export type { SessionDraftStore } from './sessionDraftStore'

type AssetFetcher = {
  fetch(request: Request): Promise<Response>
}

type WorkerDependencies = {
  store: SessionStore
  gameStore?: CustomGameStore
  categoryStore?: CategoryStore
  deletedSeedGameStore?: DeletedSeedGameStore
  draftStore?: GameDraftStore
  sessionDraftStore?: SessionDraftStore
  seedSessions: SessionPlan[]
  isAdmin(request: Request): Promise<boolean>
  fetchAsset(request: Request): Promise<Response>
}

type SiteEnvironment = {
  DB: D1Database
  ASSETS: AssetFetcher
  ADMIN_PASSWORD?: string
  ADMIN_SESSION_SECRET?: string
}

const cookieName = 'okojitsu_admin'
const maxAge = 60 * 60 * 24 * 30
const seedGameIds = new Set((gamesData as Game[]).map(game => game.id))

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  })
}

function error(message: string, status: number) {
  return json({ error: message }, status)
}

function sessionIdFromPath(pathname: string) {
  const match = /^\/api\/sessions\/([^/]+)$/.exec(pathname)
  if (!match) return null

  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

function gameIdFromPath(pathname: string) {
  const match = /^\/api\/games\/([^/]+)$/.exec(pathname)
  if (!match) return null

  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

function gameDraftIdFromPath(pathname: string) {
  const match = /^\/api\/game-drafts\/([^/]+)$/.exec(pathname)
  if (!match) return null

  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

function publishGameDraftIdFromPath(pathname: string) {
  const match = /^\/api\/game-drafts\/([^/]+)\/publish$/.exec(pathname)
  if (!match) return null

  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

function isGameDraftRoute(pathname: string) {
  return pathname === '/api/game-drafts' || pathname.startsWith('/api/game-drafts/')
}

function sessionDraftIdFromPath(pathname: string) {
  const match = /^\/api\/session-drafts\/([^/]+)$/.exec(pathname)
  if (!match) return null
  try { return decodeURIComponent(match[1]) } catch { return null }
}

function publishSessionDraftIdFromPath(pathname: string) {
  const match = /^\/api\/session-drafts\/([^/]+)\/publish$/.exec(pathname)
  if (!match) return null
  try { return decodeURIComponent(match[1]) } catch { return null }
}

function isSessionDraftRoute(pathname: string) {
  return pathname === '/api/session-drafts' || pathname.startsWith('/api/session-drafts/')
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function uniqueValidImport(value: unknown, seedIds: ReadonlySet<string>) {
  if (!Array.isArray(value)) return null

  const ids = new Set<string>()
  const sessions: SessionPlan[] = []
  for (const candidate of value) {
    if (!isSessionPlan(candidate) || seedIds.has(candidate.id) || ids.has(candidate.id)) return null
    ids.add(candidate.id)
    sessions.push(candidate)
  }
  return sessions
}

function uniqueValidGameImport(value: unknown) {
  if (!Array.isArray(value)) return null

  const ids = new Set<string>()
  const games = value.map(candidate => {
    if (!isGame(candidate) || ids.has(candidate.id)) return null
    ids.add(candidate.id)
    return { ...candidate, level: 'beginner' }
  })
  return games.every(Boolean) ? games as NonNullable<typeof games[number]>[] : null
}

class DraftConflictError extends Error {}
class DraftPublishingError extends Error {}

export const PUBLISH_CLAIM_STALE_AFTER_MS = 5 * 60 * 1000

function isStalePublishingClaim(draft: { updatedAt: string }) {
  const updatedAt = Date.parse(draft.updatedAt)
  return Number.isFinite(updatedAt) && Date.now() - updatedAt >= PUBLISH_CLAIM_STALE_AFTER_MS
}

async function editableDraft(store: GameDraftStore, id: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await store.get(id)
    if (!current) return null
    if (!current.isPublishing) return current
    if (!isStalePublishingClaim(current)) throw new DraftPublishingError()

    const released = await store.replaceIfRevision({ ...current, isPublishing: false }, current.revision)
    if (released) continue
  }
  throw new DraftConflictError()
}

async function patchDraft(store: GameDraftStore, id: string, patches: GameDraftPatch[]) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await editableDraft(store, id)
    if (!current) return null
    const next = applyGameDraftPatches(current, patches)
    const saved = await store.replaceIfRevision(next, current.revision)
    if (saved) return saved
  }
  throw new DraftConflictError()
}

async function deleteDraft(store: GameDraftStore, id: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await editableDraft(store, id)
    if (!current) return false
    if (await store.deleteIfRevision(id, current.revision)) return true
  }
  throw new DraftConflictError()
}

async function patchSessionDraft(store: SessionDraftStore, id: string, patches: SessionDraftPatch[]) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await editableSessionDraft(store, id)
    if (!current) return null
    const saved = await store.replaceIfRevision(applySessionDraftPatches(current, patches), current.revision)
    if (saved) return saved
  }
  throw new DraftConflictError()
}

async function editableSessionDraft(store: SessionDraftStore, id: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await store.get(id)
    if (!current) return null
    if (!current.isPublishing) return current
    if (!isStalePublishingClaim(current)) throw new DraftPublishingError()
    if (await store.replaceIfRevision({ ...current, isPublishing: false }, current.revision)) continue
  }
  throw new DraftConflictError()
}

async function deleteSessionDraft(store: SessionDraftStore, id: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await editableSessionDraft(store, id)
    if (!current) return false
    if (await store.deleteIfRevision(id, current.revision)) return true
  }
  throw new DraftConflictError()
}

async function claimSessionDraft(store: SessionDraftStore, id: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await store.get(id)
    if (!current) return { kind: 'missing' as const }
    if (current.isPublishing) {
      if (!isStalePublishingClaim(current)) return { kind: 'publishing' as const }
      await store.replaceIfRevision({ ...current, isPublishing: false }, current.revision)
      continue
    }
    const claimed = await store.replaceIfRevision({ ...current, isPublishing: true }, current.revision)
    if (claimed) return { kind: 'claimed' as const, draft: claimed }
  }
  return { kind: 'conflict' as const }
}

async function releaseSessionPublishingClaim(store: SessionDraftStore, draft: SessionDraft) {
  return store.replaceIfRevision({ ...draft, isPublishing: false }, draft.revision)
}

async function publishSessionDraft(draftStore: SessionDraftStore, sessionStore: SessionStore, id: string) {
  const claim = await claimSessionDraft(draftStore, id)
  if (claim.kind !== 'claimed') return claim
  const draft = claim.draft
  const release = async <Kind extends 'invalid' | 'conflict'>(kind: Kind) => {
    await releaseSessionPublishingClaim(draftStore, draft)
    return { kind } as const
  }
  try {
    if (!draft.session.games.length || !isSessionPlan(draft.session)) return release('invalid')
    const session = await sessionStore.create(draft.session)
    if (!session) return release('conflict')
    if (!await draftStore.deleteIfRevision(draft.id, draft.revision)) return { kind: 'conflict' as const }
    return { kind: 'saved' as const, session }
  } catch (publishError) {
    await releaseSessionPublishingClaim(draftStore, draft)
    throw publishError
  }
}

async function claimDraft(store: GameDraftStore, id: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await store.get(id)
    if (!current) return { kind: 'missing' as const }
    if (current.isPublishing) {
      if (!isStalePublishingClaim(current)) return { kind: 'publishing' as const }
      await store.replaceIfRevision({ ...current, isPublishing: false }, current.revision)
      continue
    }

    const claimed = await store.replaceIfRevision({ ...current, isPublishing: true }, current.revision)
    if (claimed) return { kind: 'claimed' as const, draft: claimed }
  }
  return { kind: 'conflict' as const }
}

async function releasePublishingClaim(store: GameDraftStore, draft: GameDraft) {
  return store.replaceIfRevision({ ...draft, isPublishing: false }, draft.revision)
}

function pendingCategoryMeta(pendingCategory: NonNullable<GameDraft['pendingCategory']>): { key: string; category: CategoryMeta } | null {
  const label = pendingCategory.label.trim()
  const emoji = pendingCategory.emoji.trim()
  const key = categoryKey(label)
  if (!label || !emoji || !isCategoryKey(key)) return null

  return {
    key,
    category: { label, emoji, color: '#00ff88', description: `${label} games` },
  }
}

async function publishDraft(
  draftStore: GameDraftStore,
  gameStore: CustomGameStore,
  id: string,
) {
  const claim = await claimDraft(draftStore, id)
  if (claim.kind !== 'claimed') return claim
  const draft = claim.draft

  const release = async <Kind extends 'invalid' | 'collision' | 'conflict'>(kind: Kind) => {
    await releasePublishingClaim(draftStore, draft)
    return { kind } as const
  }
  try {
    let category: { key: string; category: CategoryMeta } | null = null
    if (draft.pendingCategory) {
      category = pendingCategoryMeta(draft.pendingCategory)
      if (!category) return release('invalid')

      if (Object.hasOwn(CATEGORY_META, category.key)) return release('collision')
    }

    const game: Game = {
      ...draft.game,
      ...(category ? { category: category.key } : {}),
      level: 'beginner',
    }
    if (!isGame(game)) return release('invalid')

    if (category) {
      const publication = await gameStore.publishWithCategory(game, category, draft.publishMode, draft.id, draft.revision)
      if (publication.kind === 'category-conflict') return release('collision')
      if (publication.kind === 'game-conflict') return release('conflict')
      if (publication.kind === 'draft-conflict') return { kind: 'conflict' as const }
      return { kind: 'saved' as const, game: publication.game }
    } else {
      const publication = await gameStore.publishWithoutCategory(game, draft.publishMode, draft.id, draft.revision)
      if (publication.kind === 'category-conflict') return release('collision')
      if (publication.kind === 'game-conflict') return release('conflict')
      if (publication.kind === 'draft-conflict') return { kind: 'conflict' as const }
      return { kind: 'saved' as const, game: publication.game }
    }
  } catch (publishError) {
    await releasePublishingClaim(draftStore, draft)
    throw publishError
  }
}

export function createWorker(dependencies: WorkerDependencies) {
  const seedIds = new Set(dependencies.seedSessions.map((session) => session.id))

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url)

      if (isGameDraftRoute(url.pathname)) {
        try {
          if (!await dependencies.isAdmin(request)) return error('Admin sign-in required.', 401)
          if (!dependencies.draftStore) return error('Live game draft storage is unavailable.', 503)

          if (url.pathname === '/api/game-drafts' && request.method === 'GET') {
            return json({ drafts: await dependencies.draftStore.list() })
          }

          if (url.pathname === '/api/game-drafts' && request.method === 'POST') {
            const body = await readJson(request)
            if (!isGameDraft(body) || body.isPublishing) return error('A valid game draft is required.', 400)

            if (body.sourceGameId !== null) {
              const existing = await dependencies.draftStore.findBySourceGameId(body.sourceGameId)
              if (existing) return json({ draft: existing })
            }

            const created = await dependencies.draftStore.create(body)
            if (created) return json({ draft: created }, 201)

            if (body.sourceGameId !== null) {
              const existing = await dependencies.draftStore.findBySourceGameId(body.sourceGameId)
              if (existing) return json({ draft: existing })
            }
            return error('A draft with that id already exists.', 409)
          }

          const publishId = publishGameDraftIdFromPath(url.pathname)
          if (publishId && request.method === 'POST') {
            if (!dependencies.gameStore || !dependencies.categoryStore) return error('Shared game storage is unavailable.', 503)
            try {
              const published = await publishDraft(dependencies.draftStore, dependencies.gameStore, publishId)
              if (published.kind === 'missing') return error('Draft not found.', 404)
              if (published.kind === 'invalid') return error('A complete game is required.', 400)
              if (published.kind === 'collision') return error('That category already exists.', 409)
              if (published.kind === 'conflict') return error('The final game could not be saved.', 409)
              if (published.kind === 'publishing') return error('The draft is already being published.', 409)
              return json({ game: published.game }, 201)
            } catch (publishError) {
              if (publishError instanceof DraftConflictError || publishError instanceof DraftPublishingError) return error('Unable to publish the game draft.', 409)
              throw publishError
            }
          }

          const draftId = gameDraftIdFromPath(url.pathname)
          if (draftId && request.method === 'GET') {
            const draft = await dependencies.draftStore.get(draftId)
            return draft ? json({ draft }) : error('Draft not found.', 404)
          }

          if (draftId && request.method === 'PATCH') {
            const body = await readJson(request)
            const patches = typeof body === 'object' && body !== null ? (body as { patches?: unknown }).patches : undefined
            if (!Array.isArray(patches) || !patches.every(isGameDraftPatch)) return error('Draft patches must be valid.', 400)

            try {
              const updated = await patchDraft(dependencies.draftStore, draftId, patches)
              return updated ? json({ draft: updated }) : error('Draft not found.', 404)
            } catch (patchError) {
              if (patchError instanceof DraftPublishingError) return error('The draft is being published.', 409)
              if (patchError instanceof DraftConflictError) return error('The draft changed too often. Try again.', 409)
              throw patchError
            }
          }

          if (draftId && request.method === 'DELETE') {
            try {
              return await deleteDraft(dependencies.draftStore, draftId)
                ? new Response(null, { status: 204 })
                : error('Draft not found.', 404)
            } catch (deleteError) {
              if (deleteError instanceof DraftPublishingError) return error('The draft is being published.', 409)
              if (deleteError instanceof DraftConflictError) return error('The draft changed too often. Try again.', 409)
              throw deleteError
            }
          }

          return error('Method not allowed.', 405)
        } catch {
          return error('Unable to access live game drafts.', 500)
        }
      }

      if (isSessionDraftRoute(url.pathname)) {
        try {
          if (!await dependencies.isAdmin(request)) return error('Admin sign-in required.', 401)
          if (!dependencies.sessionDraftStore) return error('Live session draft storage is unavailable.', 503)

          if (url.pathname === '/api/session-drafts' && request.method === 'GET') {
            return json({ drafts: await dependencies.sessionDraftStore.list() })
          }
          if (url.pathname === '/api/session-drafts' && request.method === 'POST') {
            const draft = await readJson(request)
            if (!isSessionDraft(draft) || draft.isPublishing) return error('A valid session draft is required.', 400)
            const created = await dependencies.sessionDraftStore.create(draft)
            return created ? json({ draft: created }, 201) : error('A draft with that id already exists.', 409)
          }
          const publishId = publishSessionDraftIdFromPath(url.pathname)
          if (publishId && request.method === 'POST') {
            const published = await publishSessionDraft(dependencies.sessionDraftStore, dependencies.store, publishId)
            if (published.kind === 'missing') return error('Draft not found.', 404)
            if (published.kind === 'invalid') return error('A complete session needs at least one game.', 400)
            if (published.kind === 'publishing') return error('The draft is already being published.', 409)
            if (published.kind === 'conflict') return error('The final session could not be saved.', 409)
            return json({ session: published.session }, 201)
          }
          const draftId = sessionDraftIdFromPath(url.pathname)
          if (draftId && request.method === 'GET') {
            const draft = await dependencies.sessionDraftStore.get(draftId)
            return draft ? json({ draft }) : error('Draft not found.', 404)
          }
          if (draftId && request.method === 'PATCH') {
            const body = await readJson(request)
            const patches = typeof body === 'object' && body !== null ? (body as { patches?: unknown }).patches : undefined
            if (!Array.isArray(patches) || !patches.every(isSessionDraftPatch)) return error('Draft patches must be valid.', 400)
            try {
              const draft = await patchSessionDraft(dependencies.sessionDraftStore, draftId, patches)
              return draft ? json({ draft }) : error('Draft not found.', 404)
            } catch (patchError) {
              return error(patchError instanceof DraftConflictError ? 'The draft changed too often. Try again.' : 'The draft is being published.', 409)
            }
          }
          if (draftId && request.method === 'DELETE') {
            try {
              return await deleteSessionDraft(dependencies.sessionDraftStore, draftId) ? new Response(null, { status: 204 }) : error('Draft not found.', 404)
            } catch (deleteError) {
              return error(deleteError instanceof DraftConflictError ? 'The draft changed too often. Try again.' : 'The draft is being published.', 409)
            }
          }
          return error('Method not allowed.', 405)
        } catch {
          return error('Unable to access live session drafts.', 500)
        }
      }

      if (url.pathname.startsWith('/api/sessions')) {
        try {
          await dependencies.store.ensureSeedSessions(dependencies.seedSessions)

          if (url.pathname === '/api/sessions' && request.method === 'GET') {
            return json({ sessions: await dependencies.store.list() })
          }

          if (url.pathname === '/api/sessions/import' && request.method === 'POST') {
            if (!await dependencies.isAdmin(request)) return error('Admin sign-in required.', 401)
            const body = await readJson(request)
            const sessions = uniqueValidImport(
              typeof body === 'object' && body !== null ? (body as { sessions?: unknown }).sessions : undefined,
              seedIds,
            )
            if (!sessions) return error('Sessions must be a valid, unique list.', 400)
            return json({ imported: await dependencies.store.importMissing(sessions) })
          }

          if (url.pathname === '/api/sessions' && request.method === 'POST') {
            if (!await dependencies.isAdmin(request)) return error('Admin sign-in required.', 401)
            const session = await readJson(request)
            if (!isSessionPlan(session)) return error('A complete session is required.', 400)
            const created = await dependencies.store.create(session)
            return created ? json({ session: created }, 201) : error('A session with that id already exists.', 409)
          }

          const sessionId = sessionIdFromPath(url.pathname)
          if (sessionId && request.method === 'PUT') {
            if (!await dependencies.isAdmin(request)) return error('Admin sign-in required.', 401)
            const session = await readJson(request)
            if (!isSessionPlan(session) || session.id !== sessionId) return error('The session id must match the URL.', 400)
            const replaced = await dependencies.store.replace(sessionId, session)
            return replaced ? json({ session: replaced }) : error('Session not found.', 404)
          }

          if (sessionId && request.method === 'DELETE') {
            if (!await dependencies.isAdmin(request)) return error('Admin sign-in required.', 401)
            return await dependencies.store.delete(sessionId) ? new Response(null, { status: 204 }) : error('Session not found.', 404)
          }

          return error('Method not allowed.', 405)
        } catch {
          return error('Unable to access shared sessions.', 500)
        }
      }

      if (url.pathname.startsWith('/api/games') || url.pathname === '/api/categories') {
        try {
          if (!dependencies.gameStore || !dependencies.categoryStore) return error('Shared game storage is unavailable.', 503)

          if (url.pathname === '/api/games' && request.method === 'GET') {
            return json({
              games: await dependencies.gameStore.list(),
              categories: await dependencies.categoryStore.list(),
              deletedSeedGameIds: dependencies.deletedSeedGameStore ? await dependencies.deletedSeedGameStore.list() : [],
            })
          }

          if (url.pathname === '/api/games/import' && request.method === 'POST') {
            if (!await dependencies.isAdmin(request)) return error('Admin sign-in required.', 401)
            const body = await readJson(request)
            const games = uniqueValidGameImport(typeof body === 'object' && body !== null ? (body as { games?: unknown }).games : undefined)
            const categories = typeof body === 'object' && body !== null ? (body as { categories?: unknown }).categories ?? {} : {}
            if (!games || !isCategoryMetaMap(categories)) return error('Games and categories must be valid lists.', 400)
            for (const [key, category] of Object.entries(categories)) await dependencies.categoryStore.upsert(key, category)
            return json({ imported: await dependencies.gameStore.importMissing(games) })
          }

          if (url.pathname === '/api/games' && request.method === 'POST') {
            if (!await dependencies.isAdmin(request)) return error('Admin sign-in required.', 401)
            const game = await readJson(request)
            if (!isGame(game)) return error('A complete game is required.', 400)
            const created = await dependencies.gameStore.create({ ...game, level: 'beginner' })
            return created ? json({ game: created }, 201) : error('A game with that id already exists.', 409)
          }

          if (url.pathname === '/api/categories' && request.method === 'POST') {
            if (!await dependencies.isAdmin(request)) return error('Admin sign-in required.', 401)
            const body = await readJson(request)
            const key = typeof body === 'object' && body !== null ? (body as { key?: unknown }).key : undefined
            const category = typeof body === 'object' && body !== null ? (body as { category?: unknown }).category : undefined
            if (!isCategoryKey(key) || !isCategoryMeta(category)) return error('A valid category is required.', 400)
            return json({ category: await dependencies.categoryStore.upsert(key, category) }, 201)
          }

          const gameId = gameIdFromPath(url.pathname)
          if (gameId && request.method === 'PUT') {
            if (!await dependencies.isAdmin(request)) return error('Admin sign-in required.', 401)
            const game = await readJson(request)
            if (!isGame(game) || game.id !== gameId) return error('The game id must match the URL.', 400)
            const replaced = await dependencies.gameStore.replace(gameId, { ...game, level: 'beginner' })
            return replaced ? json({ game: replaced }) : error('Game not found.', 404)
          }

          if (gameId && request.method === 'DELETE') {
            if (!await dependencies.isAdmin(request)) return error('Admin sign-in required.', 401)
            if (await dependencies.gameStore.delete(gameId)) return new Response(null, { status: 204 })
            if (!seedGameIds.has(gameId)) return error('Game not found.', 404)
            if (!dependencies.deletedSeedGameStore) return error('Standard-game deletion is unavailable.', 503)
            await dependencies.deletedSeedGameStore.add(gameId)
            return new Response(null, { status: 204 })
          }

          return error('Method not allowed.', 405)
        } catch {
          return error('Unable to access shared games.', 500)
        }
      }

      return dependencies.fetchAsset(request)
    },
  }
}

function cookies(request: Request) {
  const parsed: Record<string, string> = {}
  for (const cookie of (request.headers.get('cookie') || '').split(';')) {
    const [name, ...value] = cookie.trim().split('=')
    if (!name || value.length === 0) continue
    try {
      parsed[name] = decodeURIComponent(value.join('='))
    } catch {
      // Ignore malformed cookie values.
    }
  }
  return parsed
}

function base64(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return base64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)))
}

async function validAdminSession(request: Request, environment: SiteEnvironment) {
  const token = cookies(request)[cookieName]
  if (!token || !environment.ADMIN_SESSION_SECRET) return false
  const [expires, signature] = token.split('.')
  if (!expires || !signature || Number(expires) < Date.now()) return false
  return signature === await sign(expires, environment.ADMIN_SESSION_SECRET)
}

function siteAssetRequest(request: Request) {
  const url = new URL(request.url)
  return new Request(new URL('/client' + (url.pathname === '/' ? '/index.html' : url.pathname), url), request)
}

export default {
  async fetch(request: Request, environment: SiteEnvironment): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/admin/session') return json({ isAdmin: await validAdminSession(request, environment) })
    if (url.pathname === '/api/admin/sign-out' && request.method === 'POST') {
      return json({ ok: true }, 200, { 'set-cookie': `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` })
    }
    if (url.pathname === '/api/admin/sign-in' && request.method === 'POST') {
      const body = await readJson(request)
      const password = typeof body === 'object' && body !== null ? (body as { password?: unknown }).password : undefined
      if (typeof password !== 'string' || !environment.ADMIN_PASSWORD || !environment.ADMIN_SESSION_SECRET || password !== environment.ADMIN_PASSWORD) {
        return json({ ok: false }, 401)
      }
      const expires = String(Date.now() + maxAge * 1000)
      const token = encodeURIComponent(`${expires}.${await sign(expires, environment.ADMIN_SESSION_SECRET)}`)
      return json({ ok: true }, 200, { 'set-cookie': `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}` })
    }

    const worker = createWorker({
      store: new D1SessionStore(environment.DB),
      gameStore: new D1CustomGameStore(environment.DB),
      categoryStore: new D1CustomCategoryStore(environment.DB),
      deletedSeedGameStore: new D1DeletedSeedGameStore(environment.DB),
      draftStore: new D1GameDraftStore(environment.DB),
      sessionDraftStore: new D1SessionDraftStore(environment.DB),
      seedSessions: SEED_SESSIONS,
      isAdmin: (sessionRequest) => validAdminSession(sessionRequest, environment),
      fetchAsset: async (assetRequest) => {
        let response = await environment.ASSETS.fetch(siteAssetRequest(assetRequest))
        if (response.status === 404) response = await environment.ASSETS.fetch(siteAssetRequest(new Request(new URL('/', assetRequest.url), assetRequest)))
        return response
      },
    })
    return worker.fetch(request)
  },
}
