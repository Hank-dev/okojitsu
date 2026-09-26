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

test('uses a clear heading hierarchy throughout the ecological approach article', () => {
  const article = theory.find((entry) => entry.id === 'ecological-approach')

  assert.ok(article)
  assert.deepEqual(
    article.blocks
      .filter((block) => block.type === 'heading')
      .map(({ level, text }) => ({ level, text })),
    [
      { level: '2', text: 'The Ecological Approach – Core Principles' },
      { level: '2', text: 'Two Approaches to Skill Acquisition: Key Differences' },
      { level: '2', text: 'The Constraints-Led Approach (CLA) – What It Is' },
      { level: '3', text: 'Four Key Goals of the CLA' },
      { level: '2', text: 'Practical Examples' },
      { level: '3', text: 'Baseball – Bat Speed (Lars Nootbaar / Drive Line)' },
      { level: '3', text: 'Baseball – Forearm Flyout (Connection Ball)' },
      { level: '3', text: 'Small-Sided Games (Soccer, Basketball, etc.)' },
      { level: '2', text: 'Evidence Supporting the Ecological Approach' },
      { level: '2', text: 'Key Implications for Practice Design' },
    ],
  )
})

test('restores the comparison table after the information processing introduction', () => {
  const article = theory.find((entry) => entry.id === 'ecological-approach')
  const introductionIndex = article.blocks.findIndex((block) =>
    block.text === 'Rob Gray contrasts the ecological approach with the traditional **Information Processing (IP) approach**:',
  )

  assert.ok(introductionIndex >= 0)
  assert.deepEqual(article.blocks[introductionIndex + 1], {
    type: 'table',
    headers: ['Aspect', 'Information Processing', 'Ecological Approach'],
    rows: [
      ['Perception', 'Indirect — cues must be interpreted', 'Direct — information specifies what to do'],
      ['Action control', 'Predictive, based on internal models', 'Prospective, online adjustment via control laws'],
      ['Skill', 'Stored motor programs', 'Emerges through self-organization'],
      ['Coaching', 'Prescribe technique, correct errors', 'Destabilize ineffective solutions, guide exploration'],
      ['Variability', 'Added later, for adjustability', 'Added early, for adaptability'],
      ['Expertise', 'Knowledge about (in your head)', 'Knowledge of (in the relationship)'],
      ['Decomposition', 'Effective — modules trained separately', 'Counterproductive — perception and action inseparable'],
    ],
  })
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
