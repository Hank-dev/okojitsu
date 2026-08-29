import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

test('places the static entry page in the Sites client directory', () => {
  assert.equal(existsSync('dist/client/index.html'), true)
  assert.equal(existsSync('dist/server/index.js'), true)
  assert.equal(existsSync('dist/.openai/hosting.json'), true)
  assert.equal(existsSync('dist/.openai/drizzle/0000_strange_overlord.sql'), true)
  assert.equal(existsSync('dist/.openai/drizzle/0001_sharp_owl.sql'), true)
  assert.equal(existsSync('dist/.openai/drizzle/0002_silly_kid_colt.sql'), true)
  assert.equal(existsSync('dist/.openai/drizzle/0003_tough_fenris.sql'), true)
  assert.equal(existsSync('dist/index.html'), false)
})

test('ships the shared-session database binding and migration', () => {
  const hosting = JSON.parse(readFileSync('dist/.openai/hosting.json', 'utf8'))
  assert.equal(hosting.d1, 'DB')
})

test('ships the finished ØkoJitsu social preview and metadata', () => {
  assert.equal(existsSync('dist/client/og.png'), true)
  const html = readFileSync('dist/client/index.html', 'utf8')
  assert.match(html, /property="og:title" content="ØkoJitsu 4Lyfe"/)
  assert.match(html, /property="og:image" content="https:\/\/okojitsu\.johanneshankoe\.chatgpt\.site\/og\.png"/)
  assert.match(html, /name="twitter:card" content="summary_large_image"/)
})
