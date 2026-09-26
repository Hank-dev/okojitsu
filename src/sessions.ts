import type { Game, SessionGame, SessionPlan } from './types.ts'

export type SessionTimelineItem = SessionGame & {
  index: number
  startMinute: number
  endMinute: number
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MONTH_BY_NAME: Record<string, number> = {
  jan: 1, januar: 1, january: 1,
  feb: 2, februar: 2, february: 2,
  mar: 3, mars: 3, march: 3,
  apr: 4, april: 4,
  mai: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11,
  des: 12, desember: 12, dec: 12, december: 12,
}

function dateOnly(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isValidDateOnly(value: string) {
  if (!DATE_ONLY_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function cleanupTitleDate(title: string, start: number, length: number) {
  return `${title.slice(0, start)}${title.slice(start + length)}`
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,:;\-–—]+$/g, '')
    .trim()
}

function titleDate(title: string, referenceYear: number): { date: string; title: string } | null {
  const numericPatterns = [
    /\s*\((?:økt\s*)?(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\)\s*/i,
    /\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/,
  ]
  for (const pattern of numericPatterns) {
    const match = pattern.exec(title)
    if (!match || match.index === undefined) continue
    const rawYear = match[3] ? Number(match[3]) : referenceYear
    const year = rawYear < 100 ? 2000 + rawYear : rawYear
    const date = dateOnly(year, Number(match[2]), Number(match[1]))
    if (date) return { date, title: cleanupTitleDate(title, match.index, match[0].length) }
  }

  const namedMonthPattern = /\b(\d{1,2})\s+(jan(?:uar|uary)?|feb(?:ruar|ruary)?|mar(?:s|ch)?|apr(?:il)?|mai|may|jun(?:i|e)?|jul(?:i|y)?|aug(?:ust)?|sep(?:t|tember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|des(?:ember)?|dec(?:ember)?)\.?(?:\s+(\d{2,4}))?/i
  const match = namedMonthPattern.exec(title)
  if (!match || match.index === undefined) return null
  const month = MONTH_BY_NAME[match[2].toLowerCase()]
  const rawYear = match[3] ? Number(match[3]) : referenceYear
  const year = rawYear < 100 ? 2000 + rawYear : rawYear
  const date = dateOnly(year, month, Number(match[1]))
  return date ? { date, title: cleanupTitleDate(title, match.index, match[0].length) } : null
}

function dateTimestamp(value: string) {
  if (DATE_ONLY_PATTERN.test(value) && !isValidDateOnly(value)) return Number.NEGATIVE_INFINITY
  const timestamp = Date.parse(DATE_ONLY_PATTERN.test(value) ? `${value}T00:00:00Z` : value)
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY
}

export function sortSessionsByDateDescending(sessions: SessionPlan[]): SessionPlan[] {
  return [...sessions].sort((left, right) =>
    dateTimestamp(right.date) - dateTimestamp(left.date)
    || left.title.localeCompare(right.title)
    || left.id.localeCompare(right.id),
  )
}

/** One-time conversion for sessions created before coaches could choose a date. */
export function migrateLegacySessionDates(sessions: SessionPlan[], referenceDate: string): SessionPlan[] {
  if (!DATE_ONLY_PATTERN.test(referenceDate)) throw new Error('A date-only migration reference is required.')
  const reference = new Date(`${referenceDate}T00:00:00Z`)
  if (!Number.isFinite(reference.getTime()) || reference.toISOString().slice(0, 10) !== referenceDate) throw new Error('A valid migration reference is required.')

  const referenceYear = reference.getUTCFullYear()
  const usedDates = new Set<string>()
  const migratedById = new Map<string, SessionPlan>()
  const needsMonday: SessionPlan[] = []

  for (const session of sessions) {
    const fromTitle = titleDate(session.title, referenceYear)
    if (fromTitle) {
      usedDates.add(fromTitle.date)
      migratedById.set(session.id, { ...session, title: fromTitle.title || session.title, date: fromTitle.date })
    } else if (isValidDateOnly(session.date)) {
      usedDates.add(session.date)
      migratedById.set(session.id, session)
    } else {
      needsMonday.push(session)
    }
  }

  needsMonday.sort((left, right) => dateTimestamp(right.date) - dateTimestamp(left.date) || left.title.localeCompare(right.title) || left.id.localeCompare(right.id))
  const dayOffset = (reference.getUTCDay() + 6) % 7
  let monday = reference.getTime() - dayOffset * 86_400_000
  for (const session of needsMonday) {
    let candidate = new Date(monday).toISOString().slice(0, 10)
    while (usedDates.has(candidate)) {
      monday -= 7 * 86_400_000
      candidate = new Date(monday).toISOString().slice(0, 10)
    }
    usedDates.add(candidate)
    migratedById.set(session.id, { ...session, date: candidate })
    monday -= 7 * 86_400_000
  }

  return sessions.map(session => migratedById.get(session.id) ?? session)
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
