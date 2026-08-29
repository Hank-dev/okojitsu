# Fight Atlas Game Library Design

Date: 2026-08-09
Status: Approved

## Goal

Redesign the Game Library so ØkoJitsu's games feel engaging and worth exploring while preserving the fast search, category browsing, filtering, create/edit behavior, and complete game content already present.

The redesign must feel native to the rest of ØkoJitsu: dark surfaces, neon-green emphasis, sharp borders, condensed display typography, compact metadata, and no decorative visual language that competes with the training content.

## Approved Direction

The approved direction is **Fight Atlas**: a content-first library combining an editorial featured game with a responsive card grid. It replaces the narrow utility list as the primary browsing surface, but keeps the current library's efficient discovery tools.

The page should communicate that each game is a designed training problem between two players. Objectives, goal types, constraints, level, category, and skills should be visible before or immediately after opening a game.

## Page Structure

1. Existing site navigation
2. Library introduction with live game count
3. Prominent search field and filter trigger
4. Horizontally scrollable category tabs with live counts
5. Active filter chips with individual removal and clear-all
6. Featured game selected from the current filtered result set
7. Result count and sort control
8. Responsive game-card grid
9. Full game-detail overlay or mobile detail view

All counts must be derived from the current game collection. No count is hardcoded.

## Search and Browse

Search remains instant and case-insensitive. It must cover at least:

- Game title
- Category and starting position
- Player role
- Main objective
- Terminal win condition or continuous success condition
- Constraint
- Skill tags

Category tabs remain one-click filters. The active category is visually unmistakable and tabs remain usable through horizontal scrolling on narrow screens.

The existing level, game type, and skill filters remain available in a compact filter drawer or popover. Applied filters appear as removable chips directly below the search controls. Search and filters combine rather than replacing one another.

The result count updates from the filtered collection. Empty results show a helpful reset action and retain the create-game entry point.

## Featured Game

The first suitable game in the current result set becomes the featured game. It is not a separate data model or curated content requirement.

The featured treatment shows:

- Category and level
- Title and short rationale or starting-position summary
- Player 1 role, objective, and goal type
- Player 2 role, objective, and goal type
- A direct action to open full details

If no games match, the feature is omitted.

## Game Cards

Each card shows enough information to judge relevance without opening it:

- Category
- Title
- Short rationale or starting-position summary
- Both player roles and condensed objectives
- Level
- Skill tags
- Overall or per-player goal type, including mixed games

Cards use category-specific accent colors sparingly while retaining the site's black and neon-green foundation. Game titles and actions do not use emoji. Category controls may retain their existing category symbols.

Cards are keyboard focusable and the complete card acts as the detail trigger. Hover and focus states use border, color, and small movement rather than heavy animation.

## Game Detail Behavior

On desktop, selecting a game opens a focused detail overlay or large drawer above the library. Closing it restores the same search terms, filters, sort order, and scroll position.

On mobile, the detail occupies the viewport as a separate view with a clear return-to-results action. Returning restores the browsing state.

The detail preserves all current content:

- Starting position
- Both player roles
- Main objectives
- Goal type for each player
- Terminal win condition or continuous success condition
- Constraints
- Rationale
- Skills
- Progression
- Source
- Edit action where currently authorized

Mixed games are represented per player. A game is not forced into a single terminal/continuous label when the two players use different goal types.

## Responsive Behavior

- Desktop: featured game spans the content width; cards use a three-column grid where space allows.
- Tablet: two-column card grid; feature simplifies to its content panel.
- Mobile: single-column card list; category tabs scroll horizontally; filters open in a full-width surface; details use a dedicated view.
- No horizontal page overflow.
- Controls retain comfortable touch targets.

## Data and Architecture

No game schema or persistence migration is required. The redesign consumes the existing game model and the combined built-in/custom game collection.

The implementation should extract focused presentation components from the current library page where useful, while leaving create/edit form behavior and data persistence intact.

Likely component responsibilities:

- Library toolbar
- Category tabs
- Active filter chips
- Featured game
- Atlas game card
- Results header
- Game detail surface
- Empty results state

## Accessibility

- Search has a persistent accessible label.
- Category and filter state is exposed through native buttons and appropriate pressed/selected state.
- Cards and detail controls are keyboard operable.
- Detail opening moves focus into the detail surface; closing returns focus to the triggering card.
- Text and metadata maintain readable contrast.
- Motion respects reduced-motion preferences.

## Acceptance Criteria

- The library visually matches the approved Fight Atlas direction and the rest of ØkoJitsu.
- Existing search, category, level, type, and skill filtering still work together.
- Search includes objectives, conditions, constraints, roles, and skills.
- Each card previews both players' objectives and mixed goal types accurately.
- Full game details remain complete and editing remains available where it is today.
- Returning from a game restores the browsing state.
- Built-in and custom games appear in the same library.
- Counts are computed from live data.
- Desktop and mobile layouts have no horizontal overflow.
- The production build passes.

## Verification

- Run the existing build and type checks.
- Exercise search across title, objective, win/success condition, constraint, role, and skill fields.
- Exercise combined category, level, type, and skill filters.
- Verify terminal, continuous, and mixed games in both cards and detail.
- Verify empty results and clearing filters.
- Verify opening/closing detail preserves browsing state.
- Check representative desktop and mobile viewport behavior.
