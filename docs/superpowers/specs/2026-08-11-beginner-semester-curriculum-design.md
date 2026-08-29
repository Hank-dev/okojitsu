# Beginner Semester Curriculum Design

## Goal

Add one **Curriculum** tab that lists an 18-week beginner semester, running from mid-August to mid-December. Each session contains six existing ØkoJitsu games, each set to six minutes.

## Content and teaching constraints

- The tab is a concise session list; it does not introduce new games, technique sequences, or coaching essays.
- Every listed game must reference an existing game ID from `src/data/games.json`.
- Each class has six six-minute games. The remaining 24 minutes are reserved for a brief task definition, natural role changes, water/reset time, a midpoint break, and a short debrief.
- The sequence is beginner-scaled: clear terminal outcomes, simple starting positions, and repeated guard/pinning exposure.
- Interleaving is expressed through selection: standing/grip, guard, passing, pinning, and stand-up problems return across the semester rather than appearing in one isolated block.
- The list is a coach-facing starting map. It is not a replacement for iterative practice; the coach can repeat, narrow, or change a constraint after observing the room.
- Content avoids leg-lock submission games and complex submission progressions for this beginner semester.

## Interface

- Add `curriculum` to the `Page` route union in `src/App.tsx`.
- Add a **Curriculum** navigation button and render a `CurriculumPage` when selected.
- Store the 18 session entries in a dedicated `src/data/beginner-curriculum.ts` module so the page component only renders data.
- The page displays the semester title, the six-minute format, and an ordered list of weeks. Each week contains a focus label and six linked/recognizable game titles.

## Verification

- A small test verifies the curriculum has exactly 18 sessions, six games per session, each game duration is six minutes, and every referenced game ID exists.
- Existing build and test commands remain green.
