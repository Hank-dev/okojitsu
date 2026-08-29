import type { Game, SessionGame, SessionPlan } from './types.ts'

export type SessionTimelineItem = SessionGame & {
  index: number
  startMinute: number
  endMinute: number
}

export function filterSessions(sessions: SessionPlan[], games: Game[], query: string): SessionPlan[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return sessions

  const gameById = new Map(games.map(game => [game.id, game]))
  return sessions.filter(session => {
    const referencedGameTitles = session.games
      .map(sessionGame => gameById.get(sessionGame.gameId)?.title ?? '')
      .join(' ')
    const searchableText = [
      session.title,
      session.level,
      session.focus,
      session.notes,
      referencedGameTitles,
    ].join(' ').toLowerCase()
    return searchableText.includes(normalizedQuery)
  })
}

export function buildSessionTimeline(session: SessionPlan): SessionTimelineItem[] {
  let currentMinute = 0
  return session.games.map((game, index) => {
    const duration = Math.max(0, Number.isFinite(game.duration) ? game.duration : 0)
    const item = {
      ...game,
      index,
      startMinute: currentMinute,
      endMinute: currentMinute + duration,
    }
    currentMinute = item.endMinute
    return item
  })
}

export function moveSessionGame(games: SessionGame[], index: number, direction: -1 | 1): SessionGame[] {
  const destination = index + direction
  if (!Number.isInteger(index) || index < 0 || index >= games.length || destination < 0 || destination >= games.length) return games

  const reordered = [...games]
  ;[reordered[index], reordered[destination]] = [reordered[destination], reordered[index]]
  return reordered
}

export function reorderSessionGames(games: SessionGame[], fromIndex: number, toIndex: number): SessionGame[] {
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex < 0 || toIndex < 0 || fromIndex >= games.length || toIndex >= games.length || fromIndex === toIndex) return games

  const reordered = [...games]
  const [movedGame] = reordered.splice(fromIndex, 1)
  reordered.splice(toIndex, 0, movedGame)
  return reordered
}

export function resolveActiveSession(sessions: SessionPlan[], activeId: string): SessionPlan | undefined {
  return sessions.find(session => session.id === activeId) ?? sessions[0]
}
