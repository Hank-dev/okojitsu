import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getArticleNavigation,
  getEditorialFallbackText,
  getRenderableBlocks,
  presentBlocks,
  presentBlock,
  toSectionId,
  type ManualArticle,
  type ManualBlock,
} from '../src/fieldManual.ts'

const articles: ManualArticle[] = [
  {
    id: 'first',
    title: 'The Real Game',
    emoji: '💊',
    blocks: [
      { type: 'heading', level: '1', text: '💊 The Real Game' },
      { type: 'paragraph', text: 'Opening paragraph.' },
    ],
  },
  {
    id: 'second',
    title: 'Design the Environment',
    blocks: [{ type: 'paragraph', text: 'Second article.' }],
  },
]

test('removes only the first duplicate level-one title', () => {
  assert.deepEqual(getRenderableBlocks(articles[0]), [
    { type: 'paragraph', text: 'Opening paragraph.' },
  ])
})

test('preserves an article that has no duplicate level-one title', () => {
  assert.deepEqual(getRenderableBlocks(articles[1]), [
    { type: 'paragraph', text: 'Second article.' },
  ])
})

test('keeps quoted coaching sentences in the article flow', () => {
  assert.equal(presentBlock({ type: 'paragraph', text: '"Observe before adjusting."' }, 'coaching').kind, 'paragraph')
  assert.equal(presentBlock({ type: 'paragraph', text: '"Observe before adjusting."' }, 'theory').kind, 'field-note')
})

test('classifies explicit step headings as progression steps', () => {
  assert.deepEqual(
    presentBlock({ type: 'heading', level: '2', text: 'Step 3: Create the Win Condition' }, 'coaching'),
    {
      kind: 'step',
      block: { type: 'heading', level: '2', text: 'Step 3: Create the Win Condition' },
      stepNumber: 3,
      title: 'Create the Win Condition',
    },
  )
})

test('keeps bold-only article sentences as ordinary paragraphs', () => {
  const block = { type: 'paragraph' as const, text: '**Put them in the problem.**' }
  assert.equal(presentBlock(block, 'coaching').kind, 'paragraph')
  assert.equal(presentBlock(block, 'theory').kind, 'paragraph')
  assert.equal(block.text, '**Put them in the problem.**')
})

test('keeps coach cues as ordinary coaching prose', () => {
  assert.equal(presentBlock({ type: 'paragraph', variant: 'coach-cue', text: 'Watch the hips.' }, 'coaching').kind, 'paragraph')
  assert.equal(presentBlock({ type: 'paragraph', variant: 'principle', text: 'Options shrink under control.' }, 'theory').kind, 'principle')
})

test('keeps coaching questions and action prompts in the article flow', () => {
  assert.equal(
    presentBlock({ type: 'paragraph', text: 'What is the defending player trying to do that makes this hard?' }, 'coaching').kind,
    'paragraph',
  )
  assert.equal(
    presentBlock({ type: 'paragraph', text: 'Change the win condition to redirect attention' }, 'coaching').kind,
    'paragraph',
  )
  assert.equal(
    presentBlock({ type: 'paragraph', text: 'Change the starting position to put them closer to the problem' }, 'coaching').kind,
    'paragraph',
  )
  assert.equal(
    presentBlock({ type: 'paragraph', text: 'Give a minimal cue connected to the invariant: *"What\'s stopping you from covering the hip?"*' }, 'coaching').kind,
    'paragraph',
  )
})

test('does not classify ambiguous coaching prose as a cue', () => {
  assert.equal(
    presentBlock({ type: 'paragraph', text: 'Constraints shape behavior over time.' }, 'coaching').kind,
    'paragraph',
  )
  assert.equal(
    presentBlock({ type: 'paragraph', text: 'What happened yesterday is useful context.' }, 'coaching').kind,
    'paragraph',
  )
})

test('keeps win-condition copy in the article flow while preserving explicit constraints', () => {
  assert.equal(
    presentBlock({ type: 'paragraph', text: '**Constraint:** Keep both feet to the inside.' }, 'coaching').kind,
    'paragraph',
  )
  assert.equal(
    presentBlock({ type: 'paragraph', text: 'Top player: connect both hands under the elbows → you win' }, 'coaching').kind,
    'paragraph',
  )
  assert.equal(
    presentBlock({ type: 'paragraph', text: 'Defending player: get to your feet and break connections → you win' }, 'coaching').kind,
    'paragraph',
  )
  assert.equal(
    presentBlock({ type: 'paragraph', text: 'The win condition should:' }, 'coaching').kind,
    'paragraph',
  )
  assert.equal(
    presentBlock({ type: 'paragraph', text: 'Be achievable through multiple paths (not one specific technique)' }, 'coaching').kind,
    'paragraph',
  )
  assert.equal(
    presentBlock({ type: 'paragraph', text: '**Bottom player (terminal):** Get your legs back in front.' }, 'coaching').kind,
    'paragraph',
  )
  assert.equal(
    presentBlock({ type: 'paragraph', text: 'A win condition gives feedback.' }, 'coaching').kind,
    'paragraph',
  )
})

test('presents the quick-reference checklist as a scannable semantic section', () => {
  const presented = presentBlocks([
    { type: 'heading', level: '2', text: 'Quick Reference: Game Design Checklist' },
    { type: 'paragraph', text: 'Before running any game, confirm:' },
    { type: 'paragraph', text: 'I know the invariant.' },
    { type: 'heading', level: '2', text: 'Next section' },
    { type: 'paragraph', text: 'Ordinary prose.' },
  ], 'coaching')

  assert.deepEqual(presented.map(block => block.kind), ['checklist', 'checklist', 'checklist', 'heading', 'paragraph'])
})

test('keeps grouped win-condition examples in the article flow', () => {
  const presented = presentBlocks([
    { type: 'paragraph', text: '**Win conditions:**' },
    { type: 'paragraph', text: 'Bottom player: recover guard.' },
    { type: 'paragraph', text: 'Top player: cover the hips.' },
    { type: 'paragraph', text: '**Constraint:** Keep one leg inside.' },
  ], 'coaching')

  assert.deepEqual(presented.map(block => block.kind), ['paragraph', 'paragraph', 'paragraph', 'paragraph'])
})

test('keeps the producer article win-condition copy in the normal article flow', () => {
  const presented = presentBlocks([
    { type: 'paragraph', text: 'The win condition should:' },
    { type: 'paragraph', text: 'Be achievable through multiple paths (not one specific technique)' },
    { type: 'heading', level: '3', text: 'Win condition examples:' },
    { type: 'paragraph', text: 'Top player: connect both hands under partner\'s elbows → you win' },
  ], 'coaching')

  assert.deepEqual(presented.map(block => block.kind), ['paragraph', 'paragraph', 'heading', 'paragraph'])
})

test('keeps quoted and constraint copy in the coaching article flow', () => {
  const presented = presentBlocks([
    { type: 'paragraph', text: '"Top player: you cannot put your hooks in"' },
    { type: 'paragraph', text: '**Starting position** — where the round begins' },
    { type: 'paragraph', text: 'Chest to chest, hips covered, double underhooks in' },
  ], 'coaching')

  assert.deepEqual(presented.map(block => block.kind), ['paragraph', 'paragraph', 'paragraph'])
})

test('keeps starting-position and partner examples in the coaching article flow', () => {
  const presented = presentBlocks([
    { type: 'paragraph', text: '**Starting position** — where the round begins' },
    { type: 'paragraph', text: 'Chest to chest, hips covered, double underhooks in' },
    { type: 'paragraph', text: 'Double seated, one foot in between partner\'s knees' },
    { type: 'paragraph', text: 'Standing, one player with ankle grip' },
    { type: 'paragraph', text: '**Partner constraint** — who they play with and how' },
    { type: 'paragraph', text: 'Resistant vs. cooperative' },
    { type: 'paragraph', text: 'Larger vs. smaller partner' },
    { type: 'paragraph', text: 'Experienced vs. inexperienced' },
    { type: 'paragraph', text: 'Starting positions matter in practice.' },
  ], 'coaching')

  assert.deepEqual(presented.map(block => block.kind), Array(9).fill('paragraph'))
})

test('keeps ordinary and unknown content in editorial fallback', () => {
  assert.equal(presentBlock({ type: 'paragraph', text: 'Skill emerges in live play.' }, 'theory').kind, 'paragraph')
  assert.equal(presentBlock({ type: 'unknown', text: 'Still readable.' }, 'theory').kind, 'fallback')
})

test('routes malformed known block payloads to readable fallback text', () => {
  const malformedParagraph = { type: 'paragraph', text: 42 } as unknown as ManualBlock
  const malformedList = { type: 'list', items: { first: 'Keep it live.' } } as unknown as ManualBlock
  const malformedImage = { type: 'image', src: { url: '/bad-src' }, alt: 'Reference' } as unknown as ManualBlock
  const malformedHeading = { type: 'heading', level: '2', text: { value: 'Still readable.' } } as unknown as ManualBlock
  const malformedQuote = { type: 'quote', quote: { value: 'Still readable.' } } as unknown as ManualBlock
  const malformedCallout = { type: 'callout', text: { value: 'Still readable.' } } as unknown as ManualBlock

  for (const block of [malformedParagraph, malformedList, malformedImage, malformedHeading, malformedQuote, malformedCallout]) {
    assert.equal(presentBlock(block, 'coaching').kind, 'fallback')
    assert.ok(getEditorialFallbackText(block).length > 0)
  }
})

test('keeps a null block in the sequence without crashing the classifier', () => {
  const presented = presentBlocks([null as unknown as ManualBlock, { type: 'paragraph', text: 'Still visible.' }], 'coaching')
  assert.deepEqual(presented.map(block => block.kind), ['fallback', 'paragraph'])
})

test('preserves legacy table headers and rows in editorial fallback text', () => {
  assert.deepEqual(getEditorialFallbackText({
    type: 'table',
    headers: ['Aspect', 'Ecological Approach'],
    rows: [
      ['Skill', 'Emerges through self-organization'],
      ['Coaching', 'Guide exploration'],
    ],
  }), [
    'Aspect | Ecological Approach',
    'Skill | Emerges through self-organization',
    'Coaching | Guide exploration',
  ])
})

test('uses the first readable fallback field before lower-priority payloads', () => {
  assert.deepEqual(getEditorialFallbackText({
    type: 'legacy',
    text: 'Readable text',
    quote: 'Ignored quote',
    items: ['Ignored item'],
    headers: ['Ignored header'],
    rows: [['Ignored row']],
  }), ['Readable text'])
})

test('serializes unknown primitive payloads without exposing the block type', () => {
  assert.deepEqual(getEditorialFallbackText({ type: 'legacy', payload: 42 }), ['payload: 42'])
  assert.deepEqual(getEditorialFallbackText({ type: 'legacy', payload: false }), ['payload: false'])
})

test('does not turn empty objects into editorial UI text', () => {
  assert.deepEqual(getEditorialFallbackText({ type: 'legacy', payload: {} }), [])
})

test('builds stable section ids for direct links', () => {
  assert.equal(toSectionId('Step 3: Create the Win Condition'), 'step-3-create-the-win-condition')
  assert.equal(toSectionId('The Ecological Approach & CLA'), 'the-ecological-approach-cla')
})

test('returns previous and next articles without wrapping', () => {
  assert.deepEqual(getArticleNavigation(articles, 'first'), { previous: null, next: articles[1], index: 0, total: 2 })
  assert.deepEqual(getArticleNavigation(articles, 'second'), { previous: articles[0], next: null, index: 1, total: 2 })
  assert.deepEqual(getArticleNavigation(articles, 'missing'), { previous: null, next: articles[1], index: 0, total: 2 })
})
