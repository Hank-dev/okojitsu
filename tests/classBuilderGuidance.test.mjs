import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync('src/App.tsx', 'utf8')
const coaching = JSON.parse(readFileSync('src/data/coaching-full.json', 'utf8'))

test('links prominent class-builder guidance to the existing Session Plan article', () => {
  assert.ok(coaching.some(article => article.id === 'session-structure' && article.title === 'Session Plan'))
  assert.match(app, /Set up a class around a clear problem\./)
  assert.match(app, /href="#coaching\/session-structure"/)
  assert.match(app, /setCoachingArticleId\('session-structure'\)/)
})

test('keeps automatic planning tools available in a closed-by-default disclosure', () => {
  assert.match(app, /const \[automaticToolsOpen, setAutomaticToolsOpen\] = useState\(false\)/)
  assert.match(app, /aria-expanded=\{automaticToolsOpen\}/)
  assert.match(app, /\{automaticToolsOpen && <div className="generator-panel"/)
  assert.match(app, /\{automaticToolsOpen && suggestions\.length > 0/)
  assert.match(app, /generateSession\(games,/)
  assert.match(app, /getSuggestions\(slots\.map/)
})
