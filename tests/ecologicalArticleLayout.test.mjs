import assert from 'node:assert/strict'
import test from 'node:test'

import theory from '../src/data/theory-full.json' with { type: 'json' }
import coaching from '../src/data/coaching-full.json' with { type: 'json' }

test('keeps the ecological article title single and promotes its first section heading', () => {
  const article = theory.find((entry) => entry.id === 'ecological-approach')

  assert.ok(article)
  assert.equal(article.title, 'The Ecological Approach & CLA')
  assert.deepEqual(article.blocks[0], {
    type: 'heading',
    level: '2',
    text: 'The Ecological Approach – Core Principles',
  })
  assert.doesNotMatch(article.blocks[0].text, /🌳/)
  assert.doesNotMatch(article.blocks[0].text, /Based on Rob Gray/i)
})

test('removes the About this document article from the theory manual', () => {
  assert.equal(theory.find((entry) => entry.id === 'further-reading'), undefined)
  assert.equal(theory.find((entry) => entry.title === 'About this document'), undefined)
})

test('does not repeat Session Plan as an inner article heading', () => {
  const article = coaching.find((entry) => entry.id === 'session-structure')

  assert.ok(article)
  assert.equal(article.blocks.some((block) => block.text === '🐇Session Plan'), false)
})
