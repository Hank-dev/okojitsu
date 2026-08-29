# Persistent Admin Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a device-persistent administrator sign-in that unlocks game and session mutations without restricting browsing.

**Architecture:** A small pure authentication module owns the password comparison and browser-storage state. `App` owns the signed-in state and passes an `isAdmin` capability only to components that expose mutating controls. The header owns the sign-in dialog and sign-out action.

**Tech Stack:** React 19, TypeScript, Vite, Node built-in test runner.

## Global Constraints

- The signed-in state persists in the current browser profile with `localStorage` and has no expiry.
- Visitors can browse games and sessions but cannot reveal or invoke mutation controls.
- A failed password attempt displays an error without changing sign-in state.
- This static-app gate does not protect source files, the password value, or browser data from a technically capable visitor.
- Keep the existing Sites-compatible production output and private deployment flow.

---

### Task 1: Add testable admin-auth state helpers

**Files:**
- Create: `src/adminAuth.ts`
- Create: `tests/adminAuth.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `ADMIN_SESSION_KEY`, `verifyAdminPassword(password: string): boolean`, `loadAdminSession(storage: Storage): boolean`, `saveAdminSession(storage: Storage, isAdmin: boolean): void`.
- Consumes: browser-compatible `Storage`.

- [ ] **Step 1: Write the failing test**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAdminSession, saveAdminSession, verifyAdminPassword } from '../src/adminAuth.ts'

const storage = new Map<string, string>()
const fakeStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
} as unknown as Storage

test('accepts the configured admin password only', () => {
  assert.equal(verifyAdminPassword('ØkoAutisme4tw'), true)
  assert.equal(verifyAdminPassword('wrong'), false)
})

test('persists and clears the admin session', () => {
  saveAdminSession(fakeStorage, true)
  assert.equal(loadAdminSession(fakeStorage), true)
  saveAdminSession(fakeStorage, false)
  assert.equal(loadAdminSession(fakeStorage), false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:admin`

Expected: FAIL because the test command and `adminAuth` module do not yet exist.

- [ ] **Step 3: Write the minimal implementation**

```ts
export const ADMIN_SESSION_KEY = 'okojitsu_admin_session'
const ADMIN_PASSWORD = 'ØkoAutisme4tw'

export function verifyAdminPassword(password: string) {
  return password === ADMIN_PASSWORD
}

export function loadAdminSession(storage: Storage) {
  return storage.getItem(ADMIN_SESSION_KEY) === 'true'
}

export function saveAdminSession(storage: Storage, isAdmin: boolean) {
  if (isAdmin) storage.setItem(ADMIN_SESSION_KEY, 'true')
  else storage.removeItem(ADMIN_SESSION_KEY)
}
```

Add `"test:admin": "node --experimental-strip-types --test tests/adminAuth.test.ts"` to `package.json`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:admin`

Expected: PASS with both admin-auth tests passing.

- [ ] **Step 5: Commit**

```bash
git add package.json src/adminAuth.ts tests/adminAuth.test.ts
git commit -m "feat: add persistent admin auth helpers"
```

### Task 2: Add header sign-in and sign-out controls

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `loadAdminSession`, `saveAdminSession`, and `verifyAdminPassword` from `src/adminAuth.ts`.
- Produces: `isAdmin: boolean` state and a keyboard-accessible password dialog.

- [ ] **Step 1: Write the failing test**

```ts
test('a wrong password does not persist administrator access', () => {
  assert.equal(verifyAdminPassword('not-the-password'), false)
  saveAdminSession(fakeStorage, verifyAdminPassword('not-the-password'))
  assert.equal(loadAdminSession(fakeStorage), false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:admin`

Expected: FAIL because the new test is not yet present in the test suite.

- [ ] **Step 3: Write the minimal implementation**

In `App`, initialize `isAdmin` with `loadAdminSession(localStorage)`, add dialog-local password and error state, and render:

```tsx
{isAdmin ? (
  <button className="admin-control" onClick={signOut}>Admin · Sign out</button>
) : (
  <button className="admin-control" onClick={() => setLoginOpen(true)}>Admin sign in</button>
)}
```

The dialog uses a labelled password input, submits with Enter, shows `Incorrect password` after a failed verification, and closes after successful verification. CSS positions the control on the header’s right side and preserves the existing mobile navigation.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:admin`

Expected: PASS with the wrong-password regression test and existing auth tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/index.css tests/adminAuth.test.ts
git commit -m "feat: add persistent admin sign-in control"
```

### Task 3: Gate game and session mutation controls

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `isAdmin` from `App`.
- Produces: read-only game library and sessions pages for visitors; mutation controls for admins.

- [ ] **Step 1: Write the failing test**

```ts
test('stored administrator access restores after a browser restart', () => {
  saveAdminSession(fakeStorage, true)
  assert.equal(loadAdminSession(fakeStorage), true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:admin`

Expected: FAIL because the new persistence regression test has not yet been added.

- [ ] **Step 3: Write the minimal implementation**

Pass `isAdmin` to `LibraryPage`, `BuilderPage`, and `SessionsPage`. When false, hide New Game, game Edit, all session-builder actions, Save Session, Copy & Edit, and Delete. Preserve all list, search, detail, and session-view behavior.

- [ ] **Step 4: Run tests and production build**

Run: `npm run test:admin && npm run build`

Expected: PASS for all admin-auth tests and a successful production build.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx tests/adminAuth.test.ts
git commit -m "feat: restrict game and session changes to admins"
```

### Task 4: Publish the verified version

**Files:**
- Modify: `.openai/hosting.json` only if Sites updates its project metadata.

**Interfaces:**
- Consumes: the validated Sites build and current source commit.
- Produces: a new private Sites deployment URL for the current version.

- [ ] **Step 1: Package the validated build**

Run the Sites package helper against the project directory and a temporary archive path. Confirm the archive contains `dist/server/index.js` and `dist/.openai/hosting.json`.

- [ ] **Step 2: Push the current source commit to the configured Sites source repository**

Use a fresh Sites source write credential as an HTTP authorization header for the current branch head.

- [ ] **Step 3: Save and privately deploy the version**

Save the archive against the pushed commit SHA, use private deployment, then poll the deployment status until it reaches a terminal status.

- [ ] **Step 4: Open the deployed URL and report it**

Open the successful deployed URL in Codex and return the link with a concise summary of the new administrator controls.
