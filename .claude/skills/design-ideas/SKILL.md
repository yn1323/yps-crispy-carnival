---
name: design-ideas
description: Design principles for pinpoint UI refinement — polishing a specific component, adjusting colors/spacing/copy, or fixing something that "feels off." Not for whole-screen mocks (use `/create-design` for that). Triggers on `/design-ideas`, "デザイン見直して", "ここのUIよくして", "このコンポーネント整えて", "UI磨いて", "これダサいから直して", "refine this UI", "polish this component". Covers matching visual vocabulary, color discipline, declaring a system, scale, CSS surprise, filler/data slop, AI-slop anti-patterns, variation strategy, and content guidelines.
---

# design-ideas — Principles for Pinpoint UI Refinement

Use this when the user points at a piece of UI and asks you to make it better — not when they ask for a full mock. These are craft principles for a designer, not procedural instructions. Read before you write. Observe before you change.

Embody the relevant expert: visual designer, UX designer, prototyper. Avoid generic "web design" tropes unless the thing actually is a web page.

---

## Match the existing visual vocabulary

Before writing a single line, look around. Read adjacent components and the rest of the surface the element lives on. Observe and **think out loud** about:

- Color palette and where accents appear
- Corner radii, shadow depth, border weight
- Density, rhythm, whitespace
- Copywriting style and tone
- Hover / click / focus / animation states
- Shadow + card + layout patterns
- Iconography style

Then match it, unless the user has explicitly asked to break from it. Consistency inside a surface is almost always worth more than any single "better" choice in isolation.

**Prefer code over screenshots.** Source tells you exact tokens, spacing, and structural choices. Screenshots only tell you appearance. When the codebase is available, read it.

---

## Color discipline

- Use colors from the existing brand / design system / palette.
- If the palette is genuinely too restrictive, compute new colors with `oklch()` so they harmonize with what's already there.
- Don't invent hex from scratch — the odds of it clashing subtly with the rest are high.
- Accent sparingly. One focal accent per view usually beats three.

## Emoji

Only use emoji if the brand / design system already uses them. Otherwise they read as AI output. Placeholder glyphs or simple iconography beat an arbitrary emoji.

---

## Declare a system up front

For anything beyond a one-line tweak, briefly state the system you'll commit to before writing:

- One approach for section headers, not three.
- One type scale. One primary accent.
- 1–2 background colors max across the surface.
- Consistent rhythm: gutters, paddings, vertical spacing from the same scale.

Variety should come from **deliberate rhythm and layout variation** (full-bleed vs card, dense vs airy section), not from mixing unrelated patterns.

---

## Scale, deliberately

Rule-of-thumb minimums — adjust for context, but don't go lighter without a reason:

- **Mobile/touch**: tap targets ≥ 44×44 px.
- **Body copy**: ≥ 14 px on screen.
- **Presentation slides (~1920×1080)**: text ≥ 24 px, usually much larger.
- **Print**: body ≥ 12 pt.
- **Headings**: big enough to actually do the hierarchical work you're asking of them.

Scale is a tool — using it timidly flattens the design.

---

## CSS is bigger than most people use

Users often don't know what CSS can do. Reach for it:

- `text-wrap: pretty` / `text-wrap: balance` for headings and short text.
- CSS Grid (including named areas) over nested flex towers.
- `aspect-ratio`, `min()` / `max()` / `clamp()`, container queries.
- Layering with `z-index` + `position: sticky`.
- Modern color: `oklch()`, `color-mix()`.
- SVG masks, CSS masks, `backdrop-filter`.

**Surprise the user when it serves the content** — novel layouts, scale play, layering, type-as-image. Not surprise for its own sake.

---

## Placeholders beat bad attempts

In hi-fi design, a clearly-labeled placeholder block is better than a half-faked rendering:

- Don't draw illustrations from scratch in SVG — use a placeholder and ask for real assets.
- Don't render a fake chart with made-up data — use a labeled box.
- Don't fake a busy grid with invented content — show the structure and say "placeholder."

Placeholders communicate design intent cleanly. Half-faked content communicates confusion.

---

## Content discipline

### No filler

Never pad a design with dummy sections, placeholder paragraphs, invented stats, or decorative copy just because the layout feels empty. Every element should earn its place. **A thousand no's for every yes.**

Emptiness is a layout problem. Solve it with composition, scale, or rhythm — not with made-up material.

### No data slop

Unnecessary numbers, unearned icons, KPI-shaped nothings, decorative percentages. If a number isn't carrying real meaning, cut it. If an icon isn't clarifying, cut it.

### Ask before adding

If you think another section, page, or block of copy would improve the design, **ask before adding it.** The user knows the audience and goals better than you do. Unilateral additions are a common failure mode.

### Kill repetition

The same point in two sections is a design bug. Reorganize or cut.

### Copy honesty

- Don't promise things the system doesn't do ("automatic", "instant", "always").
- Communicate the experience, not the mechanism. Users care about the outcome, not the plumbing.
- Lead with benefit, not pain. No humble-brag. No condescension.
- Short. One line should often do two jobs (who it's for + what they get).

---

## AI slop — avoid

Common tells of AI-generated design:

- Aggressive gradient backgrounds, especially purple / pink / orange washes.
- Emoji used as decoration without brand justification.
- Rounded containers with a left-border accent color (the "callout" trope).
- Illustrations drawn from scratch in SVG — use placeholders and ask for real assets.
- Overused default typefaces: Inter, Roboto, Arial, Fraunces, generic system stacks. Use what the project ships, or pick something with intention.
- Generic "web page" or "admin dashboard" framing applied to things that aren't either.
- Symmetric three-card feature rows with matching circular icons. Unearned parallel structure.

---

## Variation strategy (when asked for options)

If the user wants variations, make the spread meaningful:

- **Safe, pattern-faithful** — uses the existing vocabulary as-is. The "ship tomorrow" option.
- **Exploratory, increasingly bold** — push on one dimension at a time: layout metaphor, information hierarchy, type treatment, density, interaction model.
- Start close to safe, get bolder as you go.

Don't waste variants on trivial deltas — different accent colors or padding values isn't two options, it's one. Mix conservative with novel. Mix text-heavy with imagery-led. Mix dense with airy. The goal is to expose the user to many atomic choices so they can mix-and-match.

---

## Start from context — don't mock from scratch

Mocking a whole product from a blank page is a last-resort move that produces generic output. Before you build:

- Read the design system, UI kit, or codebase the project has.
- Read adjacent feature code, not just screenshots.
- If context is missing, **ask** — for a screenshot, a reference product, a Figma link, a file — don't invent from thin air.

"I couldn't find it so I made something up" is the failure mode. Ask instead.

---

## Asking questions

For anything beyond a trivial tweak, confirm context via a question rather than an assumption:

- What's the starting point — a design system, a specific screen, a reference?
- Do they want divergent visuals, divergent UX, or just polish on the existing pattern?
- Which axis matters most — flow, copy, or visuals?
- Variations across which dimensions, and how many?

Err on the side of more questions for ambiguous briefs. Skip questions only for small tweaks where intent is already clear.

---

## Working process

1. **Read the target and its neighbors.** Observe visual vocabulary before writing.
2. **State the approach** in 2–3 bullets for non-trivial changes: system, what to reuse, any intentional break and why.
3. **Keep the diff minimal.** Don't slip in refactors or adjacent cleanups. Fix the thing that was asked.
4. **Confirm direction-level choices, don't decide them unilaterally.**
5. **Report in 1–2 sentences** — what changed + the next useful action.

---

## Not in scope

- Whole-screen mocks → use `/create-design`
- Design-tool briefs (pencil / Figma) → use `/design-prompt`
- Decoration that wasn't asked for
