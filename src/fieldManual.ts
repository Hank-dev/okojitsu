export type ManualMode = 'theory' | 'coaching'

export type ManualBlock = {
  type: string
  src?: string
  alt?: string
  level?: string
  text?: string
  items?: string[]
  quote?: string
  source?: string
  variant?: string
  [key: string]: unknown
}

export type ManualArticle = {
  id: string
  title: string
  emoji?: string
  blocks: ManualBlock[]
}

export type PresentationKind =
  | 'image'
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'field-note'
  | 'principle'
  | 'callout'
  | 'constraint'
  | 'win-condition'
  | 'checklist'
  | 'step'
  | 'fallback'

export type PresentedBlock = {
  kind: PresentationKind
  block: ManualBlock
  stepNumber?: number
  title?: string
}

const quotedParagraph = /^"[\s\S]+"$/
const stepHeading = /^Step\s+(\d+):\s+(.+)$/i
const checklistHeading = /^Quick Reference:\s+.*Checklist\b/i
const winConditionHeading = /^Win condition examples?:/i
const constraintHeading = /^(?:Step\s+\d+:\s+Set the Constraints|Types of constraints:)$/i
const checklistLead = /^Before running any game, confirm:\s*$/i
const checklistItem = /^(?:I know the invariant\b|The game exposes\b|There is a clear win condition\b|The game is live and resisted\b|The starting position\b|I can progress this game\b|I'm not explaining\b)/i
const constraintLabel = /^(?:constraint|task constraints?|starting position|partner constraint|remove a win condition|continuous vs\.? terminal games|zero-sum design)\s*(?::|[-–—])/i
const constraintExample = /^(?:chest to chest|double seated|standing(?:,|\s)|resistant vs\.?\s+cooperative|larger vs\.?\s+smaller partner|experienced vs\.?\s+inexperienced)/i
const winConditionLabel = /^(?:win conditions?|how to win|the win condition should)\s*:?$/i
const winConditionCriterion = /^(?:be achievable through|be directly connected to|be simple enough to)\b/i
const playerWinCondition = /^(?:top|bottom|attacker|attacking|defender|defending|player)\b[\s\S]*(?:→|=)\s*(?:you\s+)?win\b/i
const terminalPlayerTask = /^(?:top|bottom|attacking|defending)\s+player\s*\(terminal\)\s*:/i
const playerTask = /^(?:top|bottom|attacking|defending)\s+player(?:\s*\([^)]*\))?\s*:/i

export type PresentationContext = {
  section?: 'checklist' | 'win-condition' | 'constraint'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readableString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text ? text : null
}

function plainLabel(text: string): string {
  return text.replace(/\*\*/g, '').replace(/__/g, '').trim()
}

function blockTextValue(block: ManualBlock): string | null {
  return readableString(block.text) ?? readableString(block.quote)
}

function explicitVariant(block: ManualBlock): PresentationKind | null {
  if (typeof block.variant !== 'string') return null
  const variant = block.variant.trim().toLowerCase()
  if (variant === 'constraint') return 'constraint'
  if (variant === 'win-condition' || variant === 'win condition') return 'win-condition'
  if (variant === 'checklist' || variant === 'checklist-item') return 'checklist'
  if (variant === 'principle') return 'principle'
  return null
}

function classifyCoachingParagraph(text: string, context: PresentationContext): PresentationKind | null {
  if (context.section === 'checklist' || checklistLead.test(text) || checklistItem.test(text)) return 'checklist'
  return null
}

export function getRenderableBlocks(article: ManualArticle): ManualBlock[] {
  const blocks = Array.isArray(article?.blocks) ? article.blocks : []
  const firstTitle = blocks.findIndex(block => isRecord(block) && block.type === 'heading' && block.level === '1')
  if (firstTitle < 0) return blocks
  return blocks.filter((_, index) => index !== firstTitle)
}

export function presentBlock(block: ManualBlock, mode: ManualMode, context: PresentationContext = {}): PresentedBlock {
  if (!isRecord(block)) return { kind: 'fallback', block: block as ManualBlock }

  const type = typeof block.type === 'string' ? block.type.toLowerCase() : ''
  const variant = explicitVariant(block)
  const text = readableString(block.text)

  if (type === 'heading') {
    if (!text) return { kind: 'fallback', block }
    const match = stepHeading.exec(text)
    if (match) return { kind: 'step', block, stepNumber: Number(match[1]), title: match[2] }
    if (checklistHeading.test(text)) return { kind: 'checklist', block, title: text }
    return { kind: 'heading', block }
  }

  if (type === 'quote') {
    return blockTextValue(block) ? { kind: 'field-note', block } : { kind: 'fallback', block }
  }

  if (type === 'paragraph') {
    if (!text) return { kind: 'fallback', block }
    if (mode === 'theory' && quotedParagraph.test(text)) return { kind: 'field-note', block }
    if (variant) return { kind: variant, block }
    if (mode === 'coaching') {
      const coachingKind = classifyCoachingParagraph(text, context)
      if (coachingKind) return { kind: coachingKind, block }
    }
    return { kind: 'paragraph', block }
  }

  if (type === 'image') {
    return readableString(block.src) ? { kind: 'image', block } : { kind: 'fallback', block }
  }

  if (type === 'list' || type === 'checklist') {
    const items = block.items
    const validItems = Array.isArray(items) && items.length > 0 && items.every(item => readableString(item) !== null)
    if (!validItems) return { kind: 'fallback', block }
    return { kind: type === 'checklist' || context.section === 'checklist' ? 'checklist' : 'list', block }
  }

  if (type === 'callout') {
    return text ? { kind: 'callout', block } : { kind: 'fallback', block }
  }

  if (type === 'constraint' || type === 'win-condition' || type === 'win_condition' || type === 'checklist-item') {
    if (!text) return { kind: 'fallback', block }
    return { kind: type === 'constraint' ? 'constraint' : type === 'checklist-item' ? 'checklist' : 'win-condition', block }
  }

  return { kind: 'fallback', block }
}

/** Present a sequence while carrying narrow local context for semantic sections. */
export function presentBlocks(blocks: ManualBlock[], mode: ManualMode): PresentedBlock[] {
  let section: PresentationContext['section']
  return (Array.isArray(blocks) ? blocks : []).map(block => {
    const presented = presentBlock(block, mode, { section })
    const isHeading = isRecord(block) && block.type === 'heading'
    const text = isRecord(block) && typeof block.text === 'string' ? plainLabel(block.text) : ''
    if (presented.kind === 'checklist' && isHeading) {
      section = 'checklist'
    } else if (isHeading) {
      section = undefined
    }
    return presented
  })
}

function primitiveEditorialText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() ? value : null
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  return null
}

function safeSerializeEditorialValue(value: unknown, seen = new WeakSet<object>()): string | null {
  const primitive = primitiveEditorialText(value)
  if (primitive !== null) return primitive
  if (value === null || value === undefined) return null

  if (Array.isArray(value)) {
    if (!value.length || seen.has(value)) return null
    seen.add(value)
    const parts = value
      .map(item => safeSerializeEditorialValue(item, seen))
      .filter((item): item is string => item !== null)
    seen.delete(value)
    return parts.length ? `[${parts.join(', ')}]` : null
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return null
    seen.add(value)
    const parts = Object.entries(value)
      .filter(([key]) => key !== 'type')
      .map(([key, item]) => {
        const rendered = safeSerializeEditorialValue(item, seen)
        return rendered === null ? null : `${key}: ${rendered}`
      })
      .filter((item): item is string => item !== null)
    seen.delete(value)
    return parts.length ? `{ ${parts.join(', ')} }` : null
  }

  return null
}

function editorialLines(value: unknown, seen = new WeakSet<object>()): string[] {
  const primitive = primitiveEditorialText(value)
  if (primitive !== null) return [primitive]
  if (Array.isArray(value)) {
    if (seen.has(value)) return []
    seen.add(value)
    const lines = value.flatMap(item => editorialLines(item, seen))
    seen.delete(value)
    return lines
  }
  const serialized = safeSerializeEditorialValue(value, seen)
  return serialized === null ? [] : [serialized]
}

function editorialTableLines(headers: unknown, rows: unknown): string[] {
  const lines: string[] = []
  const headerCells = Array.isArray(headers) ? headers.flatMap(item => editorialLines(item)) : editorialLines(headers)
  if (headerCells.length) lines.push(headerCells.join(' | '))

  if (Array.isArray(rows)) {
    rows.forEach(row => {
      const cells = Array.isArray(row) ? row.flatMap(item => editorialLines(item)) : editorialLines(row)
      if (cells.length) lines.push(cells.join(' | '))
    })
  } else {
    const row = editorialLines(rows)
    if (row.length) lines.push(...row)
  }
  return lines
}

/** Preserve unknown block payloads as readable editorial text instead of dropping them. */
export function getEditorialFallbackText(block: ManualBlock): string[] {
  if (!isRecord(block)) return editorialLines(block)

  const text = editorialLines(block.text)
  if (text.length) return text

  const quote = editorialLines(block.quote)
  if (quote.length) return quote

  const items = editorialLines(block.items)
  if (items.length) return items

  const table = editorialTableLines(block.headers, block.rows)
  if (table.length) return table

  return Object.entries(block)
    .filter(([key]) => key !== 'type')
    .flatMap(([key, value]) => editorialLines(value).map(line => `${key}: ${line}`))
}

export function toSectionId(text: string) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function getArticleNavigation(articles: ManualArticle[], activeId: string) {
  const foundIndex = articles.findIndex(article => article.id === activeId)
  const index = foundIndex < 0 ? 0 : foundIndex
  return {
    previous: articles[index - 1] ?? null,
    next: articles[index + 1] ?? null,
    index,
    total: articles.length,
  }
}
