---
name: write-shiftori-ui-text
description: Compatibility entry for シフトリ UI text work. Route product facts and microcopy through `ui-architect`, and use `cognitive-rhythm-writing` for explanatory UI prose that has sentence, paragraph, or section flow. Use for labels, buttons, dialogs, toasts, alerts, empty states, loading states, staff-facing text, manager dashboard text, error messages, onboarding, guides, and landing copy. Keep atomic UI copy concise instead of adding prose rhythm to it.
---

# Write Shiftori UI Text

This skill uses `../ui-architect/SKILL.md` as the source of truth for UI wording and `../cognitive-rhythm-writing/SKILL.md` for the rhythm of explanatory prose.

When a task asks for シフトリ UI text, error messages, Toasts, empty states, dialogs, labels, button copy, staff-facing copy, manager dashboard copy, or copy that depends on settings, permissions, notifications, billing, legal agreement, or async behavior:

1. Read `.agents/skills/ui-architect/SKILL.md`.
2. Read `.agents/skills/ui-architect/references/ui-writing.md` completely.
3. Read `.agents/skills/cognitive-rhythm-writing/SKILL.md` and follow its `併用する規範` requirement.
4. Use `ui-architect` and `ui-writing.md` to determine product facts, state, privacy, terminology, and the user's next action.
5. Apply `cognitive-rhythm-writing` only when the copy is long enough to have explanatory flow, such as landing sections, onboarding, staff guides, FAQ and HowTo explanations, multi-sentence dialogs or alerts, and notification bodies.
6. Keep buttons, labels, Toast titles, table headers, validation messages, and other atomic microcopy short and task-oriented. Do not add hesitation, ornamental transitions, or artificial rhythm to them.
7. If the rules conflict, product truth, security, privacy, and the next action defined by `ui-writing.md` take priority over prose rhythm.
8. Do not add new wording rules here.

This file remains only as a compatibility entry so older prompts that mention `$write-shiftori-ui-text` still route to the integrated UI writing workflow.
