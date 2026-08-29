# Article Emphasis Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop bold-only article sentences from being mislabeled as “Coach cue” or “Principle” while preserving their authored bold formatting.

**Architecture:** Keep the existing Field Manual block model and renderer. Remove only the typography-driven fallback in `presentBlock`; explicit block variants and structured constraint/win-condition classification remain unchanged.

**Tech Stack:** TypeScript, Node `node:test`, React 19, Vite 6.

## Global Constraints

- Do not rewrite article JSON or remove Markdown bold markers.
- Do not change session coach notes, the timer, navigation, or the app-wide palette.
- Explicit `coach-cue`, `principle`, `constraint`, `win-condition`, and authored `callout` variants remain supported.
- Add no dependencies.

---

## Task 1: Remove typography-driven article semantics with regression coverage

**Files:**

- Modify: `tests/fieldManual.test.ts`
- Modify: `src/fieldManual.ts`

**Interfaces:**

- Consumes: `presentBlock(block: ManualBlock, mode: ManualMode): PresentedBlock`
- Produces: bold-only paragraphs return `{ kind: 'paragraph', block }` in both `theory` and `coaching` modes; explicit semantic variants continue returning their declared kinds.

- [ ] **Step 1: Replace the old inference test with failing neutral-semantics coverage.**

```ts
test('keeps bold-only article sentences as ordinary paragraphs', () => {
  const block = { type: 'paragraph' as const, text: '**Put them in the problem.**' }
  assert.equal(presentBlock(block, 'coaching').kind, 'paragraph')
  assert.equal(presentBlock(block, 'theory').kind, 'paragraph')
  assert.equal(block.text, '**Put them in the problem.**')
})

test('preserves explicit article emphasis variants', () => {
  assert.equal(presentBlock({ type: 'paragraph', variant: 'coach-cue', text: 'Watch the hips.' }, 'coaching').kind, 'coach-cue')
  assert.equal(presentBlock({ type: 'paragraph', variant: 'principle', text: 'Options shrink under control.' }, 'theory').kind, 'principle')
})
```

- [ ] **Step 2: Run the focused test to record RED.**

Run: `npm run test:field-manual`

Expected: the bold-only test fails because the parser still returns `coach-cue` and `principle`; explicit-variant assertions pass.

- [ ] **Step 3: Remove only the bold-only fallback.**

Delete `boldOnlyParagraph` from `src/fieldManual.ts` and remove:

```ts
if (boldOnlyParagraph.test(text)) return { kind: mode === 'coaching' ? 'coach-cue' : 'principle', block }
```

Leave the default paragraph return directly after explicit variant and coaching structured-classification handling. Do not change `parseInlineMd`; it preserves `**...**` as authored bold text when the paragraph renders.

- [ ] **Step 4: Run focused and visual regression suites.**

Run: `npm run test:field-manual && npm run test:visual-contract`

Expected: both suites pass with no changed explicit callout contracts.

- [ ] **Step 5: Build the deployable site.**

Run: `npm run build && npm run test:sites-build`

Expected: TypeScript/Vite build and Sites packaging tests pass; only the existing non-blocking chunk-size warning may remain.

- [ ] **Step 6: Commit the parser correction.**

```bash
git add src/fieldManual.ts tests/fieldManual.test.ts
git commit -m "fix: stop inventing article emphasis semantics"
```
