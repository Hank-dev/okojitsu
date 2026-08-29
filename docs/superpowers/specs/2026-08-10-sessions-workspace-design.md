# Sessions Workspace Redesign

## Goal

Turn My Sessions from a long document with an oversized tab strip into a coachable class workspace. A coach should be able to find a session quickly, understand its progression at a glance, and reveal only the game detail needed on the mat.

## Scope

- Replace the session tabs with a searchable session browser.
- Present the selected session as an ordered class timeline.
- Collapse game detail behind accessible expand controls.
- Improve action visibility, touch targets, typography, and mobile layout.
- Preserve the existing session data, selection, copy-and-edit behavior, and deletion behavior.
- Add a local presentation mode for running one game at a time. It does not persist state or modify session data.
- Do not add printing, sharing, schema changes, dependencies, or new persistence.

## Layout

### Desktop

Use a two-column workspace:

- A 300–320px session rail contains the page title, search field, result count, and vertically stacked session buttons.
- The main panel contains the selected session header and timeline.
- The rail stays visually quiet; the selected session is the clear focal point.

### Mobile

- Replace the horizontal tab strip with a full-width “Choose session” control.
- Opening it reveals the same search field and session list in a bounded panel.
- The selected session remains visible in the control so users never lose context.
- All interactive controls are at least 44px tall.

## Selected Session Header

The header shows:

- Session title as the primary heading.
- Level, total duration, and number of games as compact metadata.
- Focus as a short supporting line.
- “Run session” as the primary action.
- “Copy & edit” as a visible admin action.
- A labelled 44px overflow menu containing Delete.

The existing destructive action remains behind confirmation.

## Class Timeline

Each game appears once in an ordered timeline. A row includes:

- Sequence number.
- Start–end time range derived from game durations.
- Category marker and label.
- Game title.
- Optional coaching note.
- Expand/collapse affordance.

Only one game is expanded at a time. The first game starts expanded when a session is opened.

Expanded detail shows:

- Starting position.
- Each player’s role, objective, goal type, win condition, and constraints.
- Two player panels side by side on desktop and stacked on mobile.

Session notes appear once after the timeline.

## Run Session Mode

Run session is a local presentation layer:

- Shows one game at a time with its duration, starting position, both player tasks, win conditions, and constraints.
- Provides Previous, Next, and Exit controls.
- Shows progress such as “Game 2 of 6” and elapsed/remaining class time.
- Does not start a real timer or save progress.
- Supports Escape to exit and visible keyboard focus.

## Search and Selection

- Search matches session title, level, focus, notes, and game titles.
- Clearing search restores all sessions.
- If the active session is filtered out, it remains selected in the main panel until the user chooses another result.
- An empty search state explains that no sessions match and provides a Clear search action.

## Accessibility

- Session choices use buttons with an explicit selected state.
- Game expanders expose `aria-expanded` and reference their detail region.
- The overflow menu has an accessible label.
- Run mode is a modal dialog with focus management, Escape close, and trigger-focus restoration.
- Body copy is at least 15px on mobile; metadata may remain 12px.
- Color is not the only indication of selection or player identity.

## Data and Architecture

- Keep `SessionPlan` and stored session data unchanged.
- Add pure helpers for session filtering and timeline ranges in `src/sessions.ts`.
- Keep orchestration inside `SessionsPage`; extract small presentational components only when it reduces duplication.
- Reuse the existing category metadata and player goal inference.

## Testing

Write tests before production code for:

- Search across title, level, focus, notes, and game titles.
- Timeline start/end calculations from game durations.
- Empty and zero-duration timeline handling.
- Active-session filtering behavior.

Run the existing library, admin, build, and Sites packaging checks after the new tests pass.

## Acceptance Criteria

- Thirteen sessions no longer create a wrapped or horizontally scrolling tab wall.
- A session can be found by typing part of its title, focus, level, notes, or game title.
- Every game appears once in the main timeline.
- Game details are collapsed by default except the first game.
- The mobile page has no horizontal overflow and all primary controls meet the 44px target.
- The selected session, copy/edit, and delete workflows still work.
- Run mode presents one game at a time and exits without modifying data.
- The finished experience matches ØkoJitsu’s black, acid-green, serif/sans/mono visual system.
