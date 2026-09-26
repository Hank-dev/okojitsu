# ØkoJitsu 4Lyfe

Ecological jiu-jitsu coaching app — browse a library of [CLA (Constraints-Led Approach)](https://en.wikipedia.org/wiki/Constraints-led_approach) games, build training sessions, and study the theory behind ecological dynamics on the mats.

> *"Exposure and opportunity. You want to expose yourself to the problem. And whatever game you create needs to give you an opportunity to solve it."*
> — Greg Souders

## Features

- **Game Library** — 161 CLA games across 16 categories (standing, guard passing, pinning, submissions, leg locks, etc.) with full player roles, objectives, win conditions, and constraints
- **Class Builder** — manually compose sessions game-by-game, or use the built-in **Smart Session Generator** that assembles a progression-balanced class automatically
- **My Sessions** — save, duplicate, and edit training plans; sessions are stored in localStorage
- **Theory** — long-form articles covering ecological dynamics, CLA principles, and the invariant skill framework (connection → distance → destabilize → segment → isolate → immobilize)
- **Coaching** — coaching methodology notes and practice design guidance
- **Resources** — curated links to Greg Souders / Standard Jiu-Jitsu content, CLA literature, and podcasts
- **Memes** — because training should be fun

## Tech Stack

- **React 19** + **TypeScript** + **Vite 6**
- Pure CSS (no framework) — Night Dojo dark theme
- `sessionGenerator.ts` — deterministic session generation algorithm
- `suggestionEngine.ts` — complementary-game suggestion engine (progression, balance, skill match, role flip)
- Data sourced from Greg Souders' Standard Jiu-Jitsu methodology and CLA literature

## Getting Started

### Coach accounts

Visitors can browse the public library and published sessions. Personal accounts use
an ØkoJitsu email and password, so no ChatGPT account is required. There is no open
registration: an admin creates a private, expiring setup link under **Coach access**
and sends it to the coach. Opening the link lets the invited coach choose a password
and activates the account. Admins can also issue a fresh setup link as a password
reset. Coaches create private drafts, publish sessions, copy other sessions, and
edit/delete their own sessions. Admins also manage the shared game library,
categories, all sessions and drafts, and user access.

To activate the first two admins: open **Existing admin setup**, enter the existing
admin password, then create an invitation for yourself with the Admin role. Open
the generated link and choose a personal password. Shared-password access is
permanently retired once two password-enabled admins are active. The last active
password-enabled admin cannot be disabled or demoted. No admin emails or passwords
are embedded in source.

Existing ownerless sessions and drafts remain admin managed. A copied session gets
the copying coach as its owner. Drafts remain visible only to their owner and admins.
Role changes and deactivation are checked from D1 on every API request. Published
session author names are public; account email addresses are only returned to the
account holder and admins. Passwords are stored as salted scrypt hashes. Session
and invitation tokens are random, stored only as hashes, expire automatically, and
are revoked when an account is disabled or its password changes.

Accounts created with the previous ChatGPT sign-in can use the temporary migration
section on **Your account** once to set an ØkoJitsu password and preserve ownership.
That compatibility path relies on Sites dispatch sanitizing
`oai-authenticated-user-*` headers; do not expose this Worker directly or trust
those headers from a public proxy. Database changes are additive Drizzle migrations.
Run `npm run test:accounts` for invitation, password, ownership, access revocation,
and permission regression tests. Game suggestions/approval and archiving are not
part of this initial account release.

### Local development

```bash
npm install
npm run dev      # dev server at http://localhost:3099
npm run build    # production build to dist/
npm run preview  # preview production build
```

## Project Structure

```
src/
├── App.tsx              # All UI components and page logic
├── index.css            # Global styles and responsive rules
├── types.ts             # TypeScript interfaces and metadata constants
├── sessionGenerator.ts  # Smart session generator (pure logic, no React)
├── suggestionEngine.ts  # Game suggestion engine (pure logic, no React)
├── main.tsx             # React entry point
└── data/
    ├── games.json       # 161 CLA game definitions
    ├── theory-full.json # Theory article content
    ├── coaching-full.json # Coaching article content
    ├── sessions-seed.ts # Pre-built session templates
    └── games-meta.json  # Game metadata
```

## Design System

- **Background:** `#000000` (pure black)
- **Accent:** `#00ff88` (dojo green) — used sparingly for primary actions and active states only
- **Fonts:** DM Sans (body), DM Serif Display (headings), JetBrains Mono (metadata/labels)
- **Mobile:** bottom-sticky navigation tabs for Theory, Coaching, and Sessions pages; split-pane library collapses to separate list/detail views

## Data Model

Each game follows the `Game` interface in `src/types.ts`:

- `players[]` with role, objective, win condition, and constraints
- `skills[]` mapped to the six CLA invariants
- `progression` chain linking related games in a sequence
- `category`, `level` (beginner), and `type` (continuous, terminal, mixed)

## Acknowledgements

Theory and games are derived from the teachings of **Greg Souders** ([Standard Jiu-Jitsu](https://standardjiujitsu.com)) and the broader CLA / ecological dynamics research community. See the Resources page in-app for full references.

## License

Private project.
