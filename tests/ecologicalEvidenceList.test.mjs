import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import theory from '../src/data/theory-full.json' with { type: 'json' }

const article = theory.find((entry) => entry.id === 'ecological-approach')
const evidenceIndex = article.blocks.findIndex((block) => block.text === 'Evidence Supporting the Ecological Approach')
const evidence = article.blocks[evidenceIndex + 1]

test('stores ecological evidence as one ordered list instead of repeated bullet lists', () => {
  assert.equal(evidence.type, 'list')
  assert.equal(evidence.ordered, true)
  assert.equal(evidence.items.length, 7)
  assert.match(evidence.items[0], /^\*\*You don't need to learn fundamentals/)
  assert.doesNotMatch(evidence.items[0], /^\*\*\d+\./)
  assert.match(evidence.items[6], /Tactical behavior in team sports/)
})

test('renders ordered manual lists with their own presentation class', () => {
  const reader = readFileSync('src/FieldManualPage.tsx', 'utf8')
  const css = readFileSync('src/index.css', 'utf8')
  assert.match(reader, /manual-ordered-list/)
  assert.match(css, /\.manual-ordered-list\s*\{/)
})
