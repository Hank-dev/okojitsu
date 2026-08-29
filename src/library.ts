import type { Game, Skill } from './types'

export interface LibraryFilters {
  category: string
  level: string
  type: string
  skill: string
  query: string
  categoryLabels?: Readonly<Record<string, string>>
}

export type LibrarySort = 'recommended' | 'title' | 'category'

export function gameMatchesSearch(game: Game, query: string, categoryLabel = ''): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const values = [
    game.title,
    game.category,
    game.category.replaceAll('-', ' '),
    game.subcategory ?? '',
    categoryLabel,
    game.startingPosition,
    game.designRationale ?? '',
    game.source,
    ...game.tags,
    ...game.skills,
    ...game.constraints,
    ...game.players.flatMap(player => [
      player.role,
      player.objective,
      player.winCondition,
      ...player.constraints,
    ]),
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

export function sortGames(
  games: Game[],
  sort: LibrarySort,
  categoryLabels: Readonly<Record<string, string>> = {},
): Game[] {
  const sorted = [...games]
  if (sort === 'recommended') return sorted

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
