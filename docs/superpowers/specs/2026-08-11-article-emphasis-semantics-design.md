# Article emphasis semantics design

## Goal

Stop ordinary bold-only sentences in Field Manual and coaching articles from being presented as invented “Principle” or “Coach cue” callouts.

## Cause

The article parser currently treats every paragraph whose entire Markdown content is bold as a semantic callout. In theory mode it assigns `principle`; in coaching mode it assigns `coach-cue`. The renderer then adds a label, border, spacing, and accent styling that the source document never requested.

## Design

- Parse bold-only paragraphs as ordinary article paragraphs.
- Preserve their inline bold formatting through the existing Markdown renderer.
- Do not generate “Principle” or “Coach cue” labels from typography alone.
- Keep explicitly structured `constraint`, `win-condition`, and authored `callout` blocks unchanged.
- Keep saved-session coach notes and the session runner unchanged; those notes have explicit product semantics rather than inferred article semantics.
- Do not broadly change the app palette or other visual hierarchy.

## Verification

- Add parser tests proving bold-only theory and coaching paragraphs become ordinary paragraphs while retaining their Markdown source.
- Keep tests for explicit constraints, win conditions, and callouts passing.
- Update any source contract that intentionally encoded the old inference.
- Run Field Manual tests, visual-contract tests, and the production build.

## Out of scope

- Rewriting article content.
- Removing bold formatting.
- Restyling explicit structured game fields.
- Changing session coach notes, timer UI, or navigation.
