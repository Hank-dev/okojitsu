/**
 * suggestionEngine.ts — Pure-logic complementary-game suggestion engine for ØkoJitsu.
 *
 * Analyses the games currently placed in a session and returns up to 6 ranked,
 * complementary game suggestions across four axes:
 *
 *   1. PROGRESSION  — the natural next step in a progression chain (priority 100)
 *   2. BALANCE      — fill gaps in the three core CLA blocks (priority 80)
 *   3. SKILL MATCH  — games from a new category that share skills (priority 60)
 *   4. ROLE FLIP    — the defender's/bottom perspective on a position (priority 40)
 *
 * The module is side-effect free and deterministic: the same `(slotGameIds, games)`
 * pair always yields the same `Suggestion[]`.
 */

import type { Game } from './types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SuggestionType = 'progression' | 'balance' | 'skill' | 'role-flip';

export interface Suggestion {
  gameId: string;
  /** Human-readable explanation of why this game is suggested. */
  reason: string;
  type: SuggestionType;
  /** Higher = more relevant; used for sorting the final list. */
  priority: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of suggestions returned. */
const MAX_SUGGESTIONS = 6;

/**
 * The three core CLA modalities that should be represented in every session,
 * mirroring sessionGenerator.ts: "standing, guarded, and pinning work in every
 * all-levels class."
 */
const CORE_BLOCKS = ['standing', 'guard-passing', 'pinning'] as const;

/**
 * Complementary category pairs used by the ROLE-FLIP rule. A game that has a
 * "Top" / "Passer" role in the left category is complemented by a game with a
 * "Bottom" / "Defender" role in the right category, and vice-versa.
 */
const COMPLEMENTARY_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['guard-passing', 'guard'],
  ['pinning', 'stand-up'],
];

/** Numeric difficulty used to prefer simpler games for balance suggestions. */
const LEVEL_DIFFICULTY: Record<string, number> = {
  beginner: 0,
  'all-levels': 1,
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Difficulty rank for a level string (unknown levels sort hardest). */
function levelDifficulty(level: string): number {
  return LEVEL_DIFFICULTY[level] ?? 99;
}

/** Stable comparator: easiest level first, then id for determinism. */
function byLevelThenId(a: Game, b: Game): number {
  const d = levelDifficulty(a.level) - levelDifficulty(b.level);
  return d !== 0 ? d : a.id.localeCompare(b.id);
}

/** True when a player role string marks the top/offensive perspective. */
function isTopRole(role: string): boolean {
  const r = role.toLowerCase();
  return r.includes('top') || r.includes('passer') || r.includes('pinner');
}

/** True when a player role string marks the bottom/defensive perspective. */
function isBottomRole(role: string): boolean {
  const r = role.toLowerCase();
  return r.includes('bottom') || r.includes('defender') || r.includes('guard player');
}

/** Whether any player in a game has a top/offensive role. */
function gameHasTopRole(game: Game): boolean {
  return game.players.some((p) => isTopRole(p.role));
}

/** Whether any player in a game has a bottom/defensive role. */
function gameHasBottomRole(game: Game): boolean {
  return game.players.some((p) => isBottomRole(p.role));
}

/** Human-readable label for a category, falling back to the raw key. */
function categoryLabel(category: string): string {
  return category
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Rule 1 — PROGRESSION (priority 100)
// ---------------------------------------------------------------------------

/**
 * If the LAST game in the session has a `progression.nextId`, suggest that next
 * game. This keeps a learner moving forward through an ordered chain.
 */
function progressionSuggestions(
  slotGames: Game[],
  gamesById: Map<string, Game>,
  inSession: Set<string>,
): Suggestion[] {
  if (slotGames.length === 0) return [];
  const last = slotGames[slotGames.length - 1];
  const prog = last.progression;
  if (!prog || !prog.nextId) return [];

  const next = gamesById.get(prog.nextId);
  if (!next || inSession.has(next.id)) return [];

  return [
    {
      gameId: next.id,
      reason: `Next step in the ${prog.chainLabel} progression`,
      type: 'progression',
      priority: 100,
    },
  ];
}

// ---------------------------------------------------------------------------
// Rule 2 — BALANCE (priority 80)
// ---------------------------------------------------------------------------

/**
 * Ensures the three core blocks (standing, guard-passing, pinning) are
 * represented. For any core block that is absent or has the minimum count,
 * suggest 1–2 games from it, preferring progression-chain first steps and the
 * most common level in the session.
 */
function balanceSuggestions(
  slotGames: Game[],
  games: Game[],
  inSession: Set<string>,
): Suggestion[] {
  if (slotGames.length === 0) return [];

  // Count how many session games fall into each core block.
  const counts: Record<string, number> = {};
  for (const block of CORE_BLOCKS) counts[block] = 0;
  for (const g of slotGames) {
    if (counts[g.category] !== undefined) counts[g.category]++;
  }

  const minCount = Math.min(...CORE_BLOCKS.map((b) => counts[b]));
  const out: Suggestion[] = [];

  // Most common level in the session, for level-matching candidates.
  const levelCounts: Record<string, number> = {};
  for (const g of slotGames) levelCounts[g.level] = (levelCounts[g.level] ?? 0) + 1;
  const sessionLevels = Object.keys(levelCounts);
  const preferredLevel =
    sessionLevels.length > 0
      ? sessionLevels.sort((a, b) => levelCounts[b] - levelCounts[a])[0]
      : 'all-levels';

  for (const block of CORE_BLOCKS) {
    const n = counts[block];
    // Only address blocks that are empty or tied for the minimum.
    if (n !== 0 && n !== minCount) continue;

    const candidates = games.filter(
      (g) => g.category === block && !inSession.has(g.id),
    );
    if (candidates.length === 0) continue;

    const picked = pickBalanceGames(candidates, preferredLevel, n === 0 ? 2 : 1);
    const reason =
      n === 0
        ? `Balance: no ${categoryLabel(block)} games yet`
        : `Balance: only ${n} ${categoryLabel(block)} game(s), add more`;

    for (const g of picked) {
      out.push({ gameId: g.id, reason, type: 'balance', priority: 80 });
    }
  }

  return out;
}

/**
 * Pick up to `max` games from a core-block pool, preferring:
 *   1. The first step of a progression chain (simple → complex ordering), then
 *   2. Games matching the session's most common level (fallback 'all-levels'),
 *      sorted easiest-first for stable, deterministic output.
 */
function pickBalanceGames(
  pool: Game[],
  preferredLevel: string,
  max: number,
): Game[] {
  // Prefer progression-chain first steps.
  const chainStarts = pool.filter(
    (g) => g.progression && g.progression.step === 1,
  );
  if (chainStarts.length > 0) {
    const levelMatched = chainStarts.filter((g) => g.level === preferredLevel);
    const source = levelMatched.length > 0 ? levelMatched : chainStarts;
    return [...source].sort(byLevelThenId).slice(0, max);
  }

  // No chain starts — fall back to level-matched individual games.
  const levelMatched = pool.filter((g) => g.level === preferredLevel);
  const widened =
    levelMatched.length > 0
      ? levelMatched
      : pool.filter((g) => g.level === 'all-levels');
  const source = widened.length > 0 ? widened : pool;
  return [...source].sort(byLevelThenId).slice(0, max);
}

// ---------------------------------------------------------------------------
// Rule 3 — SKILL MATCH (priority 60)
// ---------------------------------------------------------------------------

/**
 * Finds games NOT in the session that share at least 2 skills with the union of
 * the session's skills, but come from a DIFFERENT category than any session
 * game. Returns the top 2 by shared-skill count.
 */
function skillMatchSuggestions(
  slotGames: Game[],
  games: Game[],
  inSession: Set<string>,
): Suggestion[] {
  if (slotGames.length === 0) return [];

  const sessionSkills = new Set<string>();
  for (const g of slotGames) for (const s of g.skills) sessionSkills.add(s);
  if (sessionSkills.size < 2) return []; // can't share ≥2 with <2 skills

  const sessionCategories = new Set(slotGames.map((g) => g.category));

  const scored: Array<{ game: Game; shared: string[] }> = [];
  for (const g of games) {
    if (inSession.has(g.id)) continue;
    if (sessionCategories.has(g.category)) continue;

    const shared = g.skills.filter((s) => sessionSkills.has(s));
    if (shared.length >= 2) scored.push({ game: g, shared });
  }

  // Sort by shared count desc, then id for determinism.
  scored.sort((a, b) => {
    const d = b.shared.length - a.shared.length;
    return d !== 0 ? d : a.game.id.localeCompare(b.game.id);
  });

  return scored.slice(0, 2).map(({ game, shared }) => ({
    gameId: game.id,
    reason: `Shares ${shared[0]} + ${shared[1]} with your current games`,
    type: 'skill',
    priority: 60,
  }));
}

// ---------------------------------------------------------------------------
// Rule 4 — ROLE FLIP (priority 40)
// ---------------------------------------------------------------------------

/**
 * For session games with a top/offensive role, find a game in the complementary
 * category that has a bottom/defensive role — surfacing the other player's
 * perspective on the same positional situation. Takes at most 1 suggestion.
 */
function roleFlipSuggestions(
  slotGames: Game[],
  games: Game[],
  inSession: Set<string>,
): Suggestion[] {
  // Identify which complementary category we should look into, based on the
  // session's top-role games.
  const targetCategories = new Set<string>();
  for (const g of slotGames) {
    if (!gameHasTopRole(g)) continue;
    for (const [a, b] of COMPLEMENTARY_PAIRS) {
      if (g.category === a) targetCategories.add(b);
      if (g.category === b) targetCategories.add(a);
    }
  }
  if (targetCategories.size === 0) return [];

  // Only consider categories not already represented in the session.
  const sessionCategories = new Set(slotGames.map((g) => g.category));

  const candidates = games.filter(
    (g) =>
      !inSession.has(g.id) &&
      targetCategories.has(g.category) &&
      !sessionCategories.has(g.category) &&
      gameHasBottomRole(g),
  );
  if (candidates.length === 0) return [];

  // Stable pick: easiest first, then id.
  candidates.sort(byLevelThenId);
  const pick = candidates[0];
  const position = categoryLabel(pick.category);

  return [
    {
      gameId: pick.id,
      reason: `Defender's perspective for ${position}`,
      type: 'role-flip',
      priority: 40,
    },
  ];
}

// ---------------------------------------------------------------------------
// Deduplication & ordering
// ---------------------------------------------------------------------------

/**
 * Merge suggestions, keeping the highest-priority reason for any duplicate
 * gameId, then sort by priority (desc) and cap at MAX_SUGGESTIONS.
 */
function dedupeAndRank(suggestions: Suggestion[]): Suggestion[] {
  const best = new Map<string, Suggestion>();
  for (const s of suggestions) {
    const existing = best.get(s.gameId);
    if (!existing || s.priority > existing.priority) {
      best.set(s.gameId, s);
    }
  }
  return [...best.values()]
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.gameId.localeCompare(b.gameId); // stable tiebreak
    })
    .slice(0, MAX_SUGGESTIONS);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Analyse the games currently in a session and return up to 6 complementary
 * game suggestions, ranked by priority.
 *
 * @param slotGameIds Ordered list of game IDs currently placed in the session.
 * @param games       The full game catalogue.
 */
export function getSuggestions(
  slotGameIds: string[],
  games: Game[],
): Suggestion[] {
  // Handle empty sessions.
  if (!Array.isArray(slotGameIds) || slotGameIds.length === 0) return [];
  if (!Array.isArray(games) || games.length === 0) return [];

  // Index the catalogue for O(1) lookups.
  const gamesById = new Map<string, Game>();
  for (const g of games) gamesById.set(g.id, g);

  // Resolve slot IDs to actual Game objects (skip any unknown IDs gracefully).
  const slotGames: Game[] = [];
  for (const id of slotGameIds) {
    const g = gamesById.get(id);
    if (g) slotGames.push(g);
  }
  if (slotGames.length === 0) return [];

  const inSession = new Set(slotGameIds);

  const raw: Suggestion[] = [
    ...progressionSuggestions(slotGames, gamesById, inSession),
    ...balanceSuggestions(slotGames, games, inSession),
    ...skillMatchSuggestions(slotGames, games, inSession),
    ...roleFlipSuggestions(slotGames, games, inSession),
  ];

  return dedupeAndRank(raw);
}
