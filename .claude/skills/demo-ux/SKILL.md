---
name: demo-ux
description: Best practices for designing, reviewing, or refining "try-it-now" interactive product demos, in-app product tours, onboarding walkthroughs, and sandbox experiences. Use when building or critiquing a demo page, tour component, tooltip copy, sandbox, aha-moment flow, reset/skip behavior, or any try-before-signup experience. Triggers on "demo UX", "ツアー設計", "ウォークスルー", "オンボーディング設計", "チュートリアル", "product tour", "walkthrough", "try it now", "サンドボックス設計", "デモのレビュー", or when reviewing files named `*Tour*`, `*Demo*`, `*Onboarding*`, `*Walkthrough*`.
---

# Demo UX Best Practices

Knowledge base for designing try-it-now demos, product tours, and onboarding flows that convert. Grounded in 2024–2026 benchmarks (Navattic, Arcade, Chameleon, Userpilot, Appcues) rather than first principles — because most "design intuitions" in this space are wrong in ways only data reveals.

## When to use

- Designing a `/demo` or `/try` page from scratch
- Reviewing or refining an existing tour / tooltip / sandbox
- Deciding whether a tour should auto-start
- Writing tooltip microcopy
- Debating step count, skip behavior, or reset behavior
- Choosing between guided tour, free sandbox, or hybrid

## Core decisions (checklist)

Work through these in order. Each has a default answer backed by data; deviate only with a specific reason.

### 1. Step count — **default: 3 steps**

- **3 steps hits 72% completion. 4 steps → 45%. 7 steps → 16%.** The cliff between 3 and 4 is real.
- If the guided flow needs more than 3 steps, split it: 3-step tour + progressive disclosure (contextual tooltips fired later when the feature is actually used).
- A tour that explains features *before* the user tries them is almost always wrong. Fold explanation into the moment the user is about to use the feature (event-driven tooltips).

### 2. Start trigger — **default: user-initiated, not auto-start**

- **User-initiated tours complete 2–3× more often** than auto-start.
- Modal-on-arrival increases bounce. Don't cover the product on first paint.
- Instead: land in the sandbox, show a visible-but-dismissible CTA inline ("最初の1日を整えてみる →" / "Start the tour").
- If you must nudge: delay 30–60s or trigger on idle / scroll.

### 3. Initial state — **default: pre-broken, not empty**

- Empty states push time-to-value past the user's attention budget.
- **Pre-broken > pre-populated > empty.** Grammarly (text with mistakes), Linear (seeded issues), Notion (getting-started workspace), Figma (community files) — none start empty.
- The pre-broken state *is* the aha setup: the user fixes it, the aha lands.
- Design the broken state so the problem is **visually obvious** — long bars, missing entries, visible conflicts. Don't require explanation.

### 4. Progression — **default: event-driven, not click-Next**

- "Click Next" tours let users advance without performing the value-creating action — the single biggest conversion killer in tour design.
- Fire the next tooltip **when the user completes the action** (drag finished, item deleted, form submitted).
- For non-action steps (welcome / summary), click-Next is fine.

### 5. Tooltip copy — **default: 1 sentence, ≤150 chars, verb-first**

- **≤150 chars, ~20–30 words, one idea per tooltip.**
- **Verb-first, second person, imperative**: "Add your first shift" beats "You can add shifts here."
- **Instructional > narrative.** Narrative fits marketing videos, not tooltips.
- Point at the next action, not at the feature.
- See `references/copy-patterns.md` for patterns and Japanese-specific nuances.

### 6. Skip — **default: always visible, persistent, preserves state**

- Skip control must be visible on every step. Forcing a tour == churn.
- Show step counter next to skip so the user can choose "3 more → done" vs. "skip".
- **Skipping should NOT reset the sandbox.** Let the user keep poking the state they've built.
- B2B tour completion averages ~5%. Skip is the default behavior, not the exception.

### 7. Reset — **default: reload-resets, plus a visible "Start over" button**

- Reload should restore initial state (simplest, no surprises).
- Additionally expose a visible "Reset demo" / "最初からやり直す" button in the page chrome.
- Single-step confirmation ("Your demo progress will be cleared"). No typed confirmation — this is a sandbox.
- Label as "Reset" / "Start over", not "Delete".

### 8. End state — **default: inline CTA in the last step, not a full-screen modal**

- Inline CTA in the last tooltip outperforms full-screen celebration for SMB flows.
- Show 1–2 differentiated CTAs: low-commitment + high-commitment ("Keep exploring" + "Start free").
- **"Learn more" CTRs ~63%; "Book a demo" ~41%.** High CTR ≠ high qualified conversion — match wording to intent.
- Consider a persistent top-bar CTA for users who hit aha mid-flow.

### 9. Mobile — **default: desktop-first with explicit fallback**

- Interactive tours are desktop-first. That's the state of the industry.
- **52% of top-1% demos ship an optimized mobile experience** — the rest redirect or email-capture.
- Fallbacks: (a) simplified mobile-only demo, (b) looping video, (c) "best on desktop — email me the link".
- If the demo uses drag/drop/precision hover, a mobile fallback is mandatory.

### 10. Analytics — **instrument these 5 events minimum**

1. `demo_loaded` — page opened
2. `tour_started` — start CTA clicked (distinguishes auto vs. user-triggered)
3. `step_completed` — per-step with step id. Finds the one step killing the funnel.
4. `aha_reached` — custom event when the user completes the value-creating action
5. `cta_clicked` — final signup / upgrade CTA

Top-1% demos: final CTR 67%, demo-to-signup 8× median. If your numbers are far from these, the fix is usually step-count or progression style — not copy.

## The persona lens

Two meta-personas matter:

| Persona | Prefers | Why |
|---|---|---|
| **Hands-on SMB / operator** (shop owners, ops managers, ICs) | Sandbox > guided. Short tours. Try-it-now > sales demo | SMB buyers "tolerate lighter, shorter tours" (SmartCue). Self-serve converts. |
| **Exec / enterprise evaluator** | 90-second narrative video > interactive. Prefers demo-with-a-human | "Watch-to-evaluate" — Arcade-style video demos convert this persona better. |

Building for both? Ship a 60–90s video demo alongside the interactive demo. Let the user choose.

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

See `references/anti-patterns.md` for extended list with symptom → cause → fix.

## When to reference deeper files

- **`references/benchmarks.md`** — specific numbers to justify a design decision (completion rates, conversion benchmarks, TTV, CTR by wording). Full citations.
- **`references/copy-patterns.md`** — when writing or reviewing tooltip / CTA / banner text, especially in Japanese. Includes verb-first patterns, 3 I's (Inform/Influence/Interact), Japanese copy nuances.
- **`references/anti-patterns.md`** — when reviewing an existing demo for problems. Organized as symptom → cause → fix.

## Output discipline (when reviewing or proposing)

1. **Lead with data, not opinion.** "3-step tours hit 72%, 7-step tours hit 16% — your 7 steps is in the wrong zone" beats "this feels long."
2. **State the default, then justify the exception** if the design deviates.
3. **Don't invent tooltip copy** without showing the underlying pattern (verb-first, ≤150 chars, event-driven). Otherwise the user treats it as decoration, not a design artifact.
4. **Always mention analytics.** "What 5 events are we instrumenting?" If the answer is "we'll figure that out later", the demo isn't done.

## Scope boundaries

- This skill covers **try-it-now demos, tours, and onboarding** — not marketing landing pages, not sales demos, not documentation sites.
- For full-screen mock design, use `/create-design`.
- For pinpoint UI polish unrelated to demos, use `/design-ideas`.
