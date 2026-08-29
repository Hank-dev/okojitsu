import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('refreshes shared custom games while a browser is open and when it returns to the foreground', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

  assert.match(app, /const SHARED_GAME_REFRESH_INTERVAL_MS = 4_000/)
  assert.match(app, /window\.setInterval\(refreshWhenVisible, SHARED_GAME_REFRESH_INTERVAL_MS\)/)
  assert.match(app, /window\.addEventListener\('focus', refreshWhenVisible\)/)
  assert.match(app, /document\.addEventListener\('visibilitychange', refreshWhenVisible\)/)
  assert.match(app, /gameRefreshInFlightRef\.current/)
})
