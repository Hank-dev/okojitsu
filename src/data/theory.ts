export interface TheorySection {
  id: string;
  title: string;
  emoji: string;
  content: TheoryBlock[];
}

export interface TheoryBlock {
  type: 'heading' | 'paragraph' | 'list' | 'quote' | 'table' | 'callout';
  text?: string;
  items?: string[];
  quote?: string;
  source?: string;
  rows?: string[][];
  headers?: string[];
  variant?: 'info' | 'warning' | 'key';
}

export const THEORY_SECTIONS: TheorySection[] = [
  {
    id: 'intro',
    title: 'Enter the Real Game',
    emoji: '💊',
    content: [
      { type: 'quote', quote: 'Are you willing to consider that everything you think you know about training is wrong? Not some of it. Everything.', source: 'Morpheus' },
      { type: 'paragraph', text: 'You\'ve felt it, haven\'t you. It\'s there — like a splinter in your mind. Something you can\'t quite name. You drill the movement perfectly, and then the moment someone actually resists, it dissolves. You memorize the system, and then the match arrives and the system is nowhere to be found.' },
      { type: 'paragraph', text: 'What if skill was never something you store? Never something you retrieve? What if it was always something that emerges — alive, relational, inseparable from the body in front of you and the chaotic struggle.' },
      { type: 'paragraph', text: 'What if the map was never the territory? And what if every instructional ever sold to you was just someone else\'s map.' },
      { type: 'callout', variant: 'key', text: 'There is another way. A way that begins not with technique but with cause and effect. Not with memory but with perception. Not with what you\'ve been told to do — but with what two bodies, in genuine unscripted struggle, inevitably discover together.' },
    ]
  },
  {
    id: 'theory-matters',
    title: 'Does Theory Matter?',
    emoji: '📖',
    content: [
      { type: 'heading', text: 'For the coach: theory is non-negotiable' },
      { type: 'paragraph', text: 'Beliefs inform action. If you think the brain is a computer that stores information, you\'ll coach one way. If you think it\'s a modeling system that builds behavior through interaction with the environment, you\'ll coach in a completely different way. Every coach has a theory — the question is whether it\'s examined or inherited.' },
      { type: 'paragraph', text: 'A coach has to be able to define the concepts they\'re working with. Without theory, you can\'t design practice — you can only copy what was done to you. The whole job of a coach is to create new behavior in someone who doesn\'t have it yet.' },
      { type: 'heading', text: 'For the student: not strictly required' },
      { type: 'paragraph', text: 'Students do not need to know the framework to practice. They need rich opportunities for action, not lectures on direct perception. In the room, the language is human language: push, rotate, turn, stand, squeeze, get behind your partner.' },
      { type: 'callout', variant: 'info', text: 'The science only informs how the coach designs the practice; it doesn\'t have to be spoken to the student to work.' },
      { type: 'heading', text: 'The bottom line' },
      { type: 'paragraph', text: 'Theory is for the coach. For students, the practice itself is the teacher. Offer the theory to those who want it, but never assume understanding the framework is what produces the skill. The skill comes from interacting with the live environment.' },
    ]
  },
  {
    id: 'what-is-bjj',
    title: 'What is BJJ?',
    emoji: '🤼',
    content: [
      { type: 'paragraph', text: 'BJJ is fundamentally the game of immobilization as it leads to strangulation and breaking.' },
      { type: 'paragraph', text: 'To immobilize an opponent, you must first attack the periphery — the head, arms, and legs — in order to gain access to center mass (hips, chest, shoulders, and back). Once you control center mass, you immobilize it, which then allows you to isolate, immobilize, and reattach the periphery to finish.' },
      { type: 'heading', text: 'The Foundational Skills' },
      { type: 'list', items: [
        'Connection — making and maintaining physical contact',
        'Distance management — controlling space through segmentation',
        'Destabilization — breaking your opponent\'s base and structure',
        'Immobilization — pinning and controlling your opponent\'s body',
        'Isolation — separating the target limb from everything that can defend it',
      ]},
    ]
  },
  {
    id: 'ecological-approach',
    title: 'The Ecological Approach',
    emoji: '🌳',
    content: [
      { type: 'paragraph', text: 'Based on Rob Gray — Perception Action Podcast. Skillful movement is not about storing techniques in the brain, but about developing a relationship between the athlete and their environment.' },
      { type: 'heading', text: 'Core Principles' },
      { type: 'list', items: [
        'Athlete-environment symmetry: Skill emerges from the interaction, not from mental models stored in the head',
        'Information-movement coupling: Athletes attach movement to specifying information from the environment',
        'Self-organization: Rather than prescribing one correct technique, the body finds its own solutions within constraints',
        'Repetition without repetition (Bernstein): Repeat a good outcome without repeating the same movement',
        'Affordances: Athletes perceive opportunities for action directly from the environment',
      ]},
      { type: 'heading', text: 'Two Approaches Compared' },
      { type: 'table', headers: ['Aspect', 'Information Processing', 'Ecological Approach'], rows: [
        ['Perception', 'Indirect — cues must be interpreted', 'Direct — information specifies what to do'],
        ['Action control', 'Predictive, based on internal models', 'Prospective, online adjustment via control laws'],
        ['Skill', 'Stored motor programs', 'Emerges through self-organization'],
        ['Coaching', 'Prescribe technique, correct errors', 'Destabilize ineffective solutions, guide exploration'],
        ['Variability', 'Added later, for adjustability', 'Added early, for adaptability'],
        ['Expertise', 'Knowledge about (in your head)', 'Knowledge of (in the relationship)'],
        ['Decomposition', 'Effective — modules trained separately', 'Counterproductive — perception and action inseparable'],
      ]},
    ]
  },
  {
    id: 'cla-theory',
    title: 'Constraints-Led Approach (CLA)',
    emoji: '🍃',
    content: [
      { type: 'paragraph', text: 'As explained by Greg Souders. CLA stands for Constraints-Led Approach, rooted in Ecological Dynamics — behavior emerges from the interaction between the individual, the task, and the environment.' },
      { type: 'callout', variant: 'key', text: 'Perception and action are constantly feeding each other. You perceive something, you act, that action changes what you perceive, and so on. Skill emerges from this loop — not from memorizing steps.' },
      { type: 'heading', text: 'What are constraints?' },
      { type: 'paragraph', text: 'Constraints are things that limit options. Tie one hand behind your back and you can only reach for a cup one way. Constraints aren\'t special tricks — they\'re always present (height, experience, strength). The CLA uses them deliberately to shape behavior.' },
      { type: 'heading', text: 'How is this different from traditional BJJ?' },
      { type: 'table', headers: ['Traditional', 'CLA'], rows: [
        ['Show technique → drill statically → situational sparring', 'Live work almost exclusively → constraints around invariants'],
        ['Curriculum-driven, technique-of-the-day', 'No curriculum, no template — real-time adjustment'],
        ['80% drilling, 20% rolling', '80%+ live rolling, minimal or zero drilling'],
        ['Coach as information deliverer', 'Coach as guide and facilitator'],
      ]},
      { type: 'heading', text: 'What are invariant features?' },
      { type: 'paragraph', text: 'An invariant feature is something that never changes, no matter who performs the skill or how. Example: no matter how you get an armlock from mount, you always have to move the opponent\'s elbow to transition from parallel to perpendicular. The elbow is the invariant.' },
      { type: 'callout', variant: 'info', text: 'Instead of teaching "the armlock technique," design a drill where the top player\'s job is simply: get your partner\'s elbow to touch their head. The student discovers solutions on their own.' },
    ]
  },
  {
    id: 'invariants',
    title: 'The Invariant Framework',
    emoji: '🌞',
    content: [
      { type: 'paragraph', text: 'Greg Souders\' framework describes the game at every level — standing, on the ground, in guard, in pins.' },
      { type: 'heading', text: 'Part 1: Attack the Periphery → Center Mass' },
      { type: 'paragraph', text: 'The periphery is whatever is sticking out — arms, legs, frames. You must interact with these to get to center mass: hips, chest, shoulders, back.' },
      { type: 'callout', variant: 'key', text: 'Attack the periphery → Gain access to center mass → Immobilize center mass → Isolate and reattack the periphery. This is a loop, not a line. You can enter at any point.' },
      { type: 'heading', text: 'Part 2: Connection & Distance Management' },
      { type: 'paragraph', text: 'You cannot fight unless you can grip your partner and hold that connection long enough to create an effect. Distance is not something you simply close or create — it is a continuous, complex event.' },
      { type: 'heading', text: 'The Simultaneous Process' },
      { type: 'list', items: [
        'Segmentation — navigate through knee, ankle, hip segments',
        'Destabilization — take structure away to control distance',
        'Isolation — separate a limb from everything that can defend it',
        'Immobilization — proximity reduces options; pins reduce them more',
      ]},
      { type: 'callout', variant: 'warning', text: 'These concepts are not steps. They happen simultaneously. When you grip a wrist to isolate a limb, you are simultaneously segmenting, immobilizing, and destabilizing. The words are separate; the process is not.' },
      { type: 'heading', text: 'The Paradox: Direct vs. Indirect Control' },
      { type: 'paragraph', text: 'To maximize direct control, you need them on the floor, covered at hips and shoulders. But to go for the submission, you give up that coverage. What replaces it is indirect control — threat. The threat of the break, the angle, the feeling of the joint under pressure.' },
    ]
  },
  {
    id: 'cla-for-bjj',
    title: 'CLA for BJJ',
    emoji: '🍃',
    content: [
      { type: 'heading', text: 'What does a session look like?' },
      { type: 'list', items: [
        'Mostly or entirely live rolling/sparring',
        'Coach sets up scenarios with tasks',
        'Coach observes and gives feedback in real time',
        'No curriculum, no template — just a framework and real-time adjustment',
      ]},
      { type: 'heading', text: 'The practical takeaway for coaches' },
      { type: 'list', items: [
        'Pick a skill (e.g. passing guard, armlocking from mount)',
        'Ask: what ALWAYS has to happen for this skill to work?',
        'Build a live task around that invariant — give both players a job',
        'Let them figure it out, observe, then adjust the constraint',
      ]},
      { type: 'callout', variant: 'key', text: '"There is no curriculum. There is no template. There\'s only a way to look at what\'s happening and filter it." — Greg Souders' },
    ]
  },
  {
    id: 'game-design',
    title: 'Designing CLA Games',
    emoji: '🦧',
    content: [
      { type: 'callout', variant: 'key', text: 'CLA games are not drills. They are live, resisted situations where both players have a task — and skill emerges from the struggle, not from memorizing steps.' },
      { type: 'heading', text: 'The 7-Step Process' },
      { type: 'list', items: [
        'Step 1: Identify the invariant — what never changes?',
        'Step 2: Define the problem (exposure) — put them in the problem, don\'t explain the solution',
        'Step 3: Create the win condition (opportunity) — clear, achievable through multiple paths',
        'Step 4: Set the constraints — task rules, starting position, partner selection',
        'Step 5: Keep it live — both players resisting, unscripted, uncooperative',
        'Step 6: Progress the game (complexity) — add conditions, not techniques',
        'Step 7: Coach in real time — observe, then adjust. Don\'t stop and explain.',
      ]},
      { type: 'heading', text: 'Game Design Checklist' },
      { type: 'list', items: [
        '✅ I know the invariant (the thing that never changes)',
        '✅ The game exposes the student to the real problem',
        '✅ There is a clear win condition for both players',
        '✅ The game is live and resisted',
        '✅ The starting position makes sense for the skill',
        '✅ I can progress by adding conditions (not techniques)',
        '✅ I\'m not explaining the solution before they\'ve felt the problem',
      ]},
    ]
  },
  {
    id: 'session-structure',
    title: 'Session Structure',
    emoji: '🐇',
    content: [
      { type: 'callout', variant: 'key', text: 'Everything is live resistance. No static drilling. Expose the student to the problem, then give them the opportunity to solve it.' },
      { type: 'heading', text: 'Session Structure' },
      { type: 'list', items: [
        '1. Warm-Up — Low variability, live task (not jogging or shrimping)',
        '2. Define the Concept — Brief context, not step-by-step technique',
        '3. Games — Simple to complex, each adding one more problem',
        '4. Coach\'s Role — Facilitator, not lecturer. Adjust on the fly.',
        '5. Q&A / Debrief — After games, when students have shared experience',
      ]},
      { type: 'heading', text: 'What to Avoid' },
      { type: 'list', items: [
        '❌ Showing a technique and then drilling it cooperatively',
        '❌ Spending more time talking than playing',
        '❌ Giving students more information than they can act on now',
        '❌ Solving problems students haven\'t experienced yet',
      ]},
      { type: 'heading', text: 'Beginner Session (60 min)' },
      { type: 'list', items: [
        'Warm-up game: 6 min — Low variability, low intensity',
        'Guard games: ~24 min (2–3 games × 6 min each)',
        'Pinning games: ~24 min (2–3 games × 6 min each)',
        'Buffer for transitions: ~6 min',
      ]},
    ]
  },
  {
    id: 'beginners-vs-advanced',
    title: 'Beginners vs. Advanced',
    emoji: '⚖️',
    content: [
      { type: 'heading', text: 'Beginners' },
      { type: 'list', items: [
        'Need direction and clear tasks: "What\'s my intention here?"',
        'Drills should be terminal (defined endpoint) — gives pauses and goals',
        'Tasks are general and simple — "hold the person down"',
        'Tasks loaded toward one side — one general goal, one specific problem',
        'Don\'t correct mistakes they haven\'t experienced yet',
      ]},
      { type: 'heading', text: 'Advanced Students' },
      { type: 'list', items: [
        'Verbal instructions stop working — the environment is everything',
        'Drills can be continuous and open',
        'Tasks become specific and complex',
        'The better the athlete, the more individual the work',
        'Getting a small change in someone who has trained 10 years is brutal',
      ]},
      { type: 'callout', variant: 'info', text: 'With beginners: general opportunities for action to train general behaviors. With advanced students: specific opportunities to train specific behaviors.' },
    ]
  },
  {
    id: 'coaching-cues',
    title: 'Effective Coaching Cues',
    emoji: '🕵️',
    content: [
      { type: 'paragraph', text: 'Practice design comes first. Your first intervention is the task you set up, not your words. Verbal cues come second and should be used sparingly.' },
      { type: 'heading', text: 'Principles' },
      { type: 'list', items: [
        'Words are a constraint — more instruction is not better',
        'Build shared experience before talking — let them struggle first',
        'Use external focus — talk about the effect on the opponent, not how the student\'s body feels',
        'Use condition + effect format — short, concrete, aimed at the opponent',
        'Anchor cues around invariants — things that don\'t change person to person',
        'Be repetitive and consistent — same cues every day',
        'Different students need different words',
      ]},
      { type: 'heading', text: 'Greg\'s Actual Cues' },
      { type: 'list', items: [
        'Clear the feet',
        'Staple him to the floor',
        'Keep the feet off of you',
        'Make them turn away',
        'Extend the elbow',
        'Get behind the elbow',
        'Hip focus',
        'Build height',
        'Straighten the limb',
      ]},
    ]
  },
  {
    id: 'addressing-arguments',
    title: 'Addressing Arguments Against CLA',
    emoji: '🦉',
    content: [
      { type: 'heading', text: 'Quick Reference' },
      { type: 'table', headers: ['Objection', 'One-sentence response'], rows: [
        ['"They need to see the technique first"', 'Experience makes instruction meaningful — not the other way around.'],
        ['"What about specific grips and details?"', 'Start with what must happen (the invariant), not how it should look.'],
        ['"This isn\'t structured"', 'The structure is in the game design, not the choreography.'],
        ['"Beginners need more guidance"', 'Guidance comes through game design, not technique explanation.'],
        ['"Elite athletes drill, so drilling works"', 'They got good from live mat time — the drilling came after.'],
        ['"We already roll and nothing improves"', 'Unstructured rolling is not CLA. The game design is the coaching.'],
        ['"Traditional instruction is more efficient"', 'Efficient at what? Performing in drills, or applying skill under pressure?'],
        ['"Students lose confidence without guidance"', 'Students lose more confidence when their drilled technique fails live.'],
        ['"I can\'t throw away 20 years of knowledge"', 'You don\'t — you use it to design better games instead of explanations.'],
        ['"The theory is too complicated"', 'Ignore the theory. Find the invariant, make a live game, give win conditions.'],
        ['"Are instructionals useless?"', 'Useful as inspiration for what to explore in live work — not a substitute.'],
      ]},
    ]
  },
  {
    id: 'hidden-logic',
    title: 'The Hidden Logic of Jiu-Jitsu',
    emoji: '🤖',
    content: [
      { type: 'paragraph', text: 'Underneath the thousands of named techniques sit a handful of plain physical facts. The techniques are just the local ways of obeying them. Once you can see the facts, the chaos resolves into something close to logic.' },
      { type: 'heading', text: 'Two ways a fight ends' },
      { type: 'list', items: [
        'The strangle — compresses the two arteries carrying blood to the brain. A true blood choke does not care how tough you are.',
        'The joint lock — loads a joint past its range. Negotiates with toughness in a way a strangle does not.',
      ]},
      { type: 'heading', text: 'Why leverage beats muscle — and where it stops' },
      { type: 'paragraph', text: 'Every control and submission is a lever. Done with the right geometry, a slight person generates more force at a joint than a powerful person can withstand. But levers have limits — stack the geometry wrong and no amount of strength finishes.' },
      { type: 'heading', text: 'Balance is really about the floor' },
      { type: 'paragraph', text: 'A stable structure channels force down into the floor through a posted hand, knee, or foot. Off-balancing is the act of taking away the opponent\'s ability to send force into the floor.' },
      { type: 'callout', variant: 'info', text: 'You cannot sweep someone in a direction where they have a limb posted. First you remove the floor; only then does the person tip.' },
      { type: 'heading', text: 'The real skill is the trap, not the move' },
      { type: 'paragraph', text: 'What actually beats a good grappler is a dilemma: a position where every escape walks them into a different finish. The expert isn\'t the person with the most moves — it\'s the person who can build the position where the opponent\'s options have all been pre-loaded to fail.' },
      { type: 'heading', text: 'The slow leak' },
      { type: 'paragraph', text: 'Holding someone with muscle burns energy fast. Holding with structure costs almost nothing. This is why the calm veteran beats the explosive newcomer — control quietly transfers to whoever was spending less.' },
      { type: 'callout', variant: 'key', text: 'Jiu-jitsu is the steady shrinking of your opponent\'s available options until the only ones left lose — while you spend less of your own reserves than they spend on theirs.' },
    ]
  },
  {
    id: 'further-reading',
    title: 'Further Reading',
    emoji: '📚',
    content: [
      { type: 'paragraph', text: 'The text in this document is generated using Claude to summarise the ideas of Greg Souders, Rob Gray and others from YouTube transcripts. The AI is good at summarizing, but it\'s best to get info straight from the source.' },
      { type: 'heading', text: 'Books' },
      { type: 'list', items: [
        'How We Learn to Move — Rob Gray',
        'Constraints-Led Approach: Principles for Sports-Based Coaching and Practice Design',
      ]},
      { type: 'heading', text: 'Podcasts' },
      { type: 'list', items: [
        'CLA YouTube Playlist (Greg Souders)',
        'Greg Souders Spotify Playlist',
        'Rob Gray Podcast (Perception Action)',
      ]},
      { type: 'heading', text: 'Sources' },
      { type: 'list', items: [
        'BJJ Instructional Shortcuts Are A Lie — Greg Souders #54',
        'Rob Gray — Perception Action Podcast',
        'Standard Jiu-Jitsu (Greg Souders) — Instagram: @GD_STS',
        'NYT Athletic: CLA coaching (Wembanyama, Ohtani)',
      ]},
    ]
  },
];
