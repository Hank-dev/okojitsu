import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync('src/index.css', 'utf8')
const sessionsCss = readFileSync('src/sessions.css', 'utf8')
const reader = readFileSync('src/FieldManualPage.tsx', 'utf8')
const sessionsPage = readFileSync('src/SessionsPage.tsx', 'utf8')
const app = readFileSync('src/App.tsx', 'utf8')
const types = readFileSync('src/types.ts', 'utf8')
const games = JSON.parse(readFileSync('src/data/games.json', 'utf8'))

test('locks all large surface tokens to pure black', () => {
  for (const token of ['bg-primary', 'bg-secondary', 'bg-card', 'bg-elevated']) {
    assert.match(css, new RegExp(`--${token}:\\s*#000000;`))
  }
})

test('locks the approved Field Manual palette', () => {
  assert.match(css, /--text-primary:\s*#f0f1ed;/i)
  assert.match(css, /--text-secondary:\s*#858585;/i)
  assert.match(css, /--border-light:\s*#252525;/i)
  assert.match(css, /--accent:\s*#00ec83;/i)
  assert.match(css, /--field-note:\s*#ceb978;/i)
})

test('does not add generic field-reference text beneath manual images', () => {
  assert.doesNotMatch(reader, /<figcaption>Field reference<\/figcaption>/)
})

test('labels quoted theory passages as quotes instead of field notes', () => {
  assert.match(reader, /<span>Quote<\/span>/)
  assert.doesNotMatch(reader, /<span>Field note<\/span>/)
})

test('includes responsive, focus, and reduced-motion contracts', () => {
  assert.match(css, /\.field-manual-mobile/)
  assert.match(css, /\.field-manual-chapter:focus-visible/)
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/)
})

test('locks mobile header controls to 44px touch targets', () => {
  assert.match(css, /@media\s*\(max-width:\s*768px\)[\s\S]*?\.hamburger\s*\{[^}]*width:\s*44px[^}]*height:\s*44px[^}]*min-height:\s*44px/)
  assert.match(css, /@media\s*\(max-width:\s*768px\)[\s\S]*?\.admin-control\s*\{[^}]*min-height:\s*44px/)
})

test('does not show the hover-only game preview control on mobile', () => {
  assert.match(css, /@media\s*\(max-width:\s*768px\)[\s\S]*?\.builder-peek-btn\s*\{[^}]*display:\s*none\s*!important;/s)
})

test('keeps every class-builder category reachable from Add Games', () => {
  assert.match(app, /<BuilderPage[\s\S]*?games=\{ALL_GAMES\}/)
  assert.match(app, /<label className="builder-category-filter">[\s\S]*?<select className="builder-category-select" value=\{sidebarCategory\}/)
  assert.match(app, /builderCategories\.map\(\(\[key, category\]\) =>/)
  assert.match(css, /\.builder-category-filter\s*\{[^}]*display:\s*grid;/s)
  assert.match(css, /\.builder-category-select\s*\{[^}]*min-height:\s*44px;/s)
})

test('lets coaches create and add a published game from the Class Builder', () => {
  assert.match(app, /<BuilderPage[\s\S]*?onRefreshGames=\{refreshSharedGames\}/)
  const builder = app.slice(app.indexOf('function BuilderPage'), app.indexOf('// ============ SESSIONS ============'))
  assert.match(builder, /Create game/)
  assert.match(builder, /createGameDraft\(createBlankGameDraft\(`draft-\$\{crypto\.randomUUID\(\)\}`\)\)/)
  assert.match(builder, /await onRefreshGames\(\)/)
  assert.match(builder, /\{ gameId: game\.id, duration: 6 \}/)
  assert.match(builder, /activeDraft && <GameForm/)
  assert.match(css, /\.builder-create-game\s*\{[^}]*min-height:\s*36px;/s)
})

test('lets the new game form create a category with a name and emoji', () => {
  const gameForm = app.slice(app.indexOf('function GameForm'))
  assert.match(gameForm, /Create new category/)
  assert.match(gameForm, /Category name/)
  assert.match(gameForm, /Emoji/)
})

test('uses optional task focus labels for each player', () => {
  const gameForm = app.slice(app.indexOf('function GameForm'))
  assert.match(gameForm, /Task focus and Constraints are optional for each player/)
  assert.match(gameForm, /htmlFor=\{`gf-task-focus-\$\{index\}`\}>Task focus<\/label>/)
  assert.match(gameForm, /id=\{`gf-task-focus-\$\{index\}`\}[\s\S]*?rows=\{3\} \/>/)
  assert.doesNotMatch(gameForm, /Main objective/)
  assert.doesNotMatch(gameForm, /<textarea id=\{`gf-task-focus-\$\{index\}`\}[^>]*\brequired/)
  assert.match(app, /aria-label="Player task focus"/)
  assert.match(sessionsPage, /session-detail-label">Task focus<\/span>/)
  assert.doesNotMatch(sessionsPage, /Main objective/)
})

test('keeps the game catalog beginner-only and removes retired level choices', () => {
  assert.ok(games.length > 0)
  assert.deepEqual(new Set(games.map(game => game.level)), new Set(['beginner']))
  assert.doesNotMatch(types, /['"]intermediate['"]\s*:/)
  assert.doesNotMatch(types, /['"]advanced['"]\s*:/)
  assert.doesNotMatch(app, /<option value="intermediate">/)
  assert.doesNotMatch(app, /<option value="advanced">/)
})

test('shows all training-library categories on desktop without horizontal scrolling', () => {
  assert.match(css, /\.atlas-categories\s*\{[^}]*overflow-x:\s*auto;/s)
  assert.match(css, /@media\s*\(min-width:\s*769px\)[\s\S]*?\.atlas-categories\s*\{[^}]*flex-wrap:\s*wrap;[^}]*overflow-x:\s*visible;/s)
})

test('does not publish the Hidden Logic theory article', () => {
  assert.match(app, /const THEORY_FULL = \(theoryFullData as ManualArticle\[\]\)\.filter\(article => article\.id !== 'hidden-logic'\)/)
  assert.match(app, /<FieldManualPage articles=\{THEORY_FULL\} mode="theory" \/>/)
})

test('connects the class UI to the shared session service with a recoverable migration path', () => {
  assert.match(app, /from ['"]\.\/sessionApi['"]/)
  assert.match(app, /fetchSharedSessions\(\)/)
  assert.match(app, /createSessionDraft\(/)
  assert.match(app, /importSharedSessions\(legacySessionImport\.sessions\)/)
  assert.doesNotMatch(app, /function saveSessions\(/)
  assert.match(sessionsPage, /Publish local sessions/)
  assert.match(sessionsPage, /Try again/)
  assert.match(sessionsPage, /onDeleteSession\(active\.id\)/)
  assert.match(sessionsCss, /\.shared-sessions-notice\s*\{[^}]*border:1px solid var\(--border\)/s)
})

test('exposes the live session draft workbench to administrators', () => {
  assert.match(app, /Start a shared session/)
  assert.match(app, /Live session drafts/)
  assert.match(app, /useLiveSessionDraft/)
  assert.match(app, /createSessionDraftFromSession/)
  assert.match(app, /Publish session/)
  assert.match(app, /Discard/)
  assert.match(sessionsPage, /Live session drafts/)
  assert.match(sessionsPage, /Start shared session/)
})

test('loads custom games and categories from shared storage across pages', () => {
  assert.match(app, /fetchSharedGames\(\)/)
  assert.match(app, /importSharedGames\(gamesToImport, categoriesToImport\)/)
  assert.match(app, /<BuilderPage[\s\S]*?games=\{ALL_GAMES\}/)
  assert.doesNotMatch(app, /localStorage\.setItem\(CUSTOM_GAMES_KEY/)
  assert.doesNotMatch(app, /localStorage\.setItem\(CUSTOM_CATEGORIES_KEY/)
})

test('gives admins a private entry point to active shared game drafts', () => {
  assert.match(app, /Live drafts/)
  assert.match(app, /fetchGameDrafts\(\)/)
  assert.match(app, /createGameDraft\(/)
})

test('labels the collaborative form and exposes publish and discard controls', () => {
  const gameForm = app.slice(app.indexOf('function GameForm'))
  assert.match(gameForm, /Live draft/)
  assert.match(gameForm, /Publish game/)
  assert.match(gameForm, /Discard draft/)
})

test('keeps only the latest live-draft request eligible to open', () => {
  const library = app.slice(app.indexOf('function LibraryPage'), app.indexOf('// ============ BUILDER'))
  for (const action of ['openNewDraft', 'openEditDraft', 'openExistingDraft']) {
    const start = library.indexOf(`const ${action}`)
    const end = library.indexOf('\n  const ', start + 1)
    const block = library.slice(start, end === -1 ? undefined : end)
    assert.match(block, /const requestId = \+\+liveDraftRequestIdRef\.current/)
    assert.match(block, /if \(requestId !== liveDraftRequestIdRef\.current\) return/)
  }
  assert.match(library, /const closeActiveDraft = \(\) => \{\s*liveDraftRequestIdRef\.current \+= 1\s*setActiveDraft\(null\)/s)
  assert.match(library, /onClose=\{closeActiveDraft\}/)
  assert.match(library, /const handleDraftTerminal[\s\S]*?closeActiveDraft\(\)/)
})

test('keeps Live drafts refreshes latest-request-wins and cleanup-safe', () => {
  const library = app.slice(app.indexOf('function LibraryPage'), app.indexOf('// ============ BUILDER'))
  const refreshStart = library.indexOf('const refreshLiveDrafts = useCallback')
  const refreshEnd = library.indexOf('\n  useEffect', refreshStart)
  const refresh = library.slice(refreshStart, refreshEnd)
  const effectStart = library.indexOf('useEffect(() => {\n    if (!isAdmin)', refreshEnd)
  const effect = library.slice(effectStart, library.indexOf('\n  const openNewDraft', effectStart))

  assert.match(library, /const liveDraftRefreshRequestIdRef = useRef\(0\)/)
  assert.match(library, /const liveDraftRefreshMountedRef = useRef\(false\)/)
  assert.match(refresh, /const requestId = \+\+liveDraftRefreshRequestIdRef\.current/)
  assert.equal((refresh.match(/requestId !== liveDraftRefreshRequestIdRef\.current/g) || []).length, 2)
  assert.match(refresh, /if \(!isAdmin \|\| !liveDraftRefreshMountedRef\.current \|\| requestId !== liveDraftRefreshRequestIdRef\.current\) return/)
  assert.match(effect, /liveDraftRefreshMountedRef\.current = false/)
  assert.match(effect, /liveDraftRefreshRequestIdRef\.current \+= 1/)
  assert.match(effect, /return \(\) => \{\s*liveDraftRefreshMountedRef\.current = false\s*liveDraftRefreshRequestIdRef\.current \+= 1\s*window\.clearInterval\(interval\)/s)
})

test('syncs live pending-category mode without interrupting an active category field', () => {
  const gameForm = app.slice(app.indexOf('function GameForm'))
  assert.match(gameForm, /const isEditingPendingCategoryRef = useRef\(false\)/)
  assert.match(gameForm, /useEffect\(\(\) => \{\s*if \(isEditingPendingCategoryRef\.current\) return\s*setIsCreatingCategory\(liveDraft\.draft\.pendingCategory !== null\)\s*\}, \[liveDraft\.draft\.pendingCategory\]\)/s)
  assert.match(gameForm, /const beginPendingCategoryField = \(path: 'pendingCategory\.label' \| 'pendingCategory\.emoji'\) => \{\s*isEditingPendingCategoryRef\.current = true\s*liveDraft\.beginField\(path\)/s)
  assert.match(gameForm, /const endPendingCategoryField = \(path: 'pendingCategory\.label' \| 'pendingCategory\.emoji'\) => \{\s*isEditingPendingCategoryRef\.current = false\s*liveDraft\.endField\(path\)/s)
  assert.match(gameForm, /onFocus=\{\(\) => beginPendingCategoryField\('pendingCategory\.label'\)\}/)
  assert.match(gameForm, /onBlur=\{\(\) => endPendingCategoryField\('pendingCategory\.emoji'\)\}/)
})

test('gives only the live-draft close control a 44px target', () => {
  const gameForm = app.slice(app.indexOf('function GameForm'))
  assert.match(gameForm, /className="modal-close live-draft-close"/)
  assert.match(css, /\.live-draft-close\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/s)
})

test('uses a left drag handle instead of arrows to reorder class games', () => {
  assert.match(app, /from ['"]@dnd-kit\/core['"]/)
  assert.match(app, /from ['"]@dnd-kit\/sortable['"]/)
  assert.match(app, /PointerSensor/)
  assert.match(app, /KeyboardSensor/)
  assert.match(app, /sortableKeyboardCoordinates/)
  assert.match(app, /className="session-slot-drag-handle"/)
  assert.match(app, /aria-label=\{`Drag \$\{game\.title\} to reorder`\}/)
  assert.doesNotMatch(app, /session-slot-order/)
  assert.match(css, /\.session-slot-drag-handle\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px[^}]*touch-action:\s*none;/s)
  assert.match(css, /\.session-slot-drag-handle:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/s)
  assert.match(css, /\.session-slot-drag-dots span\s*\{[^}]*border-radius:\s*50%/s)
})

test('drains the live draft before every normal close surface dismisses the form', () => {
  const gameForm = app.slice(app.indexOf('function GameForm'))
  assert.match(gameForm, /const closeInFlightRef = useRef\(false\)/)
  assert.match(gameForm, /const handleClose = async \(\) => \{\s*if \(closeInFlightRef\.current\) return\s*closeInFlightRef\.current = true[\s\S]*?const drained = await liveDraft\.close\(\)[\s\S]*?if \(drained\) \{\s*onClose\(\)\s*return\s*\}[\s\S]*?closeInFlightRef\.current = false/s)
  assert.match(gameForm, /const closeFromBackdrop = \(event: React\.PointerEvent<HTMLDivElement>\) => \{\s*if \(event\.target === event\.currentTarget\) void handleClose\(\)\s*\}/s)
  assert.match(gameForm, /<div className="modal-overlay" onPointerDown=\{closeFromBackdrop\}>/)
  assert.match(gameForm, /<button className="modal-close live-draft-close"[\s\S]*?onClick=\{\(\) => void handleClose\(\)\}[\s\S]*?aria-label="Close live draft"/)
  assert.match(gameForm, /className="btn btn-secondary" onClick=\{\(\) => void handleClose\(\)\}>Close<\/button>/)
  assert.doesNotMatch(gameForm, /<div className="modal-overlay" onClick=\{onClose\}>/)
})

test('uses line and typography hierarchy instead of shadows and tinted active navigation', () => {
  assert.match(css, /--shadow-card:\s*none;/)
  assert.match(css, /--shadow-elevated:\s*none;/)
  assert.match(css, /\.nav-item\.active\s*{[^}]*border-bottom:\s*1px solid var\(--accent\)/s)
  assert.match(css, /\.card\s*{[^}]*background:\s*#000000/s)
})

test('renders a selected session as one continuous timeline instead of nested cards', () => {
  assert.match(sessionsCss, /\.session-timeline\s*\{[^}]*position:\s*relative;?/s)
  assert.match(sessionsCss, /\.session-timeline::before\s*\{[^}]*content:\s*['"][^'"]*['"]/s)
  assert.match(sessionsCss, /\.session-timeline-item\s*\{[^}]*border:\s*0;[^}]*border-bottom:\s*1px solid var\(--border\)/s)
  assert.match(sessionsCss, /\.session-game-panel\s*\{[^}]*border-top:\s*1px solid var\(--border\);[^}]*background:\s*transparent;?/s)
  assert.match(sessionsCss, /\.session-player\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;?/s)
  assert.match(sessionsCss, /\.session-player\s*\+\s*\.session-player\s*\{[^}]*border-left:\s*1px solid var\(--border\);?/s)
})

test('keeps reachable large surfaces flat black and free of gradients', () => {
  assert.match(css, /\.gm-title-bar\s*{[^}]*background:\s*#000000;/s)
  assert.doesNotMatch(`${css}\n${sessionsCss}`, /(?:linear|radial|conic)-gradient\s*\(/i)
})

test('uses the canonical Signal token for legacy accent states', () => {
  assert.doesNotMatch(`${css}\n${sessionsCss}`, /#00ff88|rgba\(\s*0\s*,\s*255\s*,\s*136\b/i)
  assert.match(css, /\.manual-principle > span\s*\{[^}]*color:\s*var\(--accent\)/s)
  assert.doesNotMatch(css, /\.manual-article-index strong\s*\{[^}]*var\(--field-note\)/s)
})

test('keeps coaching articles free of bordered card surfaces', () => {
  for (const selector of ['manual-concept-pair > div', 'manual-field-note', 'manual-emphasis', 'manual-callout']) {
    const selectorPattern = selector.replaceAll(' ', '\\s*')
    assert.match(css, new RegExp(`\\.field-manual-coaching \\.${selectorPattern}\\s*\\{[^}]*border:\\s*0[^}]*background:\\s*transparent`, 's'))
  }
})

test('exposes progressbar semantics and anchored heading focus', () => {
  assert.match(reader, /role="progressbar"/)
  assert.match(reader, /aria-valuemin=\{0\}/)
  assert.match(reader, /aria-valuemax=\{navigation\.total\}/)
  assert.match(reader, /aria-valuenow=\{navigation\.index \+ 1\}/)
  assert.match(css, /\.manual-section-heading a:focus-visible/)
  assert.match(css, /\.manual-subheading a:focus-visible/)
  assert.match(css, /\.manual-step a:focus-visible/)
  assert.match(css, /\.manual-section-heading[^{,]*,\s*\.manual-subheading[^{,]*,\s*\.manual-step[^}]*scroll-margin-top:/s)
})

test('integrates accessible run-dialog timer controls and lifecycle guards', () => {
  assert.match(sessionsPage, /from ['"]\.\/sessionTimer['"]/) 
  for (const helper of ['TimerState', 'addMinute', 'createTimerState', 'formatRemainingTime', 'markCompletionSignaled', 'pauseTimer', 'resetTimer', 'sampleTimer', 'startTimer']) {
    assert.match(sessionsPage, new RegExp(`\\b${helper}\\b`))
  }
  assert.match(sessionsPage, /aria-label="Game timer"/)
  assert.match(sessionsPage, /className="btn btn-primary session-run-timer-toggle"[\s\S]*?aria-label=\{timer\.status === 'running' \? 'Pause timer' : 'Start timer'\}/)
  assert.match(sessionsPage, /className="btn btn-secondary session-run-timer-add"[\s\S]*?aria-label="Add one minute"[\s\S]*?>\+1</)
  assert.match(sessionsPage, /className="btn btn-secondary session-run-timer-reset"[\s\S]*?aria-label="Reset timer"[\s\S]*?>↻</)
  assert.doesNotMatch(sessionsPage, />Start<\/button>/)
  assert.doesNotMatch(sessionsPage, />Pause<\/button>/)
  assert.match(sessionsPage, /createTimerState\(runItem\.duration\)/)
  assert.match(sessionsPage, /Date\.now\(\)/)
  assert.match(sessionsPage, /navigator\.vibrate/)
  assert.match(sessionsPage, /AudioContext/)
  assert.match(sessionsPage, /(?:clearInterval|cancelAnimationFrame)/)
  assert.match(sessionsPage, /markCompletionSignaled/)
  assert.match(sessionsPage, /\}, \[changeRunGame, closeRun, runGameIndex, timeline\.length\]\)/)
})

test('uses a louder, longer completion alarm with patterned vibration', () => {
  assert.match(sessionsPage, /const ALARM_PEAK_GAIN = 0\.42/)
  assert.match(sessionsPage, /const ALARM_DURATION_SECONDS = 2\.4/)
  assert.match(sessionsPage, /const ALARM_VIBRATION_PATTERN = \[300, 120, 300, 120, 600, 150, 600\]/)
  assert.match(sessionsPage, /gain\.gain\.exponentialRampToValueAtTime\(ALARM_PEAK_GAIN, pulseStart \+ 0\.04\)/)
  assert.match(sessionsPage, /oscillator\.stop\(now \+ ALARM_DURATION_SECONDS\)/)
  assert.match(sessionsPage, /navigator\.vibrate\?\.\(ALARM_VIBRATION_PATTERN\)/)
})

test('does not repeat default player role names in game cards', () => {
  assert.match(sessionsPage, /player\.role\.trim\(\) !== `Player \$\{index \+ 1\}` && <h4>\{player\.role\}<\/h4>/)
})

test('places the game timer below the game description', () => {
  const descriptionIndex = sessionsPage.indexOf('<div className="session-run-start">')
  const playerTasksIndex = sessionsPage.indexOf('<div className="session-player-grid session-run-players">')
  const timeIndex = sessionsPage.indexOf('<div className="session-run-time">')
  const timerIndex = sessionsPage.indexOf('<section className="session-run-timer"')
  assert.ok(descriptionIndex >= 0, 'game description should be rendered')
  assert.ok(playerTasksIndex > descriptionIndex, 'player tasks should follow the starting position')
  assert.ok(timeIndex > playerTasksIndex, 'game timing summary should follow all game details')
  assert.ok(timerIndex > playerTasksIndex, 'timer should follow all game details')
  assert.ok(timerIndex > timeIndex, 'countdown timer should follow the game timing summary')
})

test('keeps run-dialog focus stable while refreshing keyboard navigation', () => {
  assert.match(sessionsPage, /const runOverlayOpen = runItem !== null/)
  assert.match(sessionsPage, /useEffect\(\(\) => \{\s*if \(runOverlayOpen\) runDialogRef\.current\?\.focus\(\)\s*\}, \[runOverlayOpen\]\)/s)
  const keyboardEffect = sessionsPage.match(/useEffect\(\(\) => \{\s*if \(runGameIndex === null\) return[\s\S]*?\}, \[changeRunGame, closeRun, runGameIndex, timeline\.length\]\)/)?.[0] ?? ''
  assert.doesNotMatch(keyboardEffect, /runDialogRef\.current\?\.focus\(\)/)
})

test('announces meaningful timer actions without putting ticking digits in a live region', () => {
  assert.match(sessionsPage, /const \[timerAnnouncement, setTimerAnnouncement\] = useState\(''\)/)
  assert.match(sessionsPage, /aria-live="polite"\s+aria-atomic="true"[^>]*>\{timerAnnouncement\}/s)
  assert.match(sessionsPage, /setTimerAnnouncement\(`Started\./)
  assert.match(sessionsPage, /setTimerAnnouncement\(`Paused\./)
  assert.match(sessionsPage, /setTimerAnnouncement\(`Reset\./)
  assert.match(sessionsPage, /setTimerAnnouncement\(`Added one minute\./)
  assert.doesNotMatch(sessionsPage, /<span className="session-run-timer-digits"[^>]*aria-live/)
})

test('guards completion signaling to the active run generation', () => {
  assert.match(sessionsPage, /const \[timerRunKey, setTimerRunKey\] = useState\('closed'\)/)
  assert.match(sessionsPage, /const activeTimerRunRef = useRef<\{ runKey: string; generation: number \} \| null>\(null\)/)
  assert.match(sessionsPage, /!runItem[\s\S]*runKey === 'closed'[\s\S]*timerRunKey !== runKey/)
  assert.match(sessionsPage, /activeRun\.runKey !== runKey/)
  assert.match(sessionsPage, /timerGenerationRef\.current !== generation/)
  assert.match(sessionsPage, /\}, \[playCompletionSignal, runItem, runKey, timerRunKey, timer\.completionSignaled, timer\.hasStarted, timer\.status\]\)/)
})

test('locks phone-first timer presentation and responsive accessibility contracts', () => {
  assert.match(sessionsCss, /\.session-run-timer\s*\{[^}]*display:\s*grid;[^}]*min-width:\s*0;/s)
  assert.match(sessionsCss, /\.session-run-timer-digits\s*\{[^}]*color:\s*var\(--accent\);[^}]*font:[^;]*var\(--font-mono\);[^}]*font-variant-numeric:\s*tabular-nums;/s)
  assert.match(sessionsCss, /\.session-run-timer-controls\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/s)
  assert.match(sessionsCss, /\.session-run-timer-controls button\s*\{[^}]*min-width:\s*44px;/s)
  assert.match(sessionsCss, /\.session-run-timer-controls button\s*\{[^}]*min-height:\s*44px;/s)
  assert.match(sessionsCss, /\.session-run-timer-controls button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\);/s)
  assert.match(sessionsCss, /\.session-run-timer-controls button:disabled\s*\{[^}]*opacity:\s*\.45;/s)
  assert.match(sessionsCss, /@media\s*\(max-width:\s*800px\)[\s\S]*?\.session-run-timer\s*\{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;/s)
  assert.match(sessionsCss, /@media\s*\(max-width:\s*800px\)[\s\S]*?\.session-run-timer-controls\s*\{[^}]*width:\s*auto;/s)
  assert.match(sessionsCss, /@media\s*\(max-width:\s*800px\)[\s\S]*?\.session-run-timer-controls button\s*\{[^}]*flex:\s*0 0 auto;[^}]*width:\s*auto;/s)
  assert.match(sessionsCss, /@media\s*\(forced-colors:\s*active\)/)
  assert.match(sessionsCss, /@media\s*\(forced-colors:\s*active\)[\s\S]*?\.session-run-timer\s*\{[^}]*border-color:\s*CanvasText;/s)
  assert.match(sessionsCss, /@media\s*\(forced-colors:\s*active\)[\s\S]*?\.session-run-timer-status[^}]*color:\s*CanvasText;/s)
  assert.match(sessionsCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.session-run-timer[^}]*transition:\s*none\s*!important;/s)
  assert.match(sessionsCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.session-run-timer-controls button:hover\s*\{[^}]*transform:\s*none\s*!important;/s)
})
