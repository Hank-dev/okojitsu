import { useCallback, useEffect, useRef, useState } from 'react'
import type { Game } from './types'
import {
  deleteGameDraft,
  fetchGameDraft,
  patchGameDraft,
  publishGameDraft,
  // @ts-expect-error The direct Node strip-types tests require the explicit source suffix.
} from './gameDraftApi.ts'
import {
  applyGameDraftPatches,
  mergeRemoteDraft,
  type GameDraft,
  type GameDraftPatch,
  type GameDraftPatchPath,
  // @ts-expect-error The direct Node strip-types tests require the explicit source suffix.
} from './sharedGameDrafts.ts'

export const LIVE_DRAFT_TIMING = { saveDelayMs: 400, pollIntervalMs: 1000 } as const

export type LiveGameDraftStatus = 'saved' | 'saving' | 'error'
export type LiveGameDraftRemoteState = 'active' | 'published' | 'discarded'
export type LiveGameDraftTerminalState = Exclude<LiveGameDraftRemoteState, 'active'>

export interface UseLiveGameDraftResult {
  draft: GameDraft
  status: LiveGameDraftStatus
  error: Error | null
  remoteState: LiveGameDraftRemoteState
  terminalState: LiveGameDraftTerminalState | null
  beginField: (path: GameDraftPatchPath) => void
  endField: (path: GameDraftPatchPath) => void
  update: (patch: GameDraftPatch) => void
  close: () => Promise<boolean>
  retry: () => Promise<boolean>
  publish: () => Promise<Game | null>
  discard: () => Promise<boolean>
}

function errorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) return null
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? status : null
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Unable to update the live game draft.')
}

export function getQueuedGameDraftPatches(
  pendingPatches: ReadonlyMap<GameDraftPatchPath, GameDraftPatch>,
  releasedPatches: readonly GameDraftPatch[],
): GameDraftPatch[] {
  const queued: GameDraftPatch[] = []
  const queuedPaths = new Set<GameDraftPatchPath>()
  for (const releasedPatch of releasedPatches) {
    const pendingPatch = pendingPatches.get(releasedPatch.path)
    if (pendingPatch && pendingPatch !== releasedPatch && !queuedPaths.has(pendingPatch.path)) {
      queued.push(pendingPatch)
      queuedPaths.add(pendingPatch.path)
    }
  }
  return queued
}

export function endLiveGameDraftField(
  activePath: GameDraftPatchPath | null,
  path: GameDraftPatchPath,
): GameDraftPatchPath | null {
  return activePath === path ? null : activePath
}

export function getLiveGameDraftTerminalState(
  draft: Pick<GameDraft, 'isPublishing'>,
  publishIntent: boolean,
): LiveGameDraftTerminalState {
  return draft.isPublishing || publishIntent ? 'published' : 'discarded'
}

export function getLiveGameDraftTerminalTransition(
  current: LiveGameDraftRemoteState,
  next: LiveGameDraftTerminalState,
): { remoteState: LiveGameDraftRemoteState, didTransition: boolean } {
  if (current !== 'active') return { remoteState: current, didTransition: false }
  return { remoteState: next, didTransition: true }
}

export function startLiveGameDraftPublish<T>(
  slot: { current: Promise<T> | null },
  start: () => Promise<T>,
): Promise<T> {
  if (slot.current) return slot.current

  let resolveOperation: (value: T) => void = () => undefined
  let rejectOperation: (reason?: unknown) => void = () => undefined
  const operation = new Promise<T>((resolve, reject) => {
    resolveOperation = resolve
    rejectOperation = reject
  })
  slot.current = operation

  void Promise.resolve().then(start).then(
    value => {
      if (slot.current === operation) slot.current = null
      resolveOperation(value)
    },
    error => {
      if (slot.current === operation) slot.current = null
      rejectOperation(error)
    },
  )
  return operation
}

export function startLiveGameDraftClose(
  slot: { current: Promise<boolean> | null },
  flush: () => Promise<boolean>,
): Promise<boolean> {
  return startLiveGameDraftPublish(slot, flush)
}

export function startLiveGameDraftLifecycle(
  mounted: { current: boolean },
  startPolling: () => void,
  clearSaveTimers: () => void,
  stopPolling: () => void,
): () => void {
  mounted.current = true
  startPolling()

  return () => {
    mounted.current = false
    clearSaveTimers()
    stopPolling()
  }
}

export async function flushLiveGameDraftPatches(queue: {
  isActive: () => boolean
  pendingPatches: () => readonly GameDraftPatch[]
  inFlightPromises: () => Iterable<Promise<boolean>>
  hasFailedPatches: () => boolean
  save: (patches: GameDraftPatch[]) => Promise<boolean>
}): Promise<boolean> {
  const attemptedPatches = new Set<GameDraftPatch>()
  let success = true

  while (queue.isActive()) {
    const inFlight = [...new Set(queue.inFlightPromises())]
    const pending = queue.pendingPatches()
    const unattempted = pending.filter(patch => !attemptedPatches.has(patch))

    if (!inFlight.length && !unattempted.length) {
      return success && !pending.length && !queue.hasFailedPatches()
    }

    for (const patch of unattempted) attemptedPatches.add(patch)
    const settling = [...inFlight]
    if (unattempted.length) settling.push(queue.save(unattempted))
    success = (await Promise.all(settling)).every(Boolean) && success
  }

  return false
}

export function reconcileLiveGameDraftPublishIntent(
  publishIntent: boolean,
  publishInFlight: boolean,
  remote: Pick<GameDraft, 'isPublishing'>,
): boolean {
  return !remote.isPublishing && !publishInFlight ? false : publishIntent
}

export function mergeLiveGameDraft(
  local: GameDraft,
  remote: GameDraft,
  activePath: GameDraftPatchPath | null,
  pendingPatches: Iterable<GameDraftPatch>,
) {
  if (remote.revision < local.revision) return local

  let merged = mergeRemoteDraft(local, remote, activePath)
  for (const patch of pendingPatches) {
    if (patch.path !== activePath) merged = applyGameDraftPatches(merged, [patch])
  }
  return merged
}

export function useLiveGameDraft(initial: GameDraft, onPublished: (game: Game) => void): UseLiveGameDraftResult {
  const [draft, setDraft] = useState(initial)
  const [status, setStatus] = useState<LiveGameDraftStatus>('saved')
  const [error, setError] = useState<Error | null>(null)
  const [remoteState, setRemoteState] = useState<LiveGameDraftRemoteState>('active')

  const draftRef = useRef(initial)
  const onPublishedRef = useRef(onPublished)
  const mountedRef = useRef(true)
  const errorRef = useRef<Error | null>(null)
  const remoteStateRef = useRef<LiveGameDraftRemoteState>('active')
  const activePathRef = useRef<GameDraftPatchPath | null>(null)
  const timersRef = useRef(new Map<GameDraftPatchPath, number>())
  const pollingIntervalRef = useRef<number | null>(null)
  const pollingInFlightRef = useRef(false)
  const publishIntentRef = useRef(false)
  const publishInFlightRef = useRef(false)
  const publishPromiseRef = useRef<Promise<Game | null> | null>(null)
  const closePromiseRef = useRef<Promise<boolean> | null>(null)
  const pendingPatchesRef = useRef(new Map<GameDraftPatchPath, GameDraftPatch>())
  const failedPathsRef = useRef(new Set<GameDraftPatchPath>())
  const inFlightPathsRef = useRef(new Set<GameDraftPatchPath>())
  const inFlightPromisesRef = useRef(new Map<GameDraftPatchPath, Promise<boolean>>())

  useEffect(() => {
    onPublishedRef.current = onPublished
  }, [onPublished])

  const replaceDraft = useCallback((next: GameDraft) => {
    draftRef.current = next
    setDraft(next)
  }, [])

  const setLiveError = useCallback((next: Error | null) => {
    errorRef.current = next
    setError(next)
  }, [])

  const clearSaveTimers = useCallback(() => {
    for (const timer of timersRef.current.values()) window.clearTimeout(timer)
    timersRef.current.clear()
  }, [])

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current === null) return
    window.clearInterval(pollingIntervalRef.current)
    pollingIntervalRef.current = null
  }, [])

  const markTerminal = useCallback((next: Exclude<LiveGameDraftRemoteState, 'active'>) => {
    const transition = getLiveGameDraftTerminalTransition(remoteStateRef.current, next)
    if (!transition.didTransition) return

    remoteStateRef.current = transition.remoteState
    publishIntentRef.current = false
    publishInFlightRef.current = false
    clearSaveTimers()
    stopPolling()
    if (!mountedRef.current) return true
    setRemoteState(transition.remoteState)
    setLiveError(null)
    setStatus('saved')
    return true
  }, [clearSaveTimers, setLiveError, stopPolling])

  const save = useCallback(async (requestedPatches: GameDraftPatch[]): Promise<boolean> => {
    if (!mountedRef.current || remoteStateRef.current !== 'active') return false

    const patches = requestedPatches.filter(patch => (
      pendingPatchesRef.current.get(patch.path) === patch
      && !inFlightPathsRef.current.has(patch.path)
    ))
    if (!patches.length) {
      const inFlight = new Set<Promise<boolean>>()
      for (const patch of requestedPatches) {
        if (pendingPatchesRef.current.get(patch.path) !== patch) continue
        const operation = inFlightPromisesRef.current.get(patch.path)
        if (operation) inFlight.add(operation)
      }
      return inFlight.size ? (await Promise.all(inFlight)).every(Boolean) : true
    }

    for (const patch of patches) inFlightPathsRef.current.add(patch.path)
    if (mountedRef.current) setStatus('saving')

    let operation: Promise<boolean> = Promise.resolve(true)
    operation = (async () => {
      try {
        const remote = await patchGameDraft(draftRef.current.id, patches)
        if (!mountedRef.current || remoteStateRef.current !== 'active') return false

        for (const patch of patches) {
          if (pendingPatchesRef.current.get(patch.path) === patch) {
            pendingPatchesRef.current.delete(patch.path)
          }
          failedPathsRef.current.delete(patch.path)
        }

        const merged = mergeLiveGameDraft(
          draftRef.current,
          remote,
          activePathRef.current,
          pendingPatchesRef.current.values(),
        )
        if (mountedRef.current) replaceDraft(merged)
        return true
      } catch (saveError) {
        if (errorStatus(saveError) === 404 && remoteStateRef.current === 'active') {
          markTerminal(getLiveGameDraftTerminalState(draftRef.current, publishIntentRef.current))
        } else if (mountedRef.current && remoteStateRef.current === 'active') {
          for (const patch of patches) failedPathsRef.current.add(patch.path)
          setLiveError(asError(saveError))
          setStatus('error')
        }
        return false
      } finally {
        const queuedPatches = getQueuedGameDraftPatches(pendingPatchesRef.current, patches)
        for (const patch of patches) {
          inFlightPathsRef.current.delete(patch.path)
          if (inFlightPromisesRef.current.get(patch.path) === operation) {
            inFlightPromisesRef.current.delete(patch.path)
          }
        }
        if (mountedRef.current && remoteStateRef.current === 'active') {
          if (failedPathsRef.current.size) setStatus('error')
          else if (!pendingPatchesRef.current.size && !inFlightPathsRef.current.size) {
            setLiveError(null)
            setStatus('saved')
          } else {
            setStatus('saving')
          }
        }
        if (mountedRef.current && remoteStateRef.current === 'active' && queuedPatches.length) {
          void save(queuedPatches)
        }
      }
    })()

    for (const patch of patches) inFlightPromisesRef.current.set(patch.path, operation)
    return operation
  }, [markTerminal, replaceDraft, setLiveError])

  const poll = useCallback(async () => {
    if (!mountedRef.current || remoteStateRef.current !== 'active' || pollingInFlightRef.current) return
    pollingInFlightRef.current = true

    try {
      const remote = await fetchGameDraft(draftRef.current.id)
      if (!mountedRef.current || remoteStateRef.current !== 'active') return

      publishIntentRef.current = reconcileLiveGameDraftPublishIntent(
        publishIntentRef.current,
        publishInFlightRef.current,
        remote,
      )
      replaceDraft(mergeLiveGameDraft(
        draftRef.current,
        remote,
        activePathRef.current,
        pendingPatchesRef.current.values(),
      ))
      if (!errorRef.current && !pendingPatchesRef.current.size && !inFlightPathsRef.current.size) {
        setStatus('saved')
      }
    } catch (pollError) {
      if (errorStatus(pollError) === 404 && remoteStateRef.current === 'active') {
        markTerminal(getLiveGameDraftTerminalState(draftRef.current, publishIntentRef.current))
      } else if (mountedRef.current && remoteStateRef.current === 'active') {
        setLiveError(asError(pollError))
        setStatus('error')
      }
    } finally {
      pollingInFlightRef.current = false
    }
  }, [markTerminal, replaceDraft, setLiveError])

  const beginField = useCallback((path: GameDraftPatchPath) => {
    if (remoteStateRef.current === 'active') activePathRef.current = path
  }, [])

  const endField = useCallback((path: GameDraftPatchPath) => {
    activePathRef.current = endLiveGameDraftField(activePathRef.current, path)
  }, [])

  const update = useCallback((patch: GameDraftPatch) => {
    if (remoteStateRef.current !== 'active') return

    pendingPatchesRef.current.set(patch.path, patch)
    failedPathsRef.current.delete(patch.path)
    replaceDraft(applyGameDraftPatches(draftRef.current, [patch]))
    setLiveError(null)
    setStatus('saving')

    const previousTimer = timersRef.current.get(patch.path)
    if (previousTimer !== undefined) window.clearTimeout(previousTimer)
    const timer = window.setTimeout(() => {
      timersRef.current.delete(patch.path)
      void save([patch])
    }, LIVE_DRAFT_TIMING.saveDelayMs)
    timersRef.current.set(patch.path, timer)
  }, [replaceDraft, save, setLiveError])

  const retry = useCallback(async () => {
    if (remoteStateRef.current !== 'active') return false
    setLiveError(null)

    const inFlight = [...inFlightPromisesRef.current.values()]
    if (inFlight.length) {
      await Promise.all(inFlight)
    }

    const pending = [...pendingPatchesRef.current.values()]
    if (pending.length) return save(pending)
    await poll()
    return remoteStateRef.current === 'active' && !errorRef.current
  }, [poll, save, setLiveError])

  const flushPending = useCallback(async () => {
    clearSaveTimers()

    return flushLiveGameDraftPatches({
      isActive: () => mountedRef.current && remoteStateRef.current === 'active',
      pendingPatches: () => [...pendingPatchesRef.current.values()],
      inFlightPromises: () => inFlightPromisesRef.current.values(),
      hasFailedPatches: () => Boolean(failedPathsRef.current.size),
      save,
    })
  }, [clearSaveTimers, save])

  const close = useCallback(() => startLiveGameDraftClose(closePromiseRef, flushPending), [flushPending])

  const publish = useCallback(() => startLiveGameDraftPublish(publishPromiseRef, async () => {
    if (remoteStateRef.current !== 'active' || !(await flushPending()) || remoteStateRef.current !== 'active') return null

    publishIntentRef.current = true
    publishInFlightRef.current = true
    try {
      const game = await publishGameDraft(draftRef.current.id)
      if (!mountedRef.current || remoteStateRef.current !== 'active') return game
      if (markTerminal('published')) onPublishedRef.current(game)
      return game
    } catch (publishError) {
      if (errorStatus(publishError) === 404 && remoteStateRef.current === 'active') {
        const terminalState = getLiveGameDraftTerminalState(draftRef.current, publishIntentRef.current)
        markTerminal(terminalState)
      } else if (mountedRef.current && remoteStateRef.current === 'active') {
        setLiveError(asError(publishError))
        setStatus('error')
      }
      return null
    } finally {
      publishInFlightRef.current = false
    }
  }), [flushPending, markTerminal, setLiveError])

  const discard = useCallback(async () => {
    if (remoteStateRef.current !== 'active') return false

    try {
      await deleteGameDraft(draftRef.current.id)
      if (remoteStateRef.current !== 'active') return false
      markTerminal('discarded')
      return true
    } catch (discardError) {
      if (errorStatus(discardError) === 404 && remoteStateRef.current === 'active') {
        markTerminal(getLiveGameDraftTerminalState(draftRef.current, publishIntentRef.current))
      } else if (mountedRef.current && remoteStateRef.current === 'active') {
        setLiveError(asError(discardError))
        setStatus('error')
      }
      return false
    }
  }, [markTerminal, setLiveError])

  useEffect(() => startLiveGameDraftLifecycle(
    mountedRef,
    () => {
      pollingIntervalRef.current = window.setInterval(() => void poll(), LIVE_DRAFT_TIMING.pollIntervalMs)
    },
    clearSaveTimers,
    stopPolling,
  ), [clearSaveTimers, poll, stopPolling])

  return {
    draft,
    status,
    error,
    remoteState,
    terminalState: remoteState === 'active' ? null : remoteState,
    beginField,
    endField,
    update,
    close,
    retry,
    publish,
    discard,
  }
}
