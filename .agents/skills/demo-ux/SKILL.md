---
name: demo-ux
description: 操作できる製品デモ、プロダクトツアー、オンボーディング、サンドボックスを設計またはレビューする。開始条件、価値体験、進行、skip、reset、完了導線、計測を扱うときに使う。マーケティングページ、営業用動画、通常画面の局所的なUI改善には使わない。
---

# 体験型デモを設計する

Design the shortest path from entry to the product's value-producing action.
When a numerical benchmark would change the decision, verify a current primary source instead of relying on values embedded in this skill.

## Core decisions

Work through these in order and record the reason for each exception.

### 1. Step count: default to three guided steps

- If the guided flow needs more than 3 steps, split it: 3-step tour + progressive disclosure (contextual tooltips fired later when the feature is actually used).
- Put explanations at the moment the user can act instead of front-loading a feature list.

### 2. Start trigger: default to user-initiated

- Do not cover the product with a modal on first paint.
- Land in the sandbox and show a visible, dismissible start action.
- If you must nudge: delay 30–60s or trigger on idle / scroll.

### 3. Initial state: default to a prepared problem

- Avoid an empty state that requires setup before value appears.
- Seed a visible, safe problem that the user can fix through the product's core action.
- Make the problem understandable without explanatory prose.

### 4. Progression: default to event-driven

- Advance when the user completes the intended action, such as a drag, deletion, or submission.
- For non-action steps (welcome / summary), click-Next is fine.

### 5. Tooltip copy: one action per message

- Use one short sentence and start with the action when natural.
- Prefer instructions to marketing narration.
- Point at the next action, not at the feature.

### 6. Skip: always visible and state-preserving

- Keep skip visible on every step.
- Show step counter next to skip so the user can choose "3 more → done" vs. "skip".
- Do not reset sandbox state when the user skips.

### 7. Reset: predictable and visible

- Reload should restore initial state (simplest, no surprises).
- Additionally expose a visible "Reset demo" / "最初からやり直す" button in the page chrome.
- Single-step confirmation ("Your demo progress will be cleared"). No typed confirmation — this is a sandbox.
- Label as "Reset" / "Start over", not "Delete".

### 8. End state: preserve product context

- Put one or two distinct next actions in the final step instead of blocking the product with a celebration modal.
- Consider a persistent top-bar CTA for users who hit aha mid-flow.

### 9. Mobile: provide an explicit fallback

- Use a simplified mobile demo, a short video, or a way to continue on desktop when the interaction depends on desktop precision.
- If the demo uses drag/drop/precision hover, a mobile fallback is mandatory.

### 10. Analytics: instrument the value path

1. `demo_loaded` — page opened
2. `tour_started` — start CTA clicked (distinguishes auto vs. user-triggered)
3. `step_completed` — per-step with step id. Finds the one step killing the funnel.
4. `aha_reached` — custom event when the user completes the value-creating action
5. `cta_clicked` — final signup / upgrade CTA


## Common anti-patterns (do not do)

- 7+ step tours that front-load feature explanation
- Auto-triggered modal on first page load
- "Click Next" progression for action steps
- Empty initial state ("Add your first X to get started")
- Skip button hidden in an overflow menu
- Multi-step reset confirmation
- Full-screen celebration modal at end (over-ceremonious)
- Narrative / marketing copy in tooltips ("Welcome to the future of X…")
- Mobile "coming soon" dead-ends
- No aha-reached event instrumented

## Output discipline

1. State the user's value-producing action and the shortest path to it.
2. Show the proposed initial state, steps, skip/reset behavior, end state, mobile fallback, and events.
3. Separate verified facts from design assumptions.
4. Explain each deviation from the defaults.
5. For project UI, apply `$ui-architect` and the repository's UI design rule.

## Scope boundaries

- This skill covers try-it-now demos, tours, onboarding, and sandboxes.
- Use `$ui-architect` for ordinary application UI and microcopy.
- Use `$write-help-content` for HelpCenter FAQs and guides.
