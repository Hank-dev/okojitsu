# Live shared session drafts

**Date:** 2026-08-26  
**Status:** Approved for implementation

## Goal

Let signed-in administrators see, open, and co-edit unfinished session plans. A
session becomes publicly visible only when an administrator publishes it.

## Product behavior

- Starting a shared session creates an admin-only draft; opening Class Builder
  alone does not create an empty draft.
- Administrators see active drafts in **Live session drafts** on both Class
  Builder and My Sessions. Each entry has its title (or *Untitled session*) and
  an **Open draft** action.
- Opening a draft in more than one browser allows simultaneous editing. A
  saving/saved/error status explains synchronization state.
- The draft synchronizes title, level, focus, notes, ordered games, game
  duration, additions, removals, and reordering.
- Publishing validates the complete plan, saves it to the existing shared
  sessions collection, and removes the draft. Discarding removes it without
  changing published sessions.
- Copying a published session creates a new draft. It never overwrites the
  original published session.
- Visitors cannot list, read, edit, publish, or discard drafts. They continue
  to see only published sessions.

## Data and API

Create a `session_drafts` table with a draft id, serialized draft payload,
revision, timestamps, and draft mode. New drafts use a stable eventual session
id from their first creation. Copy drafts use create mode and a fresh eventual
session id.

Add administrator-only endpoints:

- `GET /api/session-drafts` lists active summaries.
- `POST /api/session-drafts` creates a draft.
- `GET /api/session-drafts/:id` reads a draft.
- `PATCH /api/session-drafts/:id` applies a revision-guarded update.
- `POST /api/session-drafts/:id/publish` validates and creates the finished
  shared session.
- `DELETE /api/session-drafts/:id` discards the draft.

The draft payload is a `SessionPlan` plus its revision. Scalar edits use
field-level updates after a short debounce. Game-list changes are operations
against the latest revision: add, remove, set duration, and move a game before
another game. The server retries an operation against the newest draft when a
revision races; an exact conflicting change resolves to the latest accepted
update.

## Client synchronization

A `useLiveSessionDraft` hook follows the existing live-game-draft lifecycle:

1. debounce local scalar edits for 400 ms;
2. poll the active draft and live-draft list every second;
3. do not replace a text field currently being typed locally;
4. surface a retryable error while retaining local work; and
5. close or refresh safely when another administrator publishes or discards.

Class Builder becomes a workbench: it begins with a **Start a shared session**
action and an active-draft chooser, then shows the existing builder controls
for the selected draft. My Sessions mirrors the concise draft list above its
published-session browser for administrators.

## Verification

- Unit-test draft validation and revisioned mutation helpers.
- Worker-test authorization, creation, listing, update, publish, and discard.
- Client-test request shapes, debouncing, polling, and active-field protection.
- Add visual contracts for visible draft entry points and accessible actions.
- Run the production build and complete test suite before deployment.
