import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  getArticleNavigation,
  getEditorialFallbackText,
  getRenderableBlocks,
  presentBlocks,
  toSectionId,
  type ManualArticle,
  type ManualBlock,
  type ManualMode,
  type PresentedBlock,
} from './fieldManual'

type Props = {
  articles: ManualArticle[]
  mode: ManualMode
}

export default function FieldManualPage({ articles, mode }: Props) {
  const [activeId, setActiveId] = useState(articles[0]?.id ?? '')
  const active = articles.find(article => article.id === activeId) ?? articles[0]
  const navigation = getArticleNavigation(articles, activeId)
  const blocks = useMemo(
    () => active ? presentBlocks(getRenderableBlocks(active), mode) : [],
    [active, mode],
  )

  if (!active) return <div className="field-manual-empty"><h1>No articles available</h1></div>

  const selectArticle = (id: string) => {
    setActiveId(id)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className={`field-manual field-manual-${mode}`} id="field-manual-top">
      <label className="field-manual-mobile">
        <span>Choose chapter</span>
        <select value={active.id} onChange={event => selectArticle(event.target.value)}>
          {articles.map(article => <option key={article.id} value={article.id}>{article.title}</option>)}
        </select>
      </label>

      <aside className="field-manual-rail" aria-label={`${mode} chapters`}>
        <p className="field-manual-rail-title">The Field Manual</p>
        {articles.map((article, index) => (
          <button
            type="button"
            key={article.id}
            className="field-manual-chapter"
            aria-current={active.id === article.id ? 'page' : undefined}
            onClick={() => selectArticle(article.id)}
          >
            <span className="field-manual-chapter-index">{String(index + 1).padStart(2, '0')}</span>
            <span>{article.title}</span>
          </button>
        ))}
        <div
          className="field-manual-progress"
          role="progressbar"
          aria-label={`Chapter ${navigation.index + 1} of ${navigation.total}`}
          aria-valuemin={0}
          aria-valuemax={navigation.total}
          aria-valuenow={navigation.index + 1}
          aria-valuetext={`Chapter ${navigation.index + 1} of ${navigation.total}`}
        >
          <span style={{ width: `${((navigation.index + 1) / navigation.total) * 100}%` }} />
        </div>
      </aside>

      <article className="field-manual-article" key={active.id}>
        <header className="manual-header">
          <div>
            <p className="manual-eyebrow">{mode === 'coaching' ? 'Coaching Field Manual' : 'Theory Field Manual'}</p>
            <h1>{active.title}</h1>
          </div>
          <p className="manual-article-index"><strong>{String(navigation.index + 1).padStart(2, '0')}</strong>Manual / {mode}</p>
        </header>

        <div className="manual-blocks">
          {mode === 'coaching' && active.id === 'design-games' && (
            <section className="manual-concept-pair" aria-label="Exposure and opportunity">
              <div><span>Exposure</span><strong>Present the real problem</strong></div>
              <b aria-hidden="true">→</b>
              <div><span>Opportunity</span><strong>Make solutions possible</strong></div>
            </section>
          )}
          {blocks.map((presented, index) => <ManualBlockView key={`${active.id}-${index}`} presented={presented} articleTitle={active.title} blockIndex={index} />)}
        </div>

        <nav className="manual-pager" aria-label="Article navigation">
          {navigation.previous ? <button type="button" onClick={() => selectArticle(navigation.previous!.id)}>← {navigation.previous.title}</button> : <span />}
          {navigation.next ? <button type="button" onClick={() => selectArticle(navigation.next!.id)}>{navigation.next.title} →</button> : <span />}
        </nav>
      </article>
    </div>
  )
}

/** Parse inline markdown (**bold**, *italic*, ***bold+italic***, [link](url)) into React nodes. */
function parseInlineMd(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // Regex matches: markdown links, ***bold italic***, **bold**, *italic*
  const re = /(\[[^\]]+\]\([^)]+\)|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    const m = match[0]
    if (m.startsWith('[') && m.includes('](')) {
      // Markdown link [text](url)
      const linkMatch = /\[([^\]]+)\]\(([^)]+)\)/.exec(m)
      if (linkMatch) {
        nodes.push(
          <a key={key++} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="manual-inline-link">
            {linkMatch[1]}
          </a>
        )
      }
    } else if (m.startsWith('***') && m.endsWith('***')) {
      nodes.push(<strong key={key++}><em>{m.slice(3, -3)}</em></strong>)
    } else if (m.startsWith('**') && m.endsWith('**')) {
      nodes.push(<strong key={key++}>{m.slice(2, -2)}</strong>)
    } else if (m.startsWith('*') && m.endsWith('*')) {
      nodes.push(<em key={key++}>{m.slice(1, -1)}</em>)
    }
    lastIndex = match.index + m.length
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes.length ? nodes : [text]
}

function blockText(block: ManualBlock) {
  return typeof block.text === 'string' ? block.text : ''
}

function sectionId(text: string, blockIndex: number) {
  return `${toSectionId(text) || 'section'}-${blockIndex}`
}

function EditorialFallback({ block }: { block: ManualBlock }) {
  const fallbackText = getEditorialFallbackText(block)
  const lines = fallbackText.length ? fallbackText : ['Content unavailable.']
  return (
    <div className="manual-fallback">
      {lines.map((line, index) => <p className="manual-paragraph" key={index}>{parseInlineMd(line)}</p>)}
    </div>
  )
}

function ManualBlockView({ presented, articleTitle, blockIndex }: { presented: PresentedBlock; articleTitle: string; blockIndex: number }) {
  const { block, kind } = presented
  if (kind === 'image') {
    const src = typeof block.src === 'string' && block.src.trim() ? block.src : null
    if (!src) return <EditorialFallback block={block} />
    const alt = typeof block.alt === 'string' && block.alt.trim() ? block.alt : articleTitle
    return <figure className="manual-image"><img src={src} alt={alt} /></figure>
  }
  if (kind === 'step') {
    const title = typeof presented.title === 'string' && presented.title.trim() ? presented.title : null
    if (!title || typeof presented.stepNumber !== 'number') return <EditorialFallback block={block} />
    const id = sectionId(title, blockIndex)
    return <h2 className="manual-step" id={id}><span className="manual-step-number">{String(presented.stepNumber).padStart(2, '0')}</span><a href={`#${id}`}>{title}</a></h2>
  }
  if (kind === 'heading' && block.type === 'heading') {
    const text = typeof block.text === 'string' && block.text.trim() ? block.text : null
    if (!text) return <EditorialFallback block={block} />
    const id = sectionId(text, blockIndex)
    return block.level === '2'
      ? <h2 className="manual-section-heading" id={id}><a href={`#${id}`}>{text}</a></h2>
      : <h3 className="manual-subheading" id={id}><a href={`#${id}`}>{text}</a></h3>
  }
  if (kind === 'checklist') {
    const text = typeof block.text === 'string' && block.text.trim() ? block.text : null
    if (!text) return <EditorialFallback block={block} />
    const id = sectionId(text, blockIndex)
    if (block.type === 'heading') {
      return <h2 className="manual-checklist-heading" id={id}><a href={`#${id}`}>{text}</a></h2>
    }
    return <p className="manual-checklist-item"><span aria-hidden="true">—</span>{parseInlineMd(text)}</p>
  }
  if (kind === 'field-note') {
    const sourceText = typeof block.quote === 'string' ? block.quote : blockText(block)
    const text = block.type === 'paragraph' ? sourceText.replace(/^"|"$/g, '') : sourceText
    if (!text.trim()) return <EditorialFallback block={block} />
    const source = typeof block.source === 'string' && block.source.trim() ? block.source : null
    return <blockquote className="manual-field-note"><span>Quote</span>{parseInlineMd(text)}{block.type === 'quote' && source && <cite>{source}</cite>}</blockquote>
  }
  if (kind === 'principle' || kind === 'constraint' || kind === 'win-condition') {
    const text = blockText(block)
    if (!text.trim()) return <EditorialFallback block={block} />
    const label = kind === 'principle' ? 'Principle' : kind === 'constraint' ? 'Constraint' : 'Win condition'
    return <aside className={`manual-emphasis manual-${kind}`}><span>{label}</span><p>{parseInlineMd(text)}</p></aside>
  }
  if (kind === 'list') {
    if (!Array.isArray(block.items) || !block.items.length || !block.items.every(item => typeof item === 'string')) return <EditorialFallback block={block} />
    const ListTag = block.ordered === true ? 'ol' : 'ul'
    return <ListTag className={`manual-list${block.ordered === true ? ' manual-ordered-list' : ''}`}>{block.items.map((item, index) => <li key={index}>{parseInlineMd(item)}</li>)}</ListTag>
  }
  if (kind === 'callout') {
    const text = blockText(block)
    if (!text.trim()) return <EditorialFallback block={block} />
    return <aside className="manual-callout"><span>Reference</span><p>{parseInlineMd(text)}</p></aside>
  }
  return <EditorialFallback block={block} />
}
