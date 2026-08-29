import { useCallback, useEffect, useRef, useState } from 'react'
import type { SessionPlan } from './types'
import { applySessionDraftPatches, mergeRemoteSessionDraft, type SessionDraft, type SessionDraftPatch, type SessionDraftPatchPath } from './sharedSessionDrafts'
import { deleteSessionDraft, fetchSessionDraft, patchSessionDraft, publishSessionDraft } from './sessionDraftApi'

export const LIVE_SESSION_DRAFT_TIMING = { saveDelayMs: 400, pollIntervalMs: 1000 } as const
export type LiveSessionDraftStatus = 'saved' | 'saving' | 'error'
export type LiveSessionDraftRemoteState = 'active' | 'published' | 'discarded'
export type LiveSessionDraftTerminalState = Exclude<LiveSessionDraftRemoteState, 'active'>

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('status' in error)) return null
  return typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : null
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error('Unable to update the live session draft.')
}

function mergeLiveSessionDraft(local: SessionDraft, remote: SessionDraft, activePath: SessionDraftPatchPath | null, pending: Iterable<SessionDraftPatch>) {
  if (remote.revision < local.revision) return local
  let merged = mergeRemoteSessionDraft(local, remote, activePath)
  for (const patch of pending) if (patch.path !== activePath) merged = applySessionDraftPatches(merged, [patch])
  return merged
}

function startOperation<T>(slot: { current: Promise<T> | null }, start: () => Promise<T>) {
  if (slot.current) return slot.current
  const operation = Promise.resolve().then(start)
  slot.current = operation
  void operation.then(
    () => { if (slot.current === operation) slot.current = null },
    () => { if (slot.current === operation) slot.current = null },
  )
  return operation
}

export function useLiveSessionDraft(initial: SessionDraft, onPublished: (session: SessionPlan) => void) {
  const [draft, setDraft] = useState(initial)
  const [status, setStatus] = useState<LiveSessionDraftStatus>('saved')
  const [error, setError] = useState<Error | null>(null)
  const [remoteState, setRemoteState] = useState<LiveSessionDraftRemoteState>('active')
  const draftRef = useRef(initial)
  const onPublishedRef = useRef(onPublished)
  const mountedRef = useRef(true)
  const errorRef = useRef<Error | null>(null)
  const remoteStateRef = useRef<LiveSessionDraftRemoteState>('active')
  const activePathRef = useRef<SessionDraftPatchPath | null>(null)
  const pendingRef = useRef(new Map<SessionDraftPatchPath, SessionDraftPatch>())
  const failedRef = useRef(new Set<SessionDraftPatchPath>())
  const inFlightPathsRef = useRef(new Set<SessionDraftPatchPath>())
  const inFlightRef = useRef(new Map<SessionDraftPatchPath, Promise<boolean>>())
  const timersRef = useRef(new Map<SessionDraftPatchPath, number>())
  const pollingRef = useRef<number | null>(null)
  const pollingInFlightRef = useRef(false)
  const publishIntentRef = useRef(false)
  const publishPromiseRef = useRef<Promise<SessionPlan | null> | null>(null)
  const closePromiseRef = useRef<Promise<boolean> | null>(null)

  useEffect(() => { onPublishedRef.current = onPublished }, [onPublished])
  const replaceDraft = useCallback((next: SessionDraft) => { draftRef.current = next; setDraft(next) }, [])
  const setLiveError = useCallback((next: Error | null) => { errorRef.current = next; setError(next) }, [])
  const clearTimers = useCallback(() => { for (const timer of timersRef.current.values()) window.clearTimeout(timer); timersRef.current.clear() }, [])
  const stopPolling = useCallback(() => { if (pollingRef.current !== null) { window.clearInterval(pollingRef.current); pollingRef.current = null } }, [])

  const markTerminal = useCallback((next: LiveSessionDraftTerminalState) => {
    if (remoteStateRef.current !== 'active') return false
    remoteStateRef.current = next
    clearTimers()
    stopPolling()
    if (mountedRef.current) { setRemoteState(next); setLiveError(null); setStatus('saved') }
    return true
  }, [clearTimers, setLiveError, stopPolling])

  const save = useCallback(async (requested: SessionDraftPatch[]): Promise<boolean> => {
    if (!mountedRef.current || remoteStateRef.current !== 'active') return false
    const patches = requested.filter(patch => pendingRef.current.get(patch.path) === patch && !inFlightPathsRef.current.has(patch.path))
    if (!patches.length) {
      const operations = requested.map(patch => inFlightRef.current.get(patch.path)).filter((operation): operation is Promise<boolean> => Boolean(operation))
      return operations.length ? (await Promise.all(operations)).every(Boolean) : true
    }
    for (const patch of patches) inFlightPathsRef.current.add(patch.path)
    setStatus('saving')
    let operation: Promise<boolean> = Promise.resolve(true)
    operation = (async () => {
      try {
        const remote = await patchSessionDraft(draftRef.current.id, patches)
        if (!mountedRef.current || remoteStateRef.current !== 'active') return false
        for (const patch of patches) {
          if (pendingRef.current.get(patch.path) === patch) pendingRef.current.delete(patch.path)
          failedRef.current.delete(patch.path)
        }
        replaceDraft(mergeLiveSessionDraft(draftRef.current, remote, activePathRef.current, pendingRef.current.values()))
        return true
      } catch (saveError) {
        if (errorStatus(saveError) === 404) markTerminal(publishIntentRef.current ? 'published' : 'discarded')
        else if (mountedRef.current && remoteStateRef.current === 'active') {
          for (const patch of patches) failedRef.current.add(patch.path)
          setLiveError(asError(saveError)); setStatus('error')
        }
        return false
      } finally {
        for (const patch of patches) {
          inFlightPathsRef.current.delete(patch.path)
          if (inFlightRef.current.get(patch.path) === operation) inFlightRef.current.delete(patch.path)
        }
        if (mountedRef.current && remoteStateRef.current === 'active') {
          if (failedRef.current.size) setStatus('error')
          else if (!pendingRef.current.size && !inFlightPathsRef.current.size) { setLiveError(null); setStatus('saved') }
          else setStatus('saving')
          const queued = patches.map(patch => pendingRef.current.get(patch.path)).filter((patch): patch is SessionDraftPatch => Boolean(patch && !inFlightPathsRef.current.has(patch.path)))
          if (queued.length) void save(queued)
        }
      }
    })()
    for (const patch of patches) inFlightRef.current.set(patch.path, operation)
    return operation
  }, [markTerminal, replaceDraft, setLiveError])

  const poll = useCallback(async () => {
    if (!mountedRef.current || remoteStateRef.current !== 'active' || pollingInFlightRef.current) return false
    pollingInFlightRef.current = true
    try {
      const remote = await fetchSessionDraft(draftRef.current.id)
      if (!mountedRef.current || remoteStateRef.current !== 'active') return false
      replaceDraft(mergeLiveSessionDraft(draftRef.current, remote, activePathRef.current, pendingRef.current.values()))
      if (!errorRef.current && !pendingRef.current.size && !inFlightPathsRef.current.size) setStatus('saved')
      return true
    } catch (pollError) {
      if (errorStatus(pollError) === 404) markTerminal(publishIntentRef.current ? 'published' : 'discarded')
      else if (mountedRef.current && remoteStateRef.current === 'active') { setLiveError(asError(pollError)); setStatus('error') }
      return false
    } finally { pollingInFlightRef.current = false }
  }, [markTerminal, replaceDraft, setLiveError])

  const update = useCallback((patch: SessionDraftPatch) => {
    if (remoteStateRef.current !== 'active') return
    pendingRef.current.set(patch.path, patch); failedRef.current.delete(patch.path)
    replaceDraft(applySessionDraftPatches(draftRef.current, [patch])); setLiveError(null); setStatus('saving')
    const previous = timersRef.current.get(patch.path)
    if (previous !== undefined) window.clearTimeout(previous)
    timersRef.current.set(patch.path, window.setTimeout(() => { timersRef.current.delete(patch.path); void save([patch]) }, LIVE_SESSION_DRAFT_TIMING.saveDelayMs))
  }, [replaceDraft, save, setLiveError])

  const retry = useCallback(async () => {
    if (remoteStateRef.current !== 'active') return false
    setLiveError(null)
    const inFlight = [...inFlightRef.current.values()]
    if (inFlight.length) await Promise.all(inFlight)
    const pending = [...pendingRef.current.values()]
    if (pending.length) return save(pending)
    await poll()
    return remoteStateRef.current === 'active' && !errorRef.current
  }, [poll, save, setLiveError])

  const flush = useCallback(async () => {
    clearTimers()
    while (mountedRef.current && remoteStateRef.current === 'active') {
      const inFlight = [...new Set(inFlightRef.current.values())]
      const pending = [...pendingRef.current.values()]
      if (!inFlight.length && !pending.length) return !failedRef.current.size
      const results = await Promise.all([...inFlight, ...(pending.length ? [save(pending)] : [])])
      if (!results.every(Boolean)) return false
    }
    return false
  }, [clearTimers, save])

  const close = useCallback(() => startOperation(closePromiseRef, flush), [flush])
  const publish = useCallback(() => startOperation(publishPromiseRef, async () => {
    if (remoteStateRef.current !== 'active' || !await flush() || remoteStateRef.current !== 'active') return null
    publishIntentRef.current = true
    try {
      const session = await publishSessionDraft(draftRef.current.id)
      if (markTerminal('published')) onPublishedRef.current(session)
      return session
    } catch (publishError) {
      if (errorStatus(publishError) === 404) markTerminal('published')
      else if (mountedRef.current && remoteStateRef.current === 'active') { setLiveError(asError(publishError)); setStatus('error') }
      return null
    }
  }), [flush, markTerminal, setLiveError])
  const discard = useCallback(async () => {
    if (remoteStateRef.current !== 'active') return false
    try { await deleteSessionDraft(draftRef.current.id); markTerminal('discarded'); return true }
    catch (discardError) {
      if (errorStatus(discardError) === 404) markTerminal(publishIntentRef.current ? 'published' : 'discarded')
      else if (mountedRef.current && remoteStateRef.current === 'active') { setLiveError(asError(discardError)); setStatus('error') }
      return false
    }
  }, [markTerminal, setLiveError])

  useEffect(() => {
    mountedRef.current = true
    pollingRef.current = window.setInterval(() => void poll(), LIVE_SESSION_DRAFT_TIMING.pollIntervalMs)
    return () => { mountedRef.current = false; clearTimers(); stopPolling() }
  }, [clearTimers, poll, stopPolling])

  return {
    draft, status, error, remoteState, terminalState: remoteState === 'active' ? null : remoteState,
    beginField: (path: SessionDraftPatchPath) => { if (remoteStateRef.current === 'active') activePathRef.current = path },
    endField: (path: SessionDraftPatchPath) => { if (activePathRef.current === path) activePathRef.current = null },
    update, retry, close, publish, discard,
  }
}
