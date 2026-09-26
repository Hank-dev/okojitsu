import type { Game, SessionPlan, Skill } from './types'

export interface LibraryFilters {
  category: string
  level: string
  type: string
  skill: string
  query: string
  categoryLabels?: Readonly<Record<string, string>>
}

export type LibrarySort = 'recommended' | 'title' | 'category'

export function mergeGamesWithOverrides(
  seedGames: Game[],
  customGames: Game[],
  deletedSeedGameIds: string[] = [],
): Game[] {
  const deletedIds = new Set(deletedSeedGameIds)
  const customById = new Map(customGames.map(game => [game.id, game]))
  const merged = seedGames
    .filter(game => !deletedIds.has(game.id))
    .map(game => customById.get(game.id) ?? game)
  const seedIds = new Set(seedGames.map(game => game.id))

  return [...merged, ...customGames.filter(game => !seedIds.has(game.id))]
}

export function gameMatchesSearch(game: Game, query: string, categoryLabel = ''): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const values = [
    game.title,
    game.startingPosition,
    game.designRationale ?? '',
  ]
  return values.some(value => value.toLowerCase().includes(needle))
}

export function filterGames(games: Game[], filters: LibraryFilters): Game[] {
  return games.filter(game =>
    (filters.category === 'all' || game.category === filters.category) &&
    (filters.level === 'all' || game.level === filters.level) &&
    (filters.type === 'all' || game.type === filters.type) &&
    (filters.skill === 'all' || game.skills.includes(filters.skill as Skill)) &&
    gameMatchesSearch(game, filters.query, filters.categoryLabels?.[game.category])
  )
}

export function countGamesByCategory(games: Game[]): Record<string, number> {
  return games.reduce<Record<string, number>>((counts, game) => {
    counts.all = (counts.all ?? 0) + 1
    counts[game.category] = (counts[game.category] ?? 0) + 1
    return counts
  }, {})
}

export function countGameUsage(sessions: SessionPlan[]): Record<string, number> {
  return sessions.reduce<Record<string, number>>((counts, session) => {
    for (const game of session.games) {
      counts[game.gameId] = (counts[game.gameId] ?? 0) + 1
    }
    return counts
  }, {})
}

export function sortGames(
  games: Game[],
  sort: LibrarySort,
  categoryLabels: Readonly<Record<string, string>> = {},
  usageCounts: Readonly<Record<string, number>> = {},
): Game[] {
  const sorted = [...games]
  if (sort === 'recommended') {
    return sorted.sort((a, b) =>
      (usageCounts[b.id] ?? 0) - (usageCounts[a.id] ?? 0)
      || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    )
  }

  return sorted.sort((a, b) => {
    const aPrimary = sort === 'title' ? a.title : (categoryLabels[a.category] ?? a.category.replaceAll('-', ' '))
    const bPrimary = sort === 'title' ? b.title : (categoryLabels[b.category] ?? b.category.replaceAll('-', ' '))
    return aPrimary.localeCompare(bPrimary, undefined, { sensitivity: 'base' })
      || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  })
}

export function getPlayerGoalType(game: Game, playerIndex: number): 'continuous' | 'terminal' {
  if (game.type === 'continuous') return 'continuous'
  if (game.type === 'terminal') return 'terminal'
  const winCondition = game.players[playerIndex]?.winCondition?.trim() ?? ''
  return !winCondition || /continuous|maintain|maintenance|as long as|no win condition|survival/i.test(winCondition)
    ? 'continuous'
    : 'terminal'
}
