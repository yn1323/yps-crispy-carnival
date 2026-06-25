---
name: write-shiftori-ui-text
description: Compatibility entry for シフトリ UI text work. The writing rules for labels, buttons, dialogs, toasts, alerts, empty states, loading states, staff-facing text, manager dashboard text, and error messages have been integrated into `ui-architect`. When this skill is triggered, read and follow `.agents/skills/ui-architect/SKILL.md` instead of maintaining separate wording rules here.
---

# Write Shiftori UI Text

This skill has been integrated into `../ui-architect/SKILL.md`.

When a task asks for シフトリ UI text, error messages, Toasts, empty states, dialogs, labels, button copy, staff-facing copy, manager dashboard copy, or copy that depends on settings, permissions, notifications, billing, legal agreement, or async behavior:

1. Read `.agents/skills/ui-architect/SKILL.md`.
2. Follow the `シフトリUI文言`, `現状UIからのプロジェクト基準`, and `ユーザー指摘をスキルへ反映する` sections.
3. Do not add new wording rules here.

This file remains only as a compatibility entry so older prompts that mention `$write-shiftori-ui-text` still route to the integrated UI Architect workflow.
