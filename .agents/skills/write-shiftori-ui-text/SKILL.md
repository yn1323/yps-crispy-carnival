---
name: write-shiftori-ui-text
description: Write, review, and revise Japanese UI text for シフトリ app surfaces, including labels, buttons, dialogs, toasts, alerts, empty states, loading states, onboarding text, staff-facing submission text, manager dashboard text, and landing/demo UI copy. Use when Codex needs to generate or improve in-app Japanese microcopy for シフトリ. Do not use for ArticleSite SEO/help articles, legal document bodies, code comments, tests, or Storybook-only placeholder text unless the user asks to update those surfaces too.
---

# Write Shiftori UI Text

Use this skill to make シフトリ UI text feel natural, specific, and easy to act on for Japanese users.
Write for busy shop managers and staff members who want to finish shift work quickly, not for internal operators or engineers.

## Core Principles

- Prefer plain, current Japanese over formal system language.
- State the next action, result, or status clearly.
- Keep labels short; put nuance in helper text, dialog bodies, or alerts.
- Reduce anxiety without overexplaining.
- Use the user's vocabulary: 店舗, 店休日, 募集, 希望シフト, 確定シフト, スタッフ, シフト作成担当者.
- Avoid internal terms: outbox, scheduler, retry, queue, token, magic link, ID, 不達, 非同期.
- Do not overpromise background work. If the system only accepted a request, write `受け付けました`, not `送信しました` or `完了しました`.
- Preserve user-approved local wording unless the task is explicitly to revise it.

## Workflow

1. Identify the surface.
   - Manager app, staff-facing link, auth, landing/demo, or operational notification.
   - Exclude ArticleSite SEO/help articles; use `write-article` for those.

2. Identify the element.
   - Button, label, field helper, dialog title/body, toast, empty state, error, loading state, table column, section heading, onboarding copy, or landing copy.

3. Write the smallest useful text.
   - Label: noun or short noun phrase.
   - Button: verb plus object when helpful.
   - Body text: one or two short sentences.
   - Error: what happened, then what to do next.

4. Check the product truth.
   - Verify behavior from code when the text describes timing, channel, permissions, deletion, billing, legal agreement, or notification delivery.
   - If a notification may be queued, delayed, or conditional, say that honestly.

5. Update nearby tests/stories when changing code.
   - Storybook play tests often assert visible text.
   - Run targeted UI tests for changed Storybook files when practical.

## Element Patterns

### Buttons and CTAs

- Use concrete action text: `変更を保存`, `通知を確認`, `この募集を削除`, `確定シフトを送る`.
- Avoid `OK`, `送信`, `保存` when the object is unclear.
- For destructive actions, name the object and consequence in the dialog, not only the button.
- Keep staff-facing buttons especially simple: `提出する`, `もう一度開く`, `同意して続ける`.

### Dialogs

- Title: object plus action or status. Example: `送れなかった通知`, `スタッフ登録申請`, `スタッフを削除`.
- Body: describe what will happen after the action.
- Destructive body: state irreversibility directly. Prefer `この募集を削除すると元に戻せません。` over `本当に削除してよろしいですか？`.
- Async body: say the request is accepted, not that the downstream delivery already succeeded.

### Toasts

- Use short result text.
- Prefer `受け付けました` for background work: `送れなかった通知の再送を受け付けました`.
- Avoid success text that implies delivery success when only enqueueing or scheduling succeeded.
- When useful, name the target: `変更があるスタッフへの通知を受け付けました`.

### Empty States

- Write `事実 + 次の一歩`.
- Avoid only saying `ありません`.
- Example: `名前とメールアドレスでスタッフを追加できます。`
- For completed work, reassure with the cleared state: `もう一度送る必要がある通知はすべて処理済みです。`

### Errors

- Write what happened and how to recover.
- Avoid blaming the user.
- Avoid generic-only text: `エラーが発生しました`.
- For staff links, prefer simple phrasing: `このリンクでは提出できません`.
- For network/device issues, name a concrete action: reload, wait, or open in Safari/Chrome/Edge.

### Loading and Waiting

- Use waiting text only when there is truly no action the user can take.
- For managers, avoid passive instructions such as `しばらくお待ちください` when they can inspect progress.
- For staff approval or registration, waiting text can be appropriate if the next step depends on the shop.

### Tables and Field Labels

- Use short nouns: `スタッフ名`, `通知種別`, `募集期間`, `チャネル`, `検知日時`.
- Prefer `日ごと`, `時間指定`, `勤務区分` for submission-pattern labels.
- Keep table labels scannable; avoid full sentences in headers.

### Landing and Demo Copy

- Make claims concrete and modest.
- Prefer `パソコンでもスマホでも作成できます。` over comma-heavy or translated phrasing.
- Avoid vague continuity claims such as `現在と同じように提出できます`; say what the user actually does.
- Do not turn app UI copy into marketing copy. The first screen should still help the task.

## シフトリ Preferred Terms

Use these as defaults when they match the behavior.

| Prefer | Avoid | Note |
|---|---|---|
| 送れなかった通知 | 不達通知 | `不達` feels like internal delivery jargon. |
| 送れなかった相手を確認して、もう一度送れます。 | 送信できなかった通知を確認して再通知できます | Use human target and plain action. |
| 再送受付済み | 再通知済み | The row is accepted for resend, not necessarily delivered. |
| スタッフ登録申請 | スタッフ参加申請 | More concrete for shop operations. |
| スタッフ本人が登録できます | スタッフ自ら登録できます | More natural and less stiff. |
| メールで届きます | メールにて届きます | Avoid formal `にて` in app UI. |
| このリンクでは提出できません | このリンクは使用できません | Say what task cannot be done. |
| 定休日があれば選択してください。休みはシフト募集時にも変更できます。 | お休みの曜日を押してください。また、募集ごとに細かく調整することも可能です。 | Avoid childish `押してください` and stiff `可能です`. |
| LINE連携済みのスタッフにはLINE、それ以外のスタッフにはメール | LINE連携済みはLINE、未連携はメール | Use when a full sentence is needed; shorter form is fine in compact UI. |
| 提出内容をもとに、お店でシフトを調整しています。 | シフトは調整中です。 | More reassuring for staff. |

## Tone Rules

- Use polite plain app Japanese: `できます`, `してください`, `届きます`.
- Avoid excessive keigo: `お願いいたします`, `よろしいですか`, `〜くださいませ`.
- Avoid childish verbs in manager UI: `押してください`, `おまちください`.
- Avoid stiff nouns when a verb is clearer: `再通知の実行` -> `もう一度送る`.
- Avoid duplicate meaning in one sentence.
- Use Japanese punctuation. Do not overuse exclamation marks.
- Keep one sentence to one idea, especially on mobile.

## Review Checklist

Before finalizing UI text, check:

- Does the text say what happened or what to do next?
- Is the actor clear: manager, staff, shop, or system?
- Does it avoid internal implementation terms?
- Does it avoid overpromising async notifications or delivery?
- Can a non-technical Japanese shop user understand it on first read?
- Is it shorter than the old text without losing the action?
- Are button labels specific enough without becoming long?
- Are destructive actions explicit about what cannot be undone?
- Are Storybook tests or snapshots that assert the old text updated?

## Review Output Format

When asked to review existing text, use this table unless the user requests another format:

| 優先度 | 画面 | 要素 | 現在の文言 | 違和感 | 改善案 |
|---|---|---|---|---|---|

Use `高 / 中 / 低` for priority.
Write the screen name as a user-recognizable screen, and the element as `Toast`, `Dialog title`, `CTAボタン`, `Empty state`, `説明文`, or `テーブル列`.
