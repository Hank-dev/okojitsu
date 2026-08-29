# Live shared game drafts

## Goal

Let every signed-in admin see and edit game drafts while they are being created or updated. Drafts must remain invisible to public visitors until an admin publishes them as games.

The first version should feel live: changes appear in the other editors' forms within about a second and save automatically. It does not need individual names, cursors, presence indicators, or character-by-character text merging.

## Users and access

- The current single shared admin sign-in remains the only permission check.
- Every signed-in admin can list, open, edit, publish, or discard active drafts.
- Requests for drafts always require a valid admin session. Public visitors never receive draft data.
- Because the app has no individual admin accounts, the interface does not identify who made a change.

## Draft model

Each draft holds a working game record, its revision number, timestamps, and optional source-game ID.

- Creating a game starts a new draft from the form's default values and gives its game record a stable ID immediately; publishing keeps that ID.
- Editing a saved game opens one active draft for that game. Later editors join that same draft instead of creating competing copies.
- The game library shows a private **Live drafts** area for admins. It includes untitled drafts so another admin can join a game that is still being created.
- Publishing validates the complete draft, creates or replaces the shared game, then closes the draft.
- Discarding closes the draft without changing the saved game.

Drafts are stored in D1 in a `game_drafts` table. The table stores the draft ID, an optional source-game ID, JSON payload, revision, creation time, and update time. One active draft per saved game is enforced by a unique source-game constraint; new-game drafts have no source-game ID and can coexist.

## Collaboration and conflict handling

The app uses field-level patches rather than saving the entire form for every keystroke.

1. A form writes the field that changed after 400 milliseconds of typing inactivity.
2. The server applies that field patch, increments the draft revision, and returns the updated draft.
3. Open draft forms poll for changes every second and update fields that the local editor is not currently typing in.
4. Different fields merge independently. For example, changing the title and changing a player objective at the same time both survive.
5. When two admins change the same field at the same time, the latest received update wins. The active text field is not replaced while someone is typing, so the cursor stays stable; its next update determines the final value.

This is deliberately simpler than a CRDT or WebSocket collaboration engine. It provides practical shared editing on the existing site without a new real-time service. Character-by-character merging, named cursors, and presence can be added later with individual admin accounts and a dedicated collaboration layer.

## API surface

All endpoints below require an admin session.

- `GET /api/game-drafts` returns active draft summaries for the Live drafts area.
- `POST /api/game-drafts` creates a new draft or returns the active draft for a supplied source-game ID.
- `GET /api/game-drafts/:id` returns a full draft.
- `PATCH /api/game-drafts/:id` applies one or more allowed field patches and returns the revised draft.
- `POST /api/game-drafts/:id/publish` validates the final game, saves it through the shared-game store, and closes the draft.
- `DELETE /api/game-drafts/:id` discards a draft.

Patch paths are limited to fields exposed by the game form, including individual player fields. The server rejects malformed paths, values, and unknown drafts. Publishing uses the existing complete-game validation, so an unfinished draft can never become public by accident.

## Interface behavior

- The Create game button opens a live draft immediately.
- The Edit action opens the live draft for that game when one already exists; otherwise it creates one from the saved game.
- The game form labels itself **Live draft** and shows a small saving or saved indicator.
- Admins can open a draft from the Live drafts area and edit it at the same time as other admins.
- The form has **Publish game** and **Discard draft** actions. Closing the dialog leaves the draft active so editing can continue later.
- After publishing, the library, class builder, and sessions use the newly saved shared game through the existing game refresh path.

## Failure handling

- If a draft save fails, the current input remains in the form and the interface shows a retryable save error.
- Polling failures do not discard local typing; the next polling or save attempt retries normally.
- If another admin publishes or discards a draft, open forms show a clear notice and refresh the library instead of silently overwriting the published result.

## Verification

- Store tests cover draft creation, field-level updates, revision changes, joining an existing game draft, publishing, and discarding.
- Worker tests verify draft data is unavailable to public visitors and editable by admins only.
- Client tests verify draft API calls, autosave timing helpers, and incoming updates preserving the locally active field.
- The existing visual-contract test verifies the Live drafts entry point and shared-draft form states.
- The complete test suite and production build must pass. A generated D1 migration is inspected before deployment.
