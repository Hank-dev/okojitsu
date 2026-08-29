import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('uses the established live draft save and refresh timing with terminal handling', async () => {
  const hook = await readFile(new URL('../src/useLiveSessionDraft.ts', import.meta.url), 'utf8')
  assert.match(hook, /saveDelayMs: 400/)
  assert.match(hook, /pollIntervalMs: 1000/)
  assert.match(hook, /errorStatus\(.*\) === 404/)
  assert.match(hook, /startOperation\(publishPromiseRef/)
  assert.match(hook, /startOperation\(closePromiseRef/)
})
