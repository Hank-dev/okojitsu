import React, { useState, useEffect, useMemo } from 'react'
import type { Game, SessionPlan, SessionGame } from './types'
import { CATEGORY_META, LEVEL_META, TYPE_META, SKILL_META, SKILL_ORDER } from './types'
import type { Skill } from './types'
import theoryFullData from './data/theory-full.json'
import coachingFullData from './data/coaching-full.json'
import { SEED_SESSIONS } from './data/sessions-seed'
import gamesData from './data/games.json'
import { generateSession } from './sessionGenerator'
import type { GenerateOptions, GeneratedSession } from './sessionGenerator'
import { getSuggestions } from './suggestionEngine'
import type { Suggestion } from './suggestionEngine'

const GAMES: Game[] = gamesData as Game[]

/** Full-text search across ALL game fields: title, objectives, win conditions, constraints, rationale, tags, skills. */
function gameMatchesSearch(g: Game, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  if (g.title.toLowerCase().includes(needle)) return true
  if (g.startingPosition.toLowerCase().includes(needle)) return true
  if (g.designRationale?.toLowerCase().includes(needle)) return true
  if (g.source.toLowerCase().includes(needle)) return true
  for (const t of g.tags) if (t.toLowerCase().includes(needle)) return true
  for (const s of g.skills) if (s.toLowerCase().includes(needle)) return true
  for (const p of g.players) {
    if (p.role.toLowerCase().includes(needle)) return true
    if (p.objective.toLowerCase().includes(needle)) return true
    if (p.winCondition?.toLowerCase().includes(needle)) return true
    for (const c of p.constraints) if (c.toLowerCase().includes(needle)) return true
  }
  for (const c of g.constraints) if (c.toLowerCase().includes(needle)) return true
  return false
}

type Page = 'home' | 'theory' | 'library' | 'builder' | 'sessions' | 'coaching' | 'memes' | 'resources'

const SESSIONS_KEY = 'okojitsu_sessions'
const DELETED_SEEDS_KEY = 'okojitsu_deleted_seeds'

function loadSessions(): SessionPlan[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (!raw) return [...SEED_SESSIONS]
    const parsed: SessionPlan[] = JSON.parse(raw)
    const seedIds = new Set(SEED_SESSIONS.map(s => s.id))
    const deletedSeeds: string[] = JSON.parse(localStorage.getItem(DELETED_SEEDS_KEY) || '[]')
    const activeSeeds = SEED_SESSIONS.filter(s => !deletedSeeds.includes(s.id))
    const userOnly = parsed.filter(s => !seedIds.has(s.id))
    return [...activeSeeds, ...userOnly]
  } catch { return [...SEED_SESSIONS] }
}

function saveSessions(sessions: SessionPlan[]) {
  const seedIds = new Set(SEED_SESSIONS.map(s => s.id))
  const userOnly = sessions.filter(s => !seedIds.has(s.id))
  const remainingSeedIds = new Set(sessions.filter(s => seedIds.has(s.id)).map(s => s.id))
  const deletedSeeds = SEED_SESSIONS.filter(s => !remainingSeedIds.has(s.id)).map(s => s.id)
  localStorage.setItem(DELETED_SEEDS_KEY, JSON.stringify(deletedSeeds))
  localStorage.setItem(SESSIONS_KEY, JSON.stringify([...userOnly, ...deletedSeeds]))
}

const GAME_TIME_KEY = 'okojitsu_game_times'
function loadGameTimes(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(GAME_TIME_KEY) || '{}') }
  catch { return {} }
}
function saveGameTimes(t: Record<string, number>) { localStorage.setItem(GAME_TIME_KEY, JSON.stringify(t)) }

const CUSTOM_GAMES_KEY = 'okojitsu_custom_games'

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const [sessions, setSessions] = useState<SessionPlan[]>(loadSessions)
  const [customGames, setCustomGames] = useState<Game[]>(() => {
    try { return JSON.parse(localStorage.getItem(CUSTOM_GAMES_KEY) || '[]') }
    catch { return [] }
  })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const gameCount = GAMES.length + customGames.length
  const categoryCount = Object.keys(CATEGORY_META).length

  useEffect(() => { saveSessions(sessions) }, [sessions])
  useEffect(() => { localStorage.setItem(CUSTOM_GAMES_KEY, JSON.stringify(customGames)) }, [customGames])

  const ALL_GAMES = useMemo(() => [...GAMES, ...customGames], [customGames])

  const addCustomGame = (g: Game) => setCustomGames(prev => [...prev, g])
  const deleteCustomGame = (id: string) => setCustomGames(prev => prev.filter(g => g.id !== id))
  const updateCustomGame = (g: Game) => setCustomGames(prev => prev.map(c => c.id === g.id ? g : c))
  const [editSession, setEditSession] = useState<SessionPlan | null>(null)
  const startEditSession = (s: SessionPlan) => { setEditSession(s); setPage('builder') }

  const navTo = (p: Page) => { setPage(p); setMobileMenuOpen(false) }

  return (
    <div className="app">
      <header className="header">
        <div className="header-logo" onClick={() => navTo('home')}>
          <span className="header-logo-icon">{'\u00D8'}</span>
          <span>{'\u00D8'}koJitsu</span>
        </div>
        <nav className={`header-nav ${mobileMenuOpen ? 'open' : ''}`}>
          <button className={`nav-item ${page === 'home' ? 'active' : ''}`} onClick={() => navTo('home')}>Home</button>
          <button className={`nav-item ${page === 'theory' ? 'active' : ''}`} onClick={() => navTo('theory')}>Theory</button>
          <button className={`nav-item ${page === 'library' ? 'active' : ''}`} onClick={() => navTo('library')}>Game Library</button>
          <button className={`nav-item ${page === 'builder' ? 'active' : ''}`} onClick={() => navTo('builder')}>Class Builder</button>
          <button className={`nav-item ${page === 'sessions' ? 'active' : ''}`} onClick={() => navTo('sessions')}>My Sessions</button>
          <button className={`nav-item ${page === 'coaching' ? 'active' : ''}`} onClick={() => navTo('coaching')}>Coaching</button>
          <button className={`nav-item ${page === 'memes' ? 'active' : ''}`} onClick={() => navTo('memes')}>Memes</button>
          <button className={`nav-item ${page === 'resources' ? 'active' : ''}`} onClick={() => navTo('resources')}>Resources</button>
        </nav>
        <button className={`hamburger ${mobileMenuOpen ? 'open' : ''}`} onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}>
          <span />
          <span />
          <span />
        </button>
      </header>
      {mobileMenuOpen && <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)} />}
      <main className="main">
        {page === 'home' && <HomePage setPage={setPage} />}
        {page === 'theory' && <TheoryPage />}
        {page === 'library' && <LibraryPage onSelect={setSelectedGame} customGames={customGames} onAddGame={addCustomGame} onDeleteGame={deleteCustomGame} onUpdateGame={updateCustomGame} />}
        {page === 'builder' && <BuilderPage sessions={sessions} setSessions={setSessions} onSelect={setSelectedGame} editSession={editSession} onEditDone={() => setEditSession(null)} />}
        {page === 'sessions' && <SessionsPage sessions={sessions} setSessions={setSessions} onCopyEdit={startEditSession} />}
        {page === 'coaching' && <CoachingPage />}
        {page === 'memes' && <MemesPage />}
        {page === 'resources' && <ResourcesPage />}
      </main>
      {selectedGame && <GameModal game={selectedGame} onClose={() => setSelectedGame(null)} onNavigate={(g) => setSelectedGame(g)} />}
    </div>
  )
}

function HomePage({ setPage }: { setPage: (p: Page) => void }) {
  return (
    <div className="hero">
      <section className="hero-content">
        <h1>ØkoJitsu<br /><span className="hero-title-accent">4Lyfe</span></h1>
        <p className="hero-subtitle">
          Ecological jiu-jitsu: train through live games, not dead repetition.
          Browse CLA games and build classes.
        </p>
        <div className="hero-rule" />
        <blockquote className="hero-quote">
          {'\u201C'}Exposure and opportunity. You want to expose yourself to the problem.
          And whatever game you create needs to give you an opportunity to solve it.{'\u201D'}
          <cite>Greg Souders</cite>
        </blockquote>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={() => setPage('builder')}>Build today&apos;s class</button>
          <button className="btn btn-secondary" onClick={() => setPage('library')}>Browse the library</button>
        </div>
      </section>
      <div className="hero-visual">
        <img src="/img/frontpage.jpg" alt="ØkoJitsu ecological grappling" className="hero-image" />
      </div>
    </div>
  )
}

// ============ THEORY ============
const THEORY_FULL = theoryFullData as any[]

/** Parse inline markdown (**bold**, *italic*, ***bold+italic***, [link](url)) into React nodes. */
function parseInlineMd(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
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
          <a key={key++} href={linkMatch[2]} target="_blank" rel="noopener noreferrer"
             style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
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

function TheoryBlockView({ block }: { block: any }) {
  if (block.type === 'image') {
    return (
      <div className="theory-image-wrap">
        <img src={block.src} alt="" className="theory-image" />
      </div>
    )
  }
  if (block.type === 'heading') {
    if (block.level === '1') return <h2>{block.text}</h2>
    if (block.level === '2') return <h2>{block.text}</h2>
    return <h3>{block.text}</h3>
  }
  if (block.type === 'list') {
    return (
      <ul>
        {block.items.map((item: string, i: number) => (
          <li key={i}>{parseInlineMd(item)}</li>
        ))}
      </ul>
    )
  }
  if (block.type === 'quote') {
    return (
      <blockquote>
        {parseInlineMd(block.quote || block.text || '')}
        {block.source && <span className="source">{block.source}</span>}
      </blockquote>
    )
  }
  if (block.type === 'callout') {
    return <div className={`callout callout-${block.variant || 'info'}`}>{parseInlineMd(block.text || '')}</div>
  }
  // paragraph (default)
  return <p>{parseInlineMd(block.text || '')}</p>
}

function TheoryPage() {
  const [activeId, setActiveId] = useState(THEORY_FULL[0]?.id || '')
  const active = THEORY_FULL.find((s: any) => s.id === activeId) || THEORY_FULL[0]
  return (
    <div className="theory-layout">
      <aside className="theory-sidebar">
        {THEORY_FULL.map((s: any) => (
          <div key={s.id} className={`sidebar-item ${activeId === s.id ? 'active' : ''}`} onClick={() => setActiveId(s.id)}>
            <span className="sidebar-emoji">{s.emoji}</span> {s.title}
          </div>
        ))}
      </aside>
      <article className="theory-content">
        <h1>{active.emoji} {active.title}</h1>
        {(() => {
          let skippedTitle = false
          return active.blocks.map((block: any, i: number) => {
            // Skip the first H1 heading (it duplicates the section title)
            if (!skippedTitle && block.type === 'heading' && block.level === '1') {
              skippedTitle = true
              return null
            }
            return <TheoryBlockView key={i} block={block} />
          })
        })()}
      </article>
    </div>
  )
}

// ============ COACHING ============
const COACHING_FULL = coachingFullData as any[]

function CoachingPage() {
  const [activeId, setActiveId] = useState(COACHING_FULL[0]?.id || '')
  const active = COACHING_FULL.find((s: any) => s.id === activeId) || COACHING_FULL[0]
  return (
    <div className="theory-layout">
      <aside className="theory-sidebar">
        {COACHING_FULL.map((s: any) => (
          <div key={s.id} className={`sidebar-item ${activeId === s.id ? 'active' : ''}`} onClick={() => setActiveId(s.id)}>
            <span className="sidebar-emoji">{s.emoji}</span> {s.title}
          </div>
        ))}
      </aside>
      <article className="theory-content">
        <h1>{active.emoji} {active.title}</h1>
        {(() => {
          let skippedTitle = false
          return active.blocks.map((block: any, i: number) => {
            if (!skippedTitle && block.type === 'heading' && block.level === '1') {
              skippedTitle = true
              return null
            }
            return <TheoryBlockView key={i} block={block} />
          })
        })()}
      </article>
    </div>
  )
}

// ============ MEMES ============
const MEME_IMAGES = [
  { src: '/img/meme-1.jpg', title: 'CLA Flowchart' },
  { src: '/img/meme-2.jpg', title: 'No Drilling' },
  { src: '/img/meme-3.jpg', title: 'Invariants' },
  { src: '/img/meme-4.jpg', title: 'Live Work Only' },
  { src: '/img/meme-5.jpg', title: 'Greg Energy' },
  { src: '/img/meme-6.jpg', title: 'Ecological BJJ' },
]

function MemesPage() {
  return (
    <div style={{ maxWidth: 1200, margin: '32px auto', padding: '0 28px' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Memes</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>From the doc.</p>
      <div className="meme-grid">
        {MEME_IMAGES.map((m, i) => (
          <div key={i} className="meme-item">
            <img src={m.src} alt={m.title} className="meme-img" loading="lazy" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ============ RESOURCES ============
const RESOURCES = {
  people: [
    { name: 'Greg Souders', handle: '@GD_STS', affiliation: 'Standard Jiu-Jitsu, Maryland', role: 'CLA Coach & Invariant Framework',
      desc: 'The primary source for the games and coaching methodology in this project. Greg runs Standard Jiu-Jitsu and teaches ecological jiu-jitsu through constrained live games. His invariant framework — make and maintain connection, manage distance, destabilize, segment, isolate, immobilize — is the lens through which all CLA games are designed.',
      links: [
        { label: 'Instagram', url: 'https://instagram.com/GD_STS' },
        { label: 'Spotify Playlist', url: 'https://open.spotify.com/playlist/6wDBsSfC7EINQuzwPhvuC6?si=d3f2ecc0335b420e' },
        { label: 'YouTube CLA Playlist', url: 'https://youtube.com/playlist?list=PLEmjNuJJkxDJFpzJqn3E4ZWSpFd02sZyx&si=Uy5ujjXo4OJfF_3c' },
      ] },
    { name: 'Rob Gray', handle: '@Shoeprize', affiliation: 'Arizona State University', role: 'Perception-Action Researcher',
      desc: 'Researcher and author whose work on ecological psychology and the Constraints-Led Approach provides the theoretical foundation for CLA in sports. His Perception Action Podcast is the best deep-dive resource on why ecological training works.',
      links: [
        { label: 'Perception Action Podcast', url: 'https://open.spotify.com/show/6P7OPFNTMnwRYjVsj8OYaM?si=c63b2e04bbd744e9' },
        { label: 'Book: How We Learn to Move', url: 'https://www.goodreads.com/book/show/59507312-how-we-learn-to-move' },
      ] },
  ],
  books: [
    { title: 'How We Learn to Move', author: 'Rob Gray (2024)', url: 'https://www.goodreads.com/book/show/59507312-how-we-learn-to-move',
      desc: 'The definitive book on ecological approaches to movement learning. Covers the science behind CLA and why constraints-based training works better than traditional instruction.' },
    { title: 'Constraints-Led Approach: Principles for Sports Coaching and Practice Design', author: 'Ian Renshaw, Keith Davids, Daniel Araujo', url: 'https://www.akademika.no/hjem-og-fritid/sport-og-friluft/constraints-led-approach/9781138104075',
      desc: 'Academic textbook on implementing CLA in sport. Provides the theoretical framework and practical examples across multiple sports.' },
  ],
  podcasts: [
    { title: 'Perception Action Podcast', host: 'Rob Gray', url: 'https://open.spotify.com/show/6P7OPFNTMnwRYjVsj8OYaM?si=c63b2e04bbd744e9',
      desc: 'The go-to podcast on ecological psychology and CLA in sports. Rob Gray breaks down research into actionable coaching insights.' },
    { title: 'Greg Souders Podcast Appearances', host: 'Various', url: 'https://open.spotify.com/playlist/6wDBsSfC7EINQuzwPhvuC6?si=d3f2ecc0335b420e',
      desc: 'Spotify playlist collecting Greg Souders podcast appearances covering CLA, coaching philosophy, and ecological dynamics.' },
    { title: 'BJJ Instructional Shortcuts Are A Lie — All You Need Is Live Work', host: 'Podcast #54', url: 'https://youtube.com/playlist?list=PLEmjNuJJkxDJFpzJqn3E4ZWSpFd02sZyx&si=Uy5ujjXo4OJfF_3c',
      desc: 'YouTube playlist featuring Greg Souders explaining CLA games, seminars, and coaching sessions at Standard Jiu-Jitsu.' },
  ],
  videos: [
    { title: 'CLA Games Video Series', source: 'YouTube', url: 'https://youtube.com/playlist?list=PLEmjNuJJkxDJDUg-UOFO_SpeKvusKIzmO&si=CiSLo8fCRBX-LMKc',
      desc: 'YouTube playlist with CLA game demonstrations and seminar recordings.' },
    { title: 'Seated Handfight — Philippines Seminar', source: 'YouTube', url: 'https://www.youtube.com/watch?v=kmU390aEbFQ',
      desc: 'Greg Souders teaching the seated handfight game at a seminar in the Philippines.' },
    { title: 'Stay Connected — B-Team Day 2', source: 'YouTube', url: 'https://www.youtube.com/watch?v=rv7_sUfup9o',
      desc: 'Greg at B-Team: bottom player explores connection as a task, not a win condition.' },
    { title: 'Whole Game / Stay Connected', source: 'YouTube', url: 'https://www.youtube.com/watch?v=EQ6GNe2tmXM&list=PLEmjNuJJkxDJDUg-UOFO_SpeKvusKIzmO&index=9',
      desc: 'Full game demonstration from the CLA Games video series.' },
  ],
  articles: [
    { title: 'How CLA Is Changing Sports Training', source: 'The Athletic / NYT', url: 'https://www.nytimes.com/athletic/6665943/2025/09/29/sports-training-cla-coaching-wembanyana-ohtani/',
      desc: 'Article on how CLA is being adopted by professional sports teams and elite athletes, including Wembanyama and Ohtani.' },
  ],
  peopleMentioned: [
    { name: 'John Danaher', desc: 'Elite grappler and instructor known for detailed technical instruction. The document argues that even Danaher\'s success comes from the live environment, not the instruction itself. His instructionals follow the same pattern: the first 5-20 minutes contain the entire framework as principles.' },
    { name: 'Gordon Ryan', desc: 'Five-time ADCC champion. His training methodology (start in live situations, figure out solutions in the moment) is used as evidence that even elite grapplers learn through trial and error and interaction with the live environment.' },
    { name: 'Ryan Hall', desc: 'BJJ black belt and ADCC medalist. His breakdown of the triangle into four conditions (threat, lock, angle, finish) is used as an example of low-variability submission analysis — submissions are explicit about what makes them work.' },
    { name: 'Claude (AI)', desc: 'This document was generated with the help of Claude AI to summarise and structure transcripts from Greg Souders, Rob Gray, and other sources. The AI organizes the theory but the ideas originate from the referenced coaches and researchers.' },
  ],
}

function ResourcesPage() {
  const rl = (label: string, url: string) => (
    <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px', textDecoration: 'none' }}>{label} ↗</a>
  )
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 28px' }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 6 }}>Resources</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 12 }}>Books, podcasts, videos, articles, and people behind this project.</p>
      <div className="card" style={{ padding: 18, marginBottom: 36, borderLeft: '3px solid var(--accent)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>📄 Original Source Document</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>The full Google Doc that started it all — every game, theory section, and coaching principle referenced here.</p>
        <a href="https://docs.google.com/document/d/10x8E97LfgZ7MycaNCqrEbS-hUZPXnVtuFE_Pvd8_V8Q/edit?usp=sharing" target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px', textDecoration: 'none' }}>Open Original Document ↗</a>
      </div>

      {/* Source People */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, marginTop: 8 }}>Source People</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 40 }}>
        {RESOURCES.people.map((p, i) => (
          <div key={i} className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{p.role}</div>
                {p.affiliation && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{p.affiliation}</div>}
              </div>
              {p.handle && <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{p.handle}</div>}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '8px 0 12px' }}>{p.desc}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {p.links?.map((l, li) => <span key={li}>{rl(l.label, l.url)}</span>)}
            </div>
          </div>
        ))}
      </div>

      {/* Books */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Books</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
        {RESOURCES.books.map((b, i) => (
          <div key={i} className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{b.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{b.author}</div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{b.desc}</p>
              </div>
              {rl('View', b.url)}
            </div>
          </div>
        ))}
      </div>

      {/* Podcasts */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Podcasts</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
        {RESOURCES.podcasts.map((p, i) => (
          <div key={i} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{p.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{p.host}</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>{p.desc}</p>
            {rl('Listen', p.url)}
          </div>
        ))}
      </div>

      {/* Videos */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Videos & Seminars</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 40 }}>
        {RESOURCES.videos.map((v, i) => (
          <div key={i} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{v.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{v.source}</div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>{v.desc}</p>
            {rl('Watch', v.url)}
          </div>
        ))}
      </div>

      {/* Articles */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Articles</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
        {RESOURCES.articles.map((a, i) => (
          <div key={i} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{a.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{a.source}</div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{a.desc}</p>
              </div>
              {rl('Read', a.url)}
            </div>
          </div>
        ))}
      </div>

      {/* Also Mentioned */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Also Mentioned</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
        {RESOURCES.peopleMentioned.map((p, i) => (
          <div key={i} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{p.desc}</p>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0', borderTop: '1px solid var(--border)' }}>
        This document was generated using AI to summarise transcripts from Greg Souders, Rob Gray, and other sources. Always verify with the original source material.
      </p>
    </div>
  )
}

function CompactGameItem({ game, index, selected, custom, onClick }: { game: Game; index: number; selected: boolean; custom: boolean; onClick: () => void }) {
  const cat = CATEGORY_META[game.category] || CATEGORY_META['submissions']
  return (
    <div className={`compact-item ${selected ? 'selected' : ''}`} onClick={onClick} style={{ '--cat-color': cat.color } as React.CSSProperties}>
      <div className="compact-num">{index + 1}</div>
      <div className="compact-body">
        <div className="compact-title">{game.title}{custom && <span className="compact-custom-badge">custom</span>}</div>
        <div className="compact-meta">
          <span className={`mini-badge mini-level-${game.level}`}>{LEVEL_META[game.level]?.label}</span>
          <span className={`mini-badge mini-type-${game.type}`}>{TYPE_META[game.type]?.label}</span>
          {game.progression && <span className="mini-badge mini-prog">🔗 {game.progression.step}/{game.progression.totalSteps}</span>}
        </div>
      </div>
    </div>
  )
}

// ============ GAME DETAIL INLINE ============
function GameDetailInline({ game, onClose, onEdit, onNavigate }: { game: Game; onClose: () => void; onEdit?: () => void; onNavigate?: (g: Game) => void }) {
  const cat = CATEGORY_META[game.category] || CATEGORY_META['submissions']
  return (
    <div className="detail-panel">
      <div className="detail-header" style={{ borderLeftColor: cat.color }}>
        <div className="detail-header-text">
          <div className="detail-title">{game.title}</div>
          <div className="detail-badges">
            <span className={`mini-badge mini-level-${game.level}`}>{LEVEL_META[game.level]?.label}</span>
            <span className={`mini-badge mini-type-${game.type}`}>{TYPE_META[game.type]?.label}</span>
            <span className="detail-cat-label" style={{ color: cat.color }}>{cat.label}</span>
          </div>
          {game.skills?.length > 0 && (
            <div className="detail-skills">
              {game.skills.map(s => (
                <span key={s} className="skill-tag" style={{ '--skill-color': SKILL_META[s]?.color } as React.CSSProperties}>
                  {SKILL_META[s]?.label}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="detail-header-actions">
          {onEdit && <button className="detail-edit-btn" onClick={onEdit}>Edit</button>}
          <button className="detail-close-btn" onClick={onClose} aria-label="Close details">Close</button>
        </div>
      </div>
      <div className="detail-body">
        <div className="detail-section">
          <div className="detail-label">Starting Position</div>
          <div className="detail-text">{game.startingPosition}</div>
        </div>
        <div className="detail-section">
          <div className="detail-label">Players</div>
          <div className="detail-players">
            {game.players.map((p: any, i: number) => (
              <div key={i} className={`detail-player ${i === 0 ? 'detail-attacker' : 'detail-defender'}`}>
                <div className="detail-player-role">{p.role}</div>
                <div className="detail-player-row"><span className="detail-field-key">Objective</span><span className="detail-field-val">{p.objective}</span></div>
                {p.winCondition && <div className="detail-player-row"><span className="detail-field-key">Win condition</span><span className="detail-field-val detail-win">{p.winCondition}</span></div>}
                {p.constraints?.length > 0 && (
                  <div className="detail-player-row"><span className="detail-field-key">Constraints</span>
                    <ul className="detail-constraints">{p.constraints.map((c: string, ci: number) => <li key={ci}>{c}</li>)}</ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        {game.designRationale && (
          <div className="detail-section">
            <div className="detail-label">Rationale</div>
            <div className="detail-rationale">{game.designRationale}</div>
          </div>
        )}
        {game.progression && (
          <div className="detail-section">
            <div className="detail-label">Progression — Step {game.progression.step} of {game.progression.totalSteps}</div>
            <div className="detail-progression">
              <div className="prog-dots">
                {Array.from({ length: game.progression.totalSteps }, (_, i) => (
                  <span key={i} className={`prog-dot ${i + 1 === game.progression!.step ? 'current' : i + 1 < game.progression!.step ? 'done' : ''}`} />
                ))}
              </div>
              <div className="prog-nav">
                {game.progression.prevId && (() => {
                  const prev = GAMES.find(g => g.id === game.progression!.prevId)
                  return prev ? <button className="prog-link prog-link-btn" onClick={() => onNavigate?.(prev)}>← {prev.title}</button> : null
                })()}
                {game.progression.nextId && (() => {
                  const next = GAMES.find(g => g.id === game.progression!.nextId)
                  return next ? <button className="prog-link prog-link-btn prog-link-next" onClick={() => onNavigate?.(next)}>{next.title} →</button> : null
                })()}
              </div>
            </div>
          </div>
        )}
        <div className="detail-source">
          {game.sourceUrl
            ? <a href={game.sourceUrl} target="_blank" rel="noopener noreferrer" className="source-link">▶ {game.source} ↗</a>
            : game.source}
        </div>
      </div>
    </div>
  )
}

// ============ GAME MODAL ============
function GameModal({ game, onClose, onNavigate }: { game: Game; onClose: () => void; onNavigate?: (g: Game) => void }) {
  const cat = CATEGORY_META[game.category] || CATEGORY_META['submissions']
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = '' } }, [])
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ '--cat-color': cat.color } as React.CSSProperties}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <div className="gm-title-bar">
          <span style={{ fontSize: 36 }}>{cat.emoji || '🎲'}</span>
          <div>
            <h2 className="gm-title">{game.title}</h2>
            <div className="gm-title-meta"><span>{cat.label}</span><span className="gm-dot">·</span><span>{LEVEL_META[game.level]?.label}</span><span className="gm-dot">·</span><span>{TYPE_META[game.type]?.label}</span></div>
            {game.skills?.length > 0 && (
              <div className="detail-skills" style={{ marginTop: 6 }}>
                {game.skills.map(s => (
                  <span key={s} className="skill-tag" style={{ '--skill-color': SKILL_META[s]?.color } as React.CSSProperties}>
                    {SKILL_META[s]?.icon} {SKILL_META[s]?.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="gm-body">
          <div className="gm-section"><div className="gm-section-label">📍 Starting Position</div><div className="gm-start">{game.startingPosition}</div></div>
          <div className="gm-section"><div className="gm-section-label">⚔️ Players</div>
            <div className="gm-players-grid">
              {game.players.map((p: any, i: number) => (
                <div key={i} className={`gm-player-panel ${i === 0 ? 'gm-player-attacker' : 'gm-player-defender'}`}>
                  <div className="gm-player-role">{p.role}</div>
                  <div className="gm-player-field"><div className="gm-field-label">Objective</div><div className="gm-field-text">{p.objective}</div></div>
                  {p.winCondition && <div className="gm-player-field"><div className="gm-field-label gm-field-win">🏆 Win</div><div className="gm-field-text gm-field-win-text">{p.winCondition}</div></div>}
                  {p.constraints?.length > 0 && <div className="gm-player-field"><div className="gm-field-label">⚠️ Constraints</div><ul className="gm-field-list">{p.constraints.map((c: string, ci: number) => <li key={ci}>{c}</li>)}</ul></div>}
                </div>
              ))}
            </div>
          </div>
          {game.designRationale && <div className="gm-section"><div className="gm-section-label">💡 Rationale</div><div className="gm-rationale-box">{game.designRationale}</div></div>}
          {game.progression && (
            <div className="gm-section"><div className="gm-section-label">🔗 Progression — Step {game.progression.step} of {game.progression.totalSteps}</div>
              <div className="detail-progression">
                <div className="prog-dots">
                  {Array.from({ length: game.progression.totalSteps }, (_, i) => (
                    <span key={i} className={`prog-dot ${i + 1 === game.progression!.step ? 'current' : i + 1 < game.progression!.step ? 'done' : ''}`} />
                  ))}
                </div>
                <div className="prog-nav">
                  {game.progression.prevId && (() => {
                    const prev = GAMES.find(g => g.id === game.progression!.prevId)
                    return prev ? <button className="prog-link prog-link-btn" onClick={() => onNavigate?.(prev)}>← {prev.title}</button> : null
                  })()}
                  {game.progression.nextId && (() => {
                    const next = GAMES.find(g => g.id === game.progression!.nextId)
                    return next ? <button className="prog-link prog-link-btn prog-link-next" onClick={() => onNavigate?.(next)}>{next.title} →</button> : null
                  })()}
                </div>
              </div>
            </div>
          )}
          <div className="gm-source">
            {game.sourceUrl
              ? <>Source: <a href={game.sourceUrl} target="_blank" rel="noopener noreferrer" className="source-link">▶ {game.source} ↗</a></>
              : `Source: ${game.source}`}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ LIBRARY ============
function LibraryPage({ onSelect, customGames, onAddGame, onDeleteGame, onUpdateGame }: { onSelect: (g: Game) => void; customGames: Game[]; onAddGame: (g: Game) => void; onDeleteGame: (id: string) => void; onUpdateGame: (g: Game) => void }) {
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [level, setLevel] = useState('all')
  const [type, setType] = useState('all')
  const [skillFilter, setSkillFilter] = useState<string>('all')
  const [focused, setFocused] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editGameData, setEditGameData] = useState<Game | null>(null)
  const customIds = new Set(customGames.map(g => g.id))

  const allGames = useMemo(() => [...GAMES, ...customGames], [customGames])

  const categoriesPresent = useMemo(() => {
    const s = new Set(allGames.map(g => g.category))
    return Object.entries(CATEGORY_META).filter(([k]) => s.has(k))
  }, [allGames])

  const filtered = useMemo(() => allGames.filter(g => {
    if (activeTab !== 'all' && g.category !== activeTab) return false
    if (level !== 'all' && g.level !== level) return false
    if (type !== 'all' && g.type !== type) return false
    if (skillFilter !== 'all' && !g.skills?.includes(skillFilter as Skill)) return false
    if (!gameMatchesSearch(g, search)) return false
    return true
  }), [allGames, activeTab, level, type, skillFilter, search])

  useEffect(() => {
    if (filtered.length === 0) {
      setFocused(null)
      return
    }
    const isDesktop = window.matchMedia('(min-width: 769px)').matches
    if (focused && !filtered.some(g => g.id === focused)) {
      setFocused(isDesktop ? filtered[0].id : null)
    } else if (!focused && isDesktop) {
      setFocused(filtered[0].id)
    }
  }, [filtered, focused])

  const focusedGame = useMemo(() => {
    if (!focused) return null
    return allGames.find(g => g.id === focused) || null
  }, [allGames, focused])

  return (<>
    <div className={`lib-layout ${focusedGame ? 'has-focus' : 'no-focus'}`}>
      <div className="lib-list-col">
        <div className="cat-tabs">
          <button className={`cat-tab ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>All games</button>
          {categoriesPresent.map(([k, v]) => (
            <button key={k} className={`cat-tab ${activeTab === k ? 'active' : ''}`} onClick={() => setActiveTab(k)} style={{ '--cat-color': v.color } as React.CSSProperties}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="lib-count-row">
          <span className="lib-count">{filtered.length} games</span>
          <input className="search-input lib-search" placeholder="Search title, objectives, win conditions, tags…" value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn-add-game" onClick={() => setShowForm(true)}>+ New Game</button>
        </div>
        <div className="skill-filter-row">
          <button className={`skill-chip ${skillFilter === 'all' ? 'active' : ''}`} onClick={() => setSkillFilter('all')}>All Skills</button>
          {SKILL_ORDER.map(s => (
            <button key={s} className={`skill-chip ${skillFilter === s ? 'active' : ''}`} onClick={() => setSkillFilter(s)} style={{ '--skill-color': SKILL_META[s].color } as React.CSSProperties}>
              {SKILL_META[s].label}
            </button>
          ))}
        </div>
        <div className="lib-list">
          {filtered.map((game, idx) => (
            <CompactGameItem key={game.id} game={game} index={idx} selected={focused === game.id} custom={customIds.has(game.id)} onClick={() => setFocused(game.id)} />
          ))}
        </div>
      </div>
      <div className="lib-detail-col">
        {focusedGame ? <GameDetailInline game={focusedGame} onClose={() => setFocused(null)} onEdit={() => setEditGameData(focusedGame)} onNavigate={(g) => setFocused(g.id)} /> : <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Select a game to see details</div>}
      </div>
    </div>
    {showForm && <GameForm onSave={(g) => { onAddGame(g); setShowForm(false) }} onClose={() => setShowForm(false)} />}
    {editGameData && <GameForm editGame={editGameData} onSave={(g) => {
      const isCustom = customIds.has(editGameData.id)
      if (isCustom) { onUpdateGame(g) } else { onAddGame({ ...g, id: `custom-${Date.now()}` }) }
      setEditGameData(null); setFocused(g.id)
    }} onClose={() => setEditGameData(null)} />}
  </>)
}

// ============ BUILDER ============
function BuilderPage({ sessions, setSessions, onSelect, editSession, onEditDone }: { sessions: SessionPlan[]; setSessions: (s: SessionPlan[]) => void; onSelect: (g: Game) => void; editSession: SessionPlan | null; onEditDone: () => void }) {
  const [title, setTitle] = useState(editSession?.title || 'New Session')
  const [levelB, setLevelB] = useState(editSession?.level || 'all-levels')
  const [focus, setFocus] = useState(editSession?.focus || '')
  const [notes, setNotes] = useState(editSession?.notes || '')
  const [slots, setSlots] = useState<SessionGame[]>(editSession?.games || [])
  const [sidebarSearch, setSidebarSearch] = useState('')
  const [sidebarCategory, setSidebarCategory] = useState('all')
  const [sidebarLevel, setSidebarLevel] = useState('all')
  const [sidebarType, setSidebarType] = useState('all')
  const [hoveredGame, setHoveredGame] = useState<Game | null>(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })

  const totalDuration = slots.reduce((s, g) => s + g.duration, 0)

  const addGame = (game: Game) => {
    if (slots.some(s => s.gameId === game.id)) return
    setSlots([...slots, { gameId: game.id, duration: 6 }])
  }
  const removeSlot = (idx: number) => setSlots(slots.filter((_, i) => i !== idx))
  const updateSlot = (idx: number, field: keyof SessionGame, value: any) => setSlots(slots.map((s, i) => i === idx ? { ...s, [field]: value } : s))

  const saveSession = () => {
    if (slots.length === 0) return
    const plan: SessionPlan = {
      id: `session-${Date.now()}`, title: title || 'Untitled', date: new Date().toISOString(),
      duration: totalDuration, level: levelB, focus, notes, games: slots,
    }
    setSessions([plan, ...sessions]); setSlots([]); setTitle('New Session'); setNotes(''); setFocus('')
    if (editSession) onEditDone()
  }

  const filteredSidebar = useMemo(() => GAMES.filter(g => {
    if (sidebarCategory !== 'all' && g.category !== sidebarCategory) return false
    if (sidebarLevel !== 'all' && g.level !== sidebarLevel) return false
    if (sidebarType !== 'all' && g.type !== sidebarType) return false
    if (!gameMatchesSearch(g, sidebarSearch)) return false
    return true
  }), [sidebarSearch, sidebarCategory, sidebarLevel, sidebarType])

  // Multi-suggestion engine: progression + balance + skill match + role flip
  const suggestions = useMemo(() => {
    if (slots.length === 0) return []
    return getSuggestions(slots.map(s => s.gameId), GAMES)
  }, [slots])

  // --- Smart Session Generator ---
  const [genDuration, setGenDuration] = useState(60)
  const [genLevel, setGenLevel] = useState('beginner')
  const [genFocus, setGenFocus] = useState('guard-passing')
  const [genResult, setGenResult] = useState<GeneratedSession | null>(null)

  const [genSeed, setGenSeed] = useState(0)

  const runGenerator = () => {
    const seed = Date.now()
    setGenSeed(seed)
    const result = generateSession(GAMES, { duration: genDuration, level: genLevel, focus: genFocus, seed })
    setGenResult(result)
  }

  const useGeneratedSession = () => {
    if (!genResult) return
    const newSlots = genResult.games.map(g => ({ gameId: g.gameId, duration: g.duration }))
    setSlots(newSlots)
    setLevelB(genLevel)
    setFocus(CATEGORY_META[genFocus]?.label || genFocus)
    setGenResult(null)
  }

  const swapGenGame = (index: number) => {
    if (!genResult) return
    const slot = genResult.games[index]
    const cat = GAMES.find(g => g.id === slot.gameId)?.category
    // Find an alternative game from same category, not already used
    const usedIds = new Set(genResult.games.map((g, i) => i !== index ? g.gameId : ''))
    const alt = GAMES.filter(g => g.category === cat && !usedIds.has(g.id) && g.id !== slot.gameId)
    if (alt.length === 0) return
    // Pick a random alternative (deterministic by sorting first)
    const sorted = alt.sort((a, b) => a.id.localeCompare(b.id))
    const replacement = sorted[Math.floor(Math.random() * Math.min(sorted.length, 5))]
    const newGames = [...genResult.games]
    newGames[index] = { ...slot, gameId: replacement.id, reason: `Swapped: ${replacement.title} (${replacement.level})` }
    setGenResult({ ...genResult, games: newGames })
  }

  return (
    <div className="builder-layout">
      <div className="builder-main">
        <div className="card session-header-card">
          <div><h2 style={{ fontSize: 20, fontWeight: 700 }}>Class Builder</h2></div>
          <div className="session-form">
            <div className="session-form-field"><label>Title</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Session title" /></div>
            <div className="session-form-field"><label>Level</label><select value={levelB} onChange={e => setLevelB(e.target.value)}>
              <option value="beginner">Beginner</option><option value="all-levels">All Levels</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
            </select></div>
            <div className="session-form-field"><label>Focus</label><input value={focus} onChange={e => setFocus(e.target.value)} placeholder="e.g. Guard passing" /></div>
            <div className="session-form-field"><label>Total</label><input value={`${totalDuration} min`} readOnly style={{ color: 'var(--accent)', fontWeight: 600 }} /></div>
            <div className="session-form-field session-form-field-full"><label>Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Session notes" /></div>
          </div>
        </div>
        {/* Smart Session Generator */}
        <div className="generator-panel">
          <div className="generator-header">
            <span className="generator-header-icon">✨</span>
            <span className="generator-header-title">Smart Session Generator</span>
          </div>
          <div className="generator-form">
            <div className="gen-field">
              <label>Duration (min)</label>
              <input type="number" value={genDuration} onChange={e => setGenDuration(parseInt(e.target.value) || 60)} min={30} max={120} step={5} />
            </div>
            <div className="gen-field">
              <label>Level</label>
              <select value={genLevel} onChange={e => setGenLevel(e.target.value)}>
                <option value="beginner">Beginner</option>
                <option value="all-levels">All Levels</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <div className="gen-field">
              <label>Focus</label>
              <select value={genFocus} onChange={e => setGenFocus(e.target.value)}>
                <option value="balanced">⚖️ Balanced (standing + guard + pinning)</option>
                {Object.entries(CATEGORY_META).filter(([k]) => GAMES.some(g => g.category === k)).map(([k, v]) => (
                  <option key={k} value={k}>{v.emoji} {v.label}</option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn btn-primary" onClick={runGenerator} style={{ width: '100%', marginTop: 12, justifyContent: 'center', padding: '10px 16px' }}>
            ✨ Generate Session
          </button>
          {genResult && (
            <div className="gen-result">
              <div className="gen-result-header">
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>Generated Session</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{genResult.totalDuration} min · {genResult.games.length} games</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={runGenerator} style={{ fontSize: 12, padding: '5px 12px' }}>↻ Regenerate</button>
                  <button className="btn btn-primary" onClick={useGeneratedSession} style={{ fontSize: 12, padding: '5px 12px' }}>Use This →</button>
                </div>
              </div>
              {(['warmup', 'standing', 'guard-passing', 'pinning'] as const).map(phase => {
                const phaseGames = genResult.games.map((g, i) => ({ ...g, _idx: i })).filter(g => g.phase === phase)
                if (phaseGames.length === 0) return null
                const phaseColors: Record<string, string> = { warmup: '#3b82f6', standing: '#f59e0b', 'guard-passing': 'var(--accent)', pinning: '#a855f7' }
                const phaseNames: Record<string, string> = { warmup: '🔵 Warm-up', standing: '🟡 Standing', 'guard-passing': '🟢 Guard Passing', pinning: '🟣 Pinning' }
                return (
                  <div key={phase} className="gen-phase" style={{ borderLeftColor: phaseColors[phase] }}>
                    <div className="gen-phase-label" style={{ color: phaseColors[phase] }}>{phaseNames[phase]}</div>
                    {phaseGames.map(g => {
                      const game = GAMES.find(gg => gg.id === g.gameId)
                      const cat = game ? CATEGORY_META[game.category] : null
                      return (
                        <div key={g._idx}>
                          <div className="gen-game-row">
                            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{g.duration}m</span>
                            {cat && <span style={{ fontSize: 13 }}>{cat.emoji}</span>}
                            <span className="gen-game-title" style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{game?.title || g.gameId}</span>
                            <button className="gen-swap-btn" onClick={() => swapGenGame(g._idx)}>↔ Swap</button>
                          </div>
                          <div className="gen-game-reason">{g.reason}</div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
              {genResult.warnings.length > 0 && (
                <div className="gen-warnings">
                  {genResult.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
                </div>
              )}
            </div>
          )}
          {!genResult && (
            <div className="gen-empty">Pick duration, level, and focus — then generate a CLA-structured session.</div>
          )}
        </div>
        <div className="session-slots">
          {slots.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">·</div><h3>No games selected</h3><p>Pick games from the sidebar.</p></div>
          ) : slots.map((slot, idx) => {
            const game = GAMES.find(g => g.id === slot.gameId)
            if (!game) return null
            return (
              <div key={idx} className="session-slot">
                <div className="session-slot-num">{idx + 1}</div>
                <div className="session-slot-info">
                  <div className="session-slot-title">{game.title}</div>
                  <div className="session-slot-cat">{CATEGORY_META[game.category]?.label}</div>
                </div>
                <div className="session-slot-duration">
                  <input type="number" value={slot.duration} onChange={e => updateSlot(idx, 'duration', parseInt(e.target.value) || 0)} min={1} max={30} /><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>min</span>
                </div>
                <button className="session-slot-remove" onClick={() => removeSlot(idx)}>✕</button>
              </div>
            )
          })}
        </div>
        {slots.length > 0 && (<div className="session-summary">
          <div className="summary-row"><span>Games</span><span>{slots.length}</span></div>
          <div className="summary-row"><span>Duration</span><span>{totalDuration} min</span></div>
          <div className="summary-row"><span>Categories</span><span>{new Set(slots.map(s => GAMES.find(g => g.id === s.gameId)?.category)).size}</span></div>
        </div>)}
        {suggestions.length > 0 && (
          <div className="suggest-panel">
            <div className="suggest-header">
              <span style={{ fontSize: 16 }}>💡</span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Suggested Games</span>
            </div>
            <div className="suggest-list">
              {suggestions.map(s => {
                const game = GAMES.find(g => g.id === s.gameId)
                if (!game) return null
                const cat = CATEGORY_META[game.category] || CATEGORY_META['submissions']
                const typeMeta: Record<string, { label: string; color: string }> = {
                  progression: { label: '🔗', color: 'var(--accent)' },
                  balance: { label: '⚖️', color: '#3b82f6' },
                  skill: { label: '🎯', color: '#a855f7' },
                  'role-flip': { label: '🔄', color: '#f59e0b' },
                }
                const tm = typeMeta[s.type]
                return (
                  <div key={s.gameId} className="suggest-card">
                    <span className="suggest-type-badge" style={{ '--badge-color': tm.color } as React.CSSProperties}>{tm.label}</span>
                    <div className="suggest-info">
                      <div className="suggest-title">{cat.emoji} {game.title}</div>
                      <div className="suggest-reason">{s.reason}</div>
                    </div>
                    <button className="suggest-add-btn" onClick={() => addGame(game)}>+ Add</button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {slots.length > 0 && <button className="btn btn-primary" onClick={saveSession} style={{ width: '100%', justifyContent: 'center', marginTop: 16, padding: '12px 20px' }}>Save Session — {slots.length} games, {totalDuration} min</button>}
        {editSession && <p style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>Editing a copy &quot;{editSession.title}&quot; — saving creates a new session</p>}
      </div>
      <aside className="builder-sidebar">
        <h3>Add Games</h3>
        <input className="search-input" style={{ marginBottom: 8 }} placeholder="Search all fields…" value={sidebarSearch} onChange={e => setSidebarSearch(e.target.value)} />
        <div className="builder-cat-tabs">
          <button className={`builder-cat-tab ${sidebarCategory === 'all' ? 'active' : ''}`} onClick={() => setSidebarCategory('all')}>All</button>
          {Object.entries(CATEGORY_META).filter(([k]) => GAMES.some(g => g.category === k)).map(([k, v]) => (
            <button key={k} className={`builder-cat-tab ${sidebarCategory === k ? 'active' : ''}`} onClick={() => setSidebarCategory(k)} style={{ '--cat-color': v.color } as React.CSSProperties}>
              <span style={{ fontSize: 13 }}>{v.emoji}</span> {v.label}
            </button>
          ))}
        </div>
        <div className="builder-filters">
          <select className="builder-select" value={sidebarLevel} onChange={e => setSidebarLevel(e.target.value)}>
            <option value="all">All Levels</option>
            <option value="beginner">Beginner</option>
            <option value="all-levels">All Levels</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
          <select className="builder-select" value={sidebarType} onChange={e => setSidebarType(e.target.value)}>
            <option value="all">All Types</option>
            <option value="continuous">Continuous</option>
            <option value="terminal">Terminal</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>
        <div className="builder-count">{filteredSidebar.length} games</div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filteredSidebar.map(game => {
            const cat = CATEGORY_META[game.category] || CATEGORY_META['submissions']
            return (
              <div key={game.id} className="builder-game-item" style={{ '--cat-color': cat.color } as React.CSSProperties}>
                <div className="builder-game-item-info" onClick={() => onSelect(game)} style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}>
                  <div className="builder-game-title">{game.title}</div>
                  <div className="builder-game-meta">
                    <span className={`mini-badge mini-level-${game.level}`}>{LEVEL_META[game.level]?.label}</span>
                    <span className={`mini-badge mini-type-${game.type}`}>{TYPE_META[game.type]?.label}</span>
                    {game.progression && <span className="mini-badge mini-prog">🔗 {game.progression.step}/{game.progression.totalSteps}</span>}
                  </div>
                </div>
                <div className="builder-item-actions">
                  <button className="builder-peek-btn"
                    onMouseEnter={(e) => { setHoveredGame(game); setHoverPos({ x: e.clientX, y: e.clientY }) }}
                    onMouseLeave={() => setHoveredGame(null)}>👁</button>
                  <button className="builder-add-btn" onClick={() => addGame(game)}>+ Add</button>
                </div>
              </div>
            )
          })}
        </div>
        {hoveredGame && (
          <div className="builder-hover-preview" style={{ position: 'fixed', left: Math.min(hoverPos.x, window.innerWidth - 340), top: Math.min(hoverPos.y, window.innerHeight - 300), zIndex: 500 }}>
            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>{hoveredGame.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>{hoveredGame.startingPosition}</div>
            {hoveredGame.players?.slice(0, 2).map((p: any, i: number) => (
              <div key={i} style={{ fontSize: 11, marginBottom: 4, color: i === 0 ? 'var(--accent)' : 'var(--orange)' }}>
                <strong>{p.role}</strong>: {p.objective} {p.winCondition && `🎯 ${p.winCondition}`}
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  )
}

// ============ SESSIONS ============
function SessionsPage({ sessions, setSessions, onCopyEdit }: { sessions: SessionPlan[]; setSessions: (s: SessionPlan[]) => void; onCopyEdit: (s: SessionPlan) => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (!menuOpenId) return
    const close = () => setMenuOpenId(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuOpenId])

  const deleteSession = (id: string) => setSessions(sessions.filter(s => s.id !== id))

  const getGame = (id: string) => GAMES.find(g => g.id === id)

  return (
    <div className="sessions-page">
      <h2 className="sessions-page-title">My Sessions</h2>
      <div className="saved-sessions">
        {sessions.map(s => (
          <div key={s.id} className="card saved-session-card" onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
            <div className="card-header">
              <div>
                <div className="card-title">{s.title} <span className="expand-icon">{expandedId === s.id ? '▾' : '▸'}</span></div>
                <div className="saved-session-meta"><span>{s.level}</span><span>·</span><span>{s.duration} min</span><span>·</span><span>{s.games.length} games</span></div>
              </div>
              <div className="session-menu-wrap">
                <button className="session-menu-btn" onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === s.id ? null : s.id) }}>⋮</button>
                {menuOpenId === s.id && <div className="session-menu-dropdown" onClick={e => e.stopPropagation()}>
                  <button onClick={() => { onCopyEdit(s); setMenuOpenId(null) }}>Copy & Edit</button>
                  <button className="danger" onClick={() => { deleteSession(s.id); setMenuOpenId(null) }}>Delete</button>
                </div>}
              </div>
            </div>
            {s.focus && <div className="session-focus">{s.focus}</div>}
            <div className="session-games-list">
              {s.games.map((sg, i) => {
                const g = getGame(sg.gameId)
                const cat = g ? CATEGORY_META[g.category] : null
                return (
                  <div key={i} className="sg-row">
                    <span className="sg-dur">{sg.duration}m</span>
                    {cat?.emoji && <span>{cat.emoji}</span>}
                    <span>{g?.title || sg.gameId}</span>
                    {sg.notes && <span className="sg-note">— {sg.notes}</span>}
                  </div>
                )
              })}
            </div>
            {expandedId === s.id && s.games.map((sg, i) => {
              const g = getGame(sg.gameId)
              if (!g) return null
              return (
                <div key={i} className="session-game-detail">
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{g.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{g.startingPosition}</div>
                  {g.players?.map((p: any, pi: number) => (
                    <div key={pi} style={{ fontSize: 11, marginBottom: 3, paddingLeft: 8, borderLeft: `2px solid ${pi === 0 ? 'var(--accent)' : 'var(--orange)'}` }}>
                      <strong>{p.role}</strong>: {p.objective}{p.winCondition && ` 🎯 ${p.winCondition}`}
                    </div>
                  ))}
                </div>
              )
            })}
            {s.notes && <div className="session-notes-box">{s.notes}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ============ GAME FORM ============
function GameForm({ onSave, onClose, editGame }: { onSave: (g: Game) => void; onClose: () => void; editGame?: Game | null }) {
  const [title, setTitle] = useState(editGame?.title || '')
  const [category, setCategory] = useState(editGame?.category || 'guard-passing')
  const [level, setLevel] = useState(editGame?.level || 'all-levels')
  const [type, setType] = useState(editGame?.type || 'mixed')
  const [source, setSource] = useState(editGame?.source || '')
  const [startingPosition, setStartingPosition] = useState(editGame?.startingPosition || '')
  const [constraints, setConstraints] = useState(editGame?.constraints?.join('\n') || '')
  const [rationale, setRationale] = useState(editGame?.designRationale || '')
  const [tags, setTags] = useState(editGame?.tags?.join(', ') || '')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const game: Game = {
      id: editGame?.id || `custom-${Date.now()}`, title: title.trim(), category, source: source || 'custom',
      level, type, startingPosition,
      players: editGame?.players || [{ role: 'Player 1', objective: 'Win', winCondition: 'Win', constraints: [] }],
      constraints: constraints.split('\n').filter(Boolean),
      designRationale: rationale, tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      skills: editGame?.skills || ['connection'],
      progression: editGame?.progression || null,
      sourceUrl: editGame?.sourceUrl || null,
    }
    onSave(game)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal game-form-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{editGame ? 'Edit Game' : '+ New Game'}</h2>
          <button className="modal-close" onClick={onClose} style={{ position: 'static' }}>✕</button>
        </div>
        <form onSubmit={submit}>
          <div className="gf-row-2">
            <div className="gf-field"><label>Title</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Game name" required /></div>
            <div className="gf-field"><label>Category</label><select value={category} onChange={e => setCategory(e.target.value)}>
              {Object.entries(CATEGORY_META).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
            </select></div>
          </div>
          <div className="gf-row-3">
            <div className="gf-field"><label>Level</label><select value={level} onChange={e => setLevel(e.target.value)}>
              <option value="beginner">Beginner</option><option value="all-levels">All Levels</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
            </select></div>
            <div className="gf-field"><label>Type</label><select value={type} onChange={e => setType(e.target.value)}>
              <option value="continuous">Continuous</option><option value="terminal">Terminal</option><option value="mixed">Mixed</option>
            </select></div>
            <div className="gf-field"><label>Source</label><input value={source} onChange={e => setSource(e.target.value)} placeholder="e.g. Seminar" /></div>
          </div>
          <div className="gf-field"><label>Starting Position</label><textarea value={startingPosition} onChange={e => setStartingPosition(e.target.value)} rows={2} /></div>
          <div className="gf-field"><label>Constraints (one per line)</label><textarea value={constraints} onChange={e => setConstraints(e.target.value)} rows={2} /></div>
          <div className="gf-field"><label>Design Rationale</label><textarea value={rationale} onChange={e => setRationale(e.target.value)} rows={2} /></div>
          <div className="gf-field"><label>Tags (comma separated)</label><input value={tags} onChange={e => setTags(e.target.value)} /></div>
          <div className="gf-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Game</button>
          </div>
        </form>
      </div>
    </div>
  )
}
