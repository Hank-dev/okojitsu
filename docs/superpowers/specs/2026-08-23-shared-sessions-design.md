# Shared ØkoJitsu sessions

**Date:** 2026-08-23  
**Status:** Approved for planning

## Goal

Make every saved class available in every browser that opens ØkoJitsu. The session library is public to read, while the existing administrator sign-in remains the sole authority for creating, importing, editing, and deleting sessions.

## Product behavior

- **Everyone can view shared sessions.** The My Sessions page reads one shared collection, regardless of browser or device.
- **Only administrators can change sessions.** Existing admin cookies continue to authorize class-builder saves, imports, edits, and deletion.
- **Previously local sessions are recoverable.** On an administrator's original browser, the app recognizes valid local user-created sessions and offers a one-time “Publish local sessions” action. It imports only confirmed session records; legacy deleted-seed strings are ignored.
- **The existing starter classes become shared too.** They are inserted once into the shared collection when the database is initialized. Deleting one is therefore reflected for every visitor, not merely the device that performed the deletion.
- **Sync state is visible.** The page shows loading, a successful shared-session count, and a retryable connection error instead of quietly reverting to a device-only list.

## Architecture

Use the site's managed relational storage for the shared collection. It is the source of truth; browser storage is retained only long enough to discover and import legacy local sessions.

### Data model

`sessions`

| Column | Purpose |
| --- | --- |
| `id` (text primary key) | Existing stable session identifier. |
| `payload_json` (text) | Complete validated `SessionPlan` payload, preserving game order, timings, notes, and focus. |
| `is_seed` (integer) | Identifies the starter classes that ship with the site. |
| `created_at` (text) | Server timestamp for ordering and auditability. |
| `updated_at` (text) | Server timestamp for last-write-wins updates. |

An `updated_at` index supports the normal “newest first” listing. Starter records are inserted with conflict-safe writes, so ordinary deploys cannot duplicate them or resurrect a deleted starter session.

`session_bootstrap`

| Column | Purpose |
| --- | --- |
| `key` (text primary key) | Records one-time database initialization steps. |
| `completed_at` (text) | Server timestamp for the completed step. |

The initial-seed marker is written with the starter rows. Once present, the worker never attempts to insert starter sessions again, so an administrator's global deletion remains deleted.

### API

- `GET /api/sessions` — public; returns the complete shared list ordered by most recently updated.
- `POST /api/sessions` — administrator only; validates and creates one session.
- `PUT /api/sessions/:id` — administrator only; validates and replaces one existing session.
- `DELETE /api/sessions/:id` — administrator only; removes one session globally.
- `POST /api/sessions/import` — administrator only; validates a list of legacy local sessions and inserts any missing ids without overwriting shared work.

All mutating endpoints check the current admin cookie in the worker. Inputs are limited to the existing `SessionPlan` structure: nonempty id/title, finite nonnegative durations, and an array of game references. Responses contain only valid session records and use ordinary error status codes for the client to display safely.

### Frontend data flow

1. App boot requests the shared session collection.
2. Until it returns, My Sessions shows a loading state rather than implying the local browser is authoritative.
3. On success, the shared response supplies `sessions` to Class Builder and My Sessions. Saving a class calls the create endpoint, then updates the shared list from the server response.
4. If a legacy local collection contains valid non-seed sessions, an administrator sees a one-time import action with the count. Successful import removes the old local source data only after the server confirms every accepted record.
5. If the shared request fails, existing displayed sessions remain intact, a concise retry control is shown, and no deletion or overwrite is attempted.

## Data migration and recovery

The migration parser treats browser storage as untrusted:

- Accept only object-shaped records that satisfy the session validation rules.
- Reject the historical string values used to track deleted starter sessions; they are not sessions and must never be rendered or uploaded.
- Exclude built-in starter ids from the import because those records are initialized in the shared store.
- Deduplicate local candidates by id before import.
- Use create-if-missing behavior, never a blind overwrite, so a stale browser cannot replace a class already saved in the shared library.

The browser that originally holds local sessions must be opened once and signed in to publish them. New classes created after this change save directly to the shared collection.

## Error handling and security

- Public reads reveal only class plans, matching the user's decision that all visitors may see them.
- Write and import routes require the existing signed, HttpOnly administrator cookie.
- The client never receives the admin password or database credentials.
- Connection, validation, and authorization failures produce an actionable message and preserve the last non-destructive screen state.

## Verification

- Unit-test session validation, legacy migration, seed handling, and duplicate-safe import behavior.
- Unit-test worker route authorization: public reads work; anonymous writes fail; signed administrator writes succeed.
- Exercise the browser flow: save a session in one browser, load My Sessions from another, and verify the same session appears.
- Exercise the migration flow with valid local sessions plus legacy deleted-seed strings; valid classes import once and malformed entries are ignored.
- Build and deploy a database migration, then verify a public read and an administrator-only write against the deployed site.

## Out of scope

- Individual accounts, per-user private sessions, collaboration roles, comments, and version history.
- Syncing custom games between browsers. This change covers saved classes only.
