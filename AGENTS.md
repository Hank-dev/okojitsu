# AGENTS.md — ØkoJitsu

> Instructions for AI coding agents working in this repository.

## Project overview

ØkoJitsu is a single-page React app for ecological jiu-jitsu coaching. It provides a game library, session builder, theory reader, and coaching notes. All state is client-side (localStorage). No backend, no server, no API calls.

## Tech stack

- **React 19** + **TypeScript** (strict mode) + **Vite 6**
- Pure CSS in `src/index.css` — no Tailwind, no CSS-in-JS, no styled-components
- No test framework configured
- No external runtime dependencies beyond `react` and `react-dom`

## Build & run

```bash
npm install        # install deps
npm run dev        # dev server — http://localhost:3099
npm run build      # tsc -b && vite build → dist/
npm run preview    # preview production build
```

The build runs `tsc -b` first — any TypeScript error fails the build. Always verify with `npm run build` after changes.

## Architecture

### File map

| File | Responsibility |
|---|---|
| `src/App.tsx` (~1240 lines) | **All UI components and page logic.** Every page (Home, Theory, Library, Builder, Sessions, Coaching, Memes, Resources) and every component lives here. |
| `src/index.css` (~1690 lines) | **All styling.** Design tokens at `:root`, component styles, and responsive rules. No preprocessor. |
| `src/types.ts` | TypeScript interfaces (`Game`, `SessionPlan`, `PlayerRole`, `Skill`, `Progression`) and metadata constants (`CATEGORY_META`, `LEVEL_META`, `TYPE_META`, `SKILL_META`, `SKILL_ORDER`). |
| `src/sessionGenerator.ts` | **Pure logic** — deterministic session generator. No React imports. Exports `generateSession(games, options)`. |
| `src/suggestionEngine.ts` | **Pure logic** — complementary game suggestions. No React imports. Exports `getSuggestions(slotGameIds, games)`. |
| `src/data/games.json` | 161 game definitions. The core dataset. |
| `src/data/theory-full.json` | Theory articles (parsed from source document). |
| `src/data/coaching-full.json` | Coaching articles. |
| `src/data/sessions-seed.ts` | Pre-built session templates loaded on first visit. |

### Design tokens

CSS custom properties at `:root` in `src/index.css`:

```css
--bg-primary: #000000;     /* pure black canvas */
--accent: #00ff88;          /* dojo green — primary actions and active states only */
--font-sans: 'DM Sans';
--font-display: 'DM Serif Display';
--font-mono: 'JetBrains Mono';
```

### UI conventions

- **No emoji on game titles, button labels, or home buttons.** Emoji is allowed only on category tabs and meme content.
- **No hardcoded counts** anywhere (e.g., "161 games") — always compute from data.
- **Three-dot (⋮) menu** on session cards for secondary actions (Copy & Edit, Delete).
- **Split-pane library**: left column = compact game list, right column = detail panel. On mobile these are separate screens (tap game → detail replaces list, Close → back to list).
- **Bottom-sticky tabs** on mobile for Theory, Coaching, and Sessions pages.

### Mobile responsive

Two breakpoints: `max-width: 768px` (primary) and `max-width: 600px` (compact). Key mobile behaviours:

- Hamburger menu pinned to far right (`margin-left: auto`)
- Library: list and detail are separate views, not stacked
- Theory/Coaching/Sessions: horizontal tab bar is sticky at the bottom
- No horizontal overflow permitted (`overflow-x: clip` on html/body)

## Editing rules

### DO

- Use the `patch` tool for targeted edits — never rewrite the whole file for a small change.
- Always run `npm run build` after changes to verify TypeScript compiles.
- Check responsive behaviour at `390 × 844` (iPhone 14) and `1440 × 1000` (desktop).
- Add new CSS classes to `src/index.css`, not inline styles (except for genuinely one-off dynamic values).
- Keep `sessionGenerator.ts` and `suggestionEngine.ts` pure — no React imports, no side effects.

### DON'T

- **Never use `replace_all: true` on JSX patches** — the fuzzy matcher can eat closing tags. Always include enough surrounding context for a unique match.
- **Don't add npm dependencies** without explicit approval. The app intentionally has zero runtime deps beyond React.
- **Don't add emoji to button text or game titles.**
- **Don't use `position: absolute` inside `overflow: auto` containers** — it clips. Use `position: fixed` with mouse coordinates for popups.
- **Don't call React hooks (`useState`, `useMemo`, `useEffect`) at module scope** — only inside function components.
- **Don't put `transform`, `filter`, or `perspective` on a parent of a `position: fixed` element** — it creates a new containing block.

## Data model quick reference

```typescript
interface Game {
  id: string; title: string; category: string; source: string;
  level: string; type: string; startingPosition: string;
  players: PlayerRole[]; constraints: string[];
  designRationale?: string; tags: string[];
  skills: Skill[]; progression: Progression | null;
  sourceUrl?: string | null;
}

type Skill = 'connection' | 'distance' | 'destabilize' | 'segment' | 'isolate' | 'immobilize';
```

When adding fields to `Game` or any interface, update **every** construction site (`as Game`, `: Game =`, GameForm, seed data) or the build fails with TS2739.

## Verifying changes

1. `npm run build` — must pass with zero TypeScript errors
2. Check at 1440×1000 (desktop) and 390×844 (mobile)
3. Navigate to the affected page and at least one other page to confirm no regressions
4. If touching the library, verify both list→detail flow and category/skill filters
5. If touching responsive CSS, verify `overflow-x` is not triggered
