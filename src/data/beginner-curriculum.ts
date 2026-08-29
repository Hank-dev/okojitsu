export type CurriculumGame = {
  gameId: string
  duration: 6
}

export type CurriculumSession = {
  week: number
  focus: string
  games: CurriculumGame[]
}

const six = (gameId: string): CurriculumGame => ({ gameId, duration: 6 })

export const BEGINNER_SEMESTER: CurriculumSession[] = [
  { week: 1, focus: 'First contact and feet off', games: [six('grip-fighting-more-grips'), six('beginner-feet-off'), six('beginner-inside-position'), six('beginner-cover-the-hips'), six('beginner-stay-on-top-hold-down'), six('beginner-get-under-elbows')] },
  { week: 2, focus: 'Inside position and guard recovery', games: [six('scott-frame-game'), six('beginner-feet-off'), six('beginner-inside-position'), six('beginner-cover-the-hips'), six('beginner-stay-on-top-hold-down'), six('beginner-scalable-pinning')] },
  { week: 3, focus: 'Connection from standing to the floor', games: [six('grip-fighting-more-grips'), six('scott-get-to-back'), six('seated-handfight'), six('beginner-feet-off'), six('beginner-stay-on-top-hold-down'), six('back-control-no-subs')] },
  { week: 4, focus: 'Seated guard and staying in front', games: [six('transcript-connection-warmup'), six('seated-handfight'), six('seated-denying-supine'), six('beginner-feet-off'), six('beginner-cover-the-hips'), six('beginner-get-under-elbows')] },
  { week: 5, focus: 'Get to your feet safely', games: [six('grip-fighting-more-grips'), six('just-stand-up-hand-denial'), six('just-stand-up-one-hand-knee'), six('just-stand-up-turtle-breakdown'), six('beginner-stay-on-top-hold-down'), six('beginner-scalable-pinning')] },
  { week: 6, focus: 'Hold down and recover guard', games: [six('scott-frame-game'), six('beginner-feet-off'), six('beginner-cover-the-hips'), six('beginner-stay-on-top-hold-down'), six('beginner-get-under-elbows'), six('beginner-scalable-pinning')] },
  { week: 7, focus: 'Hand fighting and seated connection', games: [six('grip-fighting-more-grips'), six('pj-hand-fighting-inside-position'), six('seated-handfight'), six('seated-upper-stay-connected'), six('seated-destabilising-wrestling-up'), six('beginner-stay-on-top-hold-down')] },
  { week: 8, focus: 'Guard connection and knee line', games: [six('transcript-connection-warmup'), six('fundamentals-make-inside'), six('fundamentals-inside-one-leg'), six('fundamentals-destabilize-knee-line'), six('beginner-cover-the-hips'), six('alllevels-side-control-hip')] },
  { week: 9, focus: 'Reset: feet, frames, and pins', games: [six('scott-frame-game'), six('beginner-feet-off'), six('beginner-inside-position'), six('beginner-stay-on-top-hold-down'), six('beginner-get-under-elbows'), six('back-control-no-subs')] },
  { week: 10, focus: 'Stand-up problem and connection', games: [six('grip-fighting-more-grips'), six('just-stand-up-hand-denial'), six('just-stand-up-one-hand-knee'), six('just-stand-up-chest-no-hands'), six('seated-destabilising-wrestling-up'), six('beginner-cover-the-hips')] },
  { week: 11, focus: 'Passing the feet to the hips', games: [six('transcript-connection-warmup'), six('beginner-feet-off'), six('beginner-inside-position'), six('beginner-cover-the-hips'), six('beginner-stay-on-top-hold-down'), six('alllevels-side-control-hip')] },
  { week: 12, focus: 'Seated guard, wrestle up, and recover', games: [six('scott-get-to-back'), six('seated-denying-supine'), six('seated-destabilising-wrestling-up'), six('seated-handfight'), six('just-stand-up-one-hand-knee'), six('beginner-stay-on-top-hold-down')] },
  { week: 13, focus: 'Pinning: hips, elbows, and escape', games: [six('grip-fighting-more-grips'), six('beginner-cover-the-hips'), six('beginner-stay-on-top-hold-down'), six('beginner-get-under-elbows'), six('beginner-scalable-pinning'), six('scaling-completing-pins')] },
  { week: 14, focus: 'Back control without submissions', games: [six('scott-frame-game'), six('scott-get-to-back'), six('just-stand-up-turtle-breakdown'), six('back-control-no-subs'), six('alllevels-allfours-rear'), six('beginner-stay-on-top-hold-down')] },
  { week: 15, focus: 'Guard connection under changing starts', games: [six('transcript-connection-warmup'), six('fundamentals-make-inside'), six('fundamentals-inside-one-leg'), six('seated-denying-supine'), six('beginner-feet-off'), six('beginner-cover-the-hips')] },
  { week: 16, focus: 'Stand, sit, pass, pin', games: [six('grip-fighting-more-grips'), six('scott-get-to-back'), six('seated-handfight'), six('beginner-inside-position'), six('beginner-get-under-elbows'), six('back-control-no-subs')] },
  { week: 17, focus: 'Review: pick up old problems', games: [six('scott-frame-game'), six('just-stand-up-chest-free-grip'), six('seated-destabilising-wrestling-up'), six('beginner-cover-the-hips'), six('beginner-scalable-pinning'), six('scaling-completing-pins')] },
  { week: 18, focus: 'Semester integration', games: [six('grip-fighting-more-grips'), six('fundamentals-make-inside'), six('beginner-feet-off'), six('beginner-stay-on-top-hold-down'), six('beginner-get-under-elbows'), six('back-control-no-subs')] },
]
