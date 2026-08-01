/**
 * sessionGenerator.ts — Pure-logic CLA session generator for ØkoJitsu.
 *
 * Builds a training session (warm-up → focus → complementary) from the games
 * catalogue following the Ecological Dynamics / Constraints-Led Approach (CLA)
 * structure documented in the coaching theory:
 *
 *   60-min all-levels class ≈ Warm-up (10%) + Focus (40%)
 *                            + Complementary (40%) + implicit Buffer (10%).
 *   "Standing, guarded, and pinning work in every all-levels class, each scaled."
 *
 * The module is intentionally side-effect free and deterministic: the same
 * `(games, options)` pair always yields the same `GeneratedSession`.
 */

import type { Game } from './types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  /** Total session length in minutes (e.g. 60). */
  duration: number;
  /** 'beginner' | 'all-levels' | 'intermediate' | 'advanced'. */
  level: string;
  /** A category key (e.g. 'guard-passing') or the synthetic focus 'balanced'. */
  focus: string;
  /** Seed for randomized selection. Change this to get different results. */
  seed?: number;
}

export type SessionPhase = 'warmup' | 'standing' | 'guard-passing' | 'pinning';

export interface SessionSlot {
  gameId: string;
  duration: number;
  phase: SessionPhase;
  /** Human-readable explanation of why this game was selected. */
  reason: string;
}

export interface GeneratedSession {
  games: SessionSlot[];
  totalDuration: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default (preferred) length of a single game in minutes. */
const DEFAULT_GAME_DURATION = 6;

/** Warm-up gets 10% of total time. The three core blocks share the remaining 80%. */
const WARMUP_FRACTION = 0.1;

/**
 * The three core modalities that must appear in every session, per the CLA
 * coaching doc: "standing, guarded, and pinning work in every all-levels class."
 */
const CORE_BLOCKS = ['standing', 'guard-passing', 'pinning'] as const;

/**
 * Time-share per core block as a fraction of the body budget (after warm-up).
 *
 * The focus block gets FOCUS_SHARE; the other two each get OTHER_SHARE.
 * 'balanced' splits evenly at 1/3 each.
 */
const FOCUS_SHARE = 0.4;   // 40% of body time
const OTHER_SHARE = 0.3;   // 30% of body time
const BALANCED_SHARE = 1 / 3;

/** Hard cap on the number of games per core block. */
const BLOCK_GAME_CAP = 2;

/** Numeric difficulty used to sort games/chains simple → complex. */
const LEVEL_DIFFICULTY: Record<string, number> = {
  beginner: 0,
  'all-levels': 1,
  intermediate: 2,
  advanced: 3,
};

/**
 * Maps a focus category to one of the three core blocks (standing /
 * guard-passing / pinning) so it gets the larger time-share. Categories that
 * aren't one of the core blocks still get a bigger share but the three core
 * blocks are always present.
 */
const FOCUS_TO_CORE_BLOCK: Record<string, string> = {
  'guard-passing': 'guard-passing',
  'guard': 'guard-passing',
  'seated-guard': 'guard-passing',
  'half-guard': 'guard-passing',
  'k-guard-dlr': 'guard-passing',
  'pinning': 'pinning',
  'back-control': 'pinning',
  'armbar': 'pinning',
  'kimura': 'pinning',
  'triangle': 'pinning',
  'submissions': 'pinning',
  'standing': 'standing',
  'stand-up': 'standing',
  'leg-locks': 'standing',
  'front-headlock': 'standing',
  'whole-space': 'standing',
};

// ---------------------------------------------------------------------------
// Seeded randomization
// ---------------------------------------------------------------------------

/**
 * Mulberry32 — tiny deterministic PRNG. Same seed → same sequence.
 * Used to shuffle candidate pools so 'Regenerate' produces variety.
 */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle using a provided RNG (returns a new array). */
function seededShuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Difficulty rank for a level string (unknown levels sort hardest). */
function levelDifficulty(level: string): number {
  return LEVEL_DIFFICULTY[level] ?? 99;
}

/** Comparator: easiest level first, ties left in shuffle order (NOT id-sorted). */
function byLevelOnly(a: Game, b: Game): number {
  return levelDifficulty(a.level) - levelDifficulty(b.level);
}

function hasTag(game: Game, tag: string): boolean {
  return game.tags.includes(tag);
}

/**
 * Level filtering with graceful widening.
 *
 *  1. Keep only games whose level exactly matches `level`.
 *  2. If that yields fewer than `minCount`, widen to also include 'all-levels'.
 *  3. If still fewer than `minCount`, accept every level.
 *
 * Returns the filtered list plus a flag describing which tier was reached.
 */
function filterByLevel(
  candidates: Game[],
  level: string,
  minCount: number,
): { games: Game[]; fallback: 'none' | 'all-levels' | 'any' } {
  const exact = candidates.filter((g) => g.level === level);
  if (exact.length >= minCount) return { games: exact, fallback: 'none' };

  const widened = candidates.filter(
    (g) => g.level === level || g.level === 'all-levels',
  );
  if (widened.length >= minCount) {
    return { games: widened, fallback: 'all-levels' };
  }
  return { games: candidates.slice(), fallback: 'any' };
}

/**
 * Per-game duration. Always 6 minutes — the CLA standard round length.
 * Leftover block time is implicit buffer (transitions, coaching cues, water).
 */
function durationForPhase(_count: number, _budget: number, _cap: number): number {
  return DEFAULT_GAME_DURATION;
}

/** Maximum number of default-duration games a phase can hold within its budget. */
function maxGamesForBudget(budget: number, cap: number = BLOCK_GAME_CAP): number {
  const byBudget = Math.floor(budget / DEFAULT_GAME_DURATION);
  return Math.max(1, Math.min(cap, byBudget));
}

// ---------------------------------------------------------------------------
// Progression chains
// ---------------------------------------------------------------------------

interface ChainInfo {
  chain: string;
  chainLabel: string;
  steps: Game[]; // ordered step 1 → N
}

/**
 * Finds progression chains that are *complete* within `pool` — i.e. every
 * step (1..totalSteps) of the chain is present. Partial chains are ignored so
 * that a broken sequence is never presented as an ordered progression.
 */
function findCompleteChains(pool: Game[]): ChainInfo[] {
  const byChain = new Map<string, Game[]>();
  for (const g of pool) {
    const p = g.progression;
    if (!p) continue;
    const list = byChain.get(p.chain);
    if (list) list.push(g);
    else byChain.set(p.chain, [g]);
  }

  const chains: ChainInfo[] = [];
  for (const [chain, steps] of byChain) {
    const total = steps[0].progression!.totalSteps;
    if (steps.length !== total) continue;

    const present = new Set(steps.map((s) => s.progression!.step));
    let complete = true;
    for (let i = 1; i <= total; i++) {
      if (!present.has(i)) {
        complete = false;
        break;
      }
    }
    if (!complete) continue;

    steps.sort((a, b) => a.progression!.step - b.progression!.step);
    chains.push({
      chain,
      chainLabel: steps[0].progression!.chainLabel,
      steps,
    });
  }
  return chains;
}

/**
 * Picks the best chain: the one whose first step is easiest (lowest level
 * difficulty), breaking ties by chain id for determinism.
 */
function pickBestChain(chains: ChainInfo[], rng: () => number): ChainInfo | null {
  if (chains.length === 0) return null;
  // Sort by first-step difficulty, shuffle within same difficulty tier
  const sorted = [...chains].sort((a, b) => {
    const d = levelDifficulty(a.steps[0].level) - levelDifficulty(b.steps[0].level);
    return d !== 0 ? d : a.chain.localeCompare(b.chain);
  });
  // Among chains at the same difficulty as the easiest, pick randomly
  const easiest = levelDifficulty(sorted[0].steps[0].level);
  const tier = sorted.filter(c => levelDifficulty(c.steps[0].level) === easiest);
  if (tier.length === 1) return tier[0];
  return tier[Math.floor(rng() * tier.length)];
}

// ---------------------------------------------------------------------------
// Reason helpers
// ---------------------------------------------------------------------------

function skillNote(game: Game): string {
  return game.skills.length > 0 ? ` — ${game.skills[0]} focus` : '';
}

function phaseLabel(phase: SessionPhase): string {
  if (phase === 'warmup') return 'Warm-up';
  if (phase === 'guard-passing') return 'Guard Passing';
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

// ---------------------------------------------------------------------------
// Phase pickers
// ---------------------------------------------------------------------------

/**
 * Warm-up phase: a single game.
 *
 * Prefers 'warmup'-tagged games, level-matched, and among those prefers
 * continuous games (low variability, easy to scale for an all-levels room).
 */
function pickWarmup(
  games: Game[],
  level: string,
  budget: number,
  warnings: string[],
  excludeIds: Set<string>,
  rng: () => number,
): SessionSlot[] {
  let candidates = games.filter((g) => hasTag(g, 'warmup') && !excludeIds.has(g.id));
  let usedFallbackPool = false;
  if (candidates.length === 0) {
    // No tagged warm-ups — fall back to the whole catalogue (minus exclusions).
    candidates = games.filter((g) => !excludeIds.has(g.id));
    usedFallbackPool = candidates.length > 0;
    warnings.push(
      "No 'warmup'-tagged games available; using a general game for the warm-up.",
    );
  }
  if (candidates.length === 0) {
    warnings.push('Warm-up: no games available at all.');
    return [];
  }

  const { games: pool, fallback } = filterByLevel(candidates, level, 1);
  if (fallback === 'all-levels') {
    warnings.push(
      `Warm-up: level '${level}' matched no games; included 'all-levels'.`,
    );
  } else if (fallback === 'any') {
    warnings.push(`Warm-up: level '${level}' matched no games; included all levels.`);
  }

  // Continuous first, then shuffle within each type tier for variety.
  const continuous = seededShuffle(pool.filter(g => g.type === 'continuous'), rng)
    .sort(byLevelOnly);
  const others = seededShuffle(pool.filter(g => g.type !== 'continuous'), rng)
    .sort(byLevelOnly);
  const sorted = [...continuous, ...others];

  const game = sorted[0];
  // Warm-up is one short game; prefer 6 min, never exceed its budget.
  const duration = Math.min(
    DEFAULT_GAME_DURATION,
    Math.max(1, Math.floor(budget)),
  );

  let reason: string;
  if (usedFallbackPool) {
    reason = `Warm-up: ${game.type} game — no warm-up-tagged games available`;
  } else if (game.type === 'continuous') {
    reason = `Warm-up: continuous game, low variability (${game.category})`;
  } else {
    reason = `Warm-up: ${game.type} game (${game.category})`;
  }

  return [{ gameId: game.id, duration, phase: 'warmup', reason }];
}

/**
 * Core category picker shared by the focus and complementary phases.
 *
 * Strategy: level-filter the category pool (with widening) → look for a
 * complete progression chain → fall back to individual games sorted easiest
 * first. Each chosen game is given a `reason` explaining its selection.
 *
 * @param maxCount  Phase game cap (already budget-limited by the caller).
 * @param warnLabel Human-readable label used in warning messages.
 */
function pickFromCategory(
  games: Game[],
  category: string,
  level: string,
  maxCount: number,
  phase: SessionPhase,
  budget: number,
  warnLabel: string,
  warnings: string[],
  excludeIds: Set<string>,
  rng: () => number,
): SessionSlot[] {
  const categoryPool = games.filter(
    (g) => g.category === category && !excludeIds.has(g.id),
  );

  if (categoryPool.length === 0) {
    warnings.push(`${warnLabel}: no games found for category '${category}'.`);
    return [];
  }

  // Level filtering with widening. A phase needs ≥2 games to be meaningful,
  // but a balanced sub-pick only asks for 1, so clamp the threshold.
  const minCount = Math.min(2, maxCount);
  const { games: pool, fallback } = filterByLevel(categoryPool, level, minCount);
  if (fallback === 'all-levels') {
    warnings.push(
      `${warnLabel}: level '${level}' matched fewer than ${minCount} game(s) in '${category}'; included 'all-levels'.`,
    );
  } else if (fallback === 'any') {
    warnings.push(
      `${warnLabel}: level '${level}' matched fewer than ${minCount} game(s) in '${category}'; included all levels.`,
    );
  }

  const label = phaseLabel(phase);

  // --- Progression chain (coin flip: ~50% chance to use a chain) -------------
  // We don't always pick a progression chain because small pools would make
  // every regenerated session identical. When we do use one, it gives the
  // nice "simple → complex" narrative. When we don't, the shuffled pool
  // provides variety.
  const chains = findCompleteChains(pool);
  const useChain = chains.length > 0 && rng() < 0.5;
  if (useChain) {
    const best = pickBestChain(chains, rng)!;
    const chosen = best.steps.slice(0, maxCount); // simple → complex
    const total = best.steps.length;
    const perGame = durationForPhase(chosen.length, budget, maxCount);
    return chosen.map((g) => {
      const step = g.progression!.step;
      return {
        gameId: g.id,
        duration: perGame,
        phase,
        reason: `${label} step ${step}/${total}: ${best.chainLabel} progression`,
      } as SessionSlot;
    });
  }

  // --- Individual games from shuffled pool (easiest-first after shuffle) ------
  if (chains.length === 0) {
    warnings.push(
      `${warnLabel}: no progression chains found for '${category}', picked individual games.`,
    );
  }
  const shuffled = seededShuffle(pool, rng);
  const sorted = shuffled.sort(byLevelOnly);
  const chosen = sorted.slice(0, maxCount);
  if (chosen.length === 0) {
    warnings.push(`${warnLabel}: no games could be selected for '${category}'.`);
    return [];
  }

  const perGame = durationForPhase(chosen.length, budget, maxCount);
  return chosen.map((g) => ({
    gameId: g.id,
    duration: perGame,
    phase,
    reason: `${label}: ${g.category} game (${g.level})${skillNote(g)}`,
  }));
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Generate a CLA-structured training session from the games catalogue.
 *
 * Every session contains all three core modalities — standing, guard-passing,
 * and pinning — per the CLA coaching mandate. The focus category determines
 * which block gets the largest time-share (40%); the other two get 30% each.
 * 'balanced' splits the body budget evenly (⅓ each). Warm-up gets 10%.
 *
 * Per-game length prefers 6 minutes; when a block reaches its game cap the
 * games are stretched to fill that block's budget.
 */
export function generateSession(
  games: Game[],
  options: GenerateOptions,
): GeneratedSession {
  const warnings: string[] = [];

  if (!Array.isArray(games) || games.length === 0) {
    warnings.push('No games available; cannot generate a session.');
    return { games: [], totalDuration: 0, warnings };
  }

  const { duration, level, focus, seed = Date.now() } = options;
  const rng = makeRng(seed);

  if (!Number.isFinite(duration) || duration <= 0) {
    warnings.push('Invalid session duration; cannot generate a session.');
    return { games: [], totalDuration: 0, warnings };
  }

  // --- Time budgets --------------------------------------------------------
  const warmupBudget = duration * WARMUP_FRACTION;
  const bodyBudget = duration * (1 - WARMUP_FRACTION); // 90% of total

  // Determine which core block gets the focus share
  const focusBlock = focus === 'balanced' ? null : (FOCUS_TO_CORE_BLOCK[focus] ?? null);

  // Per-block budget: focus block gets FOCUS_SHARE, others get OTHER_SHARE,
  // balanced splits evenly.
  const blockBudgets: Record<string, number> = {};
  for (const block of CORE_BLOCKS) {
    if (focusBlock === null) {
      blockBudgets[block] = bodyBudget * BALANCED_SHARE;
    } else if (block === focusBlock) {
      blockBudgets[block] = bodyBudget * FOCUS_SHARE;
    } else {
      blockBudgets[block] = bodyBudget * OTHER_SHARE;
    }
  }

  const picks: SessionSlot[] = [];
  const usedIds = new Set<string>();

  // --- Warm-up -------------------------------------------------------------
  for (const slot of pickWarmup(games, level, warmupBudget, warnings, usedIds, rng)) {
    picks.push(slot);
    usedIds.add(slot.gameId);
  }

  // --- Three core blocks: standing → guard-passing → pinning ---------------
  // The actual focus category may map to a core block but isn't one of the
  // three (e.g. 'leg-locks' → 'standing'). For those, we still pick from the
  // original focus category within the focus block's budget, PLUS we ensure
  // the mapped core block also contributes its own games. Simplest approach:
  // always pick from the three core block categories, and if the focus is a
  // non-core category, inject 1-2 games from that category into its mapped
  // block (replacing one core-block game).

  for (const block of CORE_BLOCKS) {
    const budget = blockBudgets[block];
    const isFocusBlock = block === focusBlock;
    const maxGames = maxGamesForBudget(budget, BLOCK_GAME_CAP);

    // If this is the focus block and the focus is a non-core category,
    // pick from the focus category instead (still gets the bigger budget).
    const pickCategory = (isFocusBlock && focus !== 'balanced' && FOCUS_TO_CORE_BLOCK[focus] === block && focus !== block)
      ? focus
      : block;

    const warnLabel = `${phaseLabel(block as SessionPhase)}${isFocusBlock && pickCategory !== block ? ` (focus: ${focus})` : ''}`;

    for (const slot of pickFromCategory(
      games,
      pickCategory,
      level,
      maxGames,
      block as SessionPhase,
      budget,
      warnLabel,
      warnings,
      usedIds,
      rng,
    )) {
      picks.push(slot);
      usedIds.add(slot.gameId);
    }
  }

  const totalDuration = picks.reduce((sum, s) => sum + s.duration, 0);

  if (picks.length === 0) {
    warnings.push('Session generated no games; check inputs.');
  }

  return { games: picks, totalDuration, warnings };
}
