export type Skill = 'connection' | 'distance' | 'destabilize' | 'segment' | 'isolate' | 'immobilize'

export interface Progression {
  chain: string
  chainLabel: string
  step: number
  totalSteps: number
  prevId: string | null
  nextId: string | null
}

export interface PlayerRole {
  role: string;
  objective: string;
  winCondition: string;
  constraints: string[];
}

export interface Game {
  id: string;
  title: string;
  category: string;
  source: string;
  level: string;
  type: string;
  startingPosition: string;
  players: PlayerRole[];
  constraints: string[];
  designRationale?: string;
  tags: string[];
  skills: Skill[];
  progression: Progression | null;
  sourceUrl?: string | null;
}

export interface SessionPlan {
  id: string;
  title: string;
  date: string;
  duration: number;
  level: string;
  focus: string;
  games: SessionGame[];
  notes: string;
}

export interface SessionGame {
  gameId: string;
  duration: number;
  notes?: string;
}

export const CATEGORY_META: Record<string, { label: string; emoji: string; color: string; description: string; image?: string }> = {
  'standing': { label: 'Wraslin\'', emoji: '🌈', color: '#f59e0b', description: 'Standing grappling, hand fighting, takedowns', image: '/img/wraslin.jpg' },
  'guard-passing': { label: 'Passing', emoji: '🦄', color: '#3b82f6', description: 'Guard passing: feet → knees → hips', image: '/img/guard-passing.jpg' },
  'guard': { label: 'Guard', emoji: '💂', color: '#10b981', description: 'Open guard, supine guard, guard retention', image: '/img/the-guard.jpg' },
  'seated-guard': { label: 'Seated Guard', emoji: '🍑', color: '#8b5cf6', description: 'Seated guard, wrestling up, buttscooting' },
  'half-guard': { label: 'Half Guard', emoji: '🧓', color: '#ec4899', description: 'Knee shield, half guard entanglements' },
  'k-guard-dlr': { label: 'K-Guard & DLR', emoji: '🐊', color: '#06b6d4', description: 'K-guard, De La Riva, guard entries' },
  'pinning': { label: 'Pinning', emoji: '🐖', color: '#ef4444', description: 'Side control, mount, holding down', image: '/img/pinning-1.jpg' },
  'back-control': { label: 'Back Control', emoji: '🐍', color: '#f97316', description: 'Back takes, arm traps, rear strangles' },
  'armbar': { label: 'Armbar', emoji: '💪', color: '#a855f7', description: 'Armbar progressions, arm isolation' },
  'triangle': { label: 'Triangle', emoji: '⛰️', color: '#14b8a6', description: 'Triangle choke progressions' },
  'kimura': { label: 'Kimura', emoji: '🥇', color: '#eab308', description: 'Kimura grip, figure-four attacks' },
  'front-headlock': { label: 'Front Headlock', emoji: '🤕', color: '#dc2626', description: 'Front headlock strangles, guillotines' },
  'leg-locks': { label: 'Leg Locks', emoji: '🦶', color: '#84cc16', description: 'Heel hooks, ankle locks, entanglements', image: '/img/leg-locks.jpg' },
  'submissions': { label: 'Submissions', emoji: '🤑', color: '#f43f5e', description: 'General submission games' },
  'stand-up': { label: 'Stand Up', emoji: '🧍', color: '#6366f1', description: 'Getting to your feet, escapes', image: '/img/just-stand-up.jpg' },
  'whole-space': { label: 'Whole Space', emoji: '🦍', color: '#9333ea', description: 'Control through the entire space — back, seated, standing' },
};

export const LEVEL_META: Record<string, { label: string; color: string }> = {
  'beginner': { label: 'Beginner', color: '#22c55e' },
  'all-levels': { label: 'All Levels', color: '#3b82f6' },
  'intermediate': { label: 'Intermediate', color: '#f59e0b' },
  'advanced': { label: 'Advanced', color: '#ef4444' },
};

export const TYPE_META: Record<string, { label: string; color: string; description: string }> = {
  'continuous': { label: 'Continuous', color: '#3b82f6', description: 'One player maintains a task as long as possible' },
  'terminal': { label: 'Terminal', color: '#ef4444', description: 'Reach a specific outcome to win' },
  'mixed': { label: 'Mixed', color: '#a855f7', description: 'Both players have win conditions' },
};

export const SKILL_META: Record<Skill, { label: string; color: string; icon: string; description: string }> = {
  'connection': { label: 'Connection', color: '#3b82f6', icon: '🤝', description: 'Make and maintain physical contact' },
  'distance': { label: 'Distance', color: '#06b6d4', icon: '📏', description: 'Control space: close, create, or deny gaps' },
  'destabilize': { label: 'Destabilize', color: '#f59e0b', icon: '⚡', description: 'Break base, structure, and balance' },
  'segment': { label: 'Segment', color: '#8b5cf6', icon: '🧩', description: 'Navigate limbs toward center mass' },
  'isolate': { label: 'Isolate', color: '#ef4444', icon: '🎯', description: 'Separate a limb to make it vulnerable' },
  'immobilize': { label: 'Immobilize', color: '#10b981', icon: '🔒', description: 'Hold the body or part of it still' },
};

export const SKILL_ORDER: Skill[] = ['connection', 'distance', 'destabilize', 'segment', 'isolate', 'immobilize'];
