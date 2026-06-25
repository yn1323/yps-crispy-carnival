# シフト確定催促リマインダー

シフト募集の提出締め切り日の翌日17:00 (JST) に、その募集がまだ確定（`status: "confirmed"`）になっていなければ、店舗のマネージャー全員へ「スタッフの希望を確認してシフトを調整・確定しましょう」と催促する通知。締め切り後にシフト確定が放置されてスタッフに確定シフトが届かない事態を防ぐ。

補助的な通知のため、**送信に失敗しても要対応Inbox（`notificationFailureInbox`）には載せない**。配送イベントログ（`notificationDeliveryEvents`）には従来どおり記録される。

## トリガー方式

スタッフ向け提出催促（`reminderScheduledAt` / `sendReminderEmails`）と同じく、募集作成時に `ctx.scheduler.runAt` で締切翌日17:00に予約する。締切は作成後に編集できない（`recruitment/mutations.ts` は作成・削除のみ）ため再スケジュールは不要。発火時に募集が削除済み / 確定済みなら送信しない。

- 既知の制限: 本機能のデプロイ前から存在する募集には予約が付かない（スタッフ催促と同じ割り切り）。

## 関連ファイル

### バックエンド（`convex/`）

- `convex/shiftConfirmationReminder/queries.ts` — 送信対象（店舗・募集情報・マネージャー一覧）を取得。削除済み/確定済みは `null`
- `convex/shiftConfirmationReminder/actions.ts` — マネージャーへのリマインダーを LINE / メールで enqueue する worker
- `convex/recruitment/mutations.ts` — `createRecruitment` で締切翌日17:00に `runAt` 予約
- `convex/_lib/dateFormat.ts` — `getManagerConfirmationReminderAt`（締切翌日17:00 JSTのUnix ms）
- `convex/notification/templates.ts` — `buildShiftConfirmationReminderEmailHtml` / `buildShiftConfirmationReminderLineText` / `SHIFT_CONFIRMATION_REMINDER_SUBJECT`
- `convex/notificationOutbox/failureSuppress.ts` — failureInbox抑止の context 定数・判定
- `convex/notificationOutbox/mutations.ts` — `markFailed` / `recordDeliveryEvent` で抑止 context を failureInbox から除外
- `convex/notificationOutbox/enqueue.ts` — email / LINE ジョブ作成 helper（再利用）

## 画面一覧

なし。バックエンドの自動通知のため、マネージャーはメール / LINE で受信し、CTAからDashboardへ遷移する。

## API 一覧

| API | 種別 | 用途 |
|---|---|---|
| `internal.shiftConfirmationReminder.queries.getManagerConfirmationReminderTarget` | internalQuery | 募集が `open` のときだけ、店舗名・期間・締切ラベル・Dashboard URL・マネージャー受信者一覧を返す。削除済み/確定済み/対象不在は `null` |
| `internal.shiftConfirmationReminder.actions.sendManagerConfirmationReminder` | internalAction | マネージャーごとに LINE（emailフォールバック付き）またはメールを enqueue する |

## failureInbox に載せない仕組み

通知の `context`（`shiftConfirmationReminder.sendManagerConfirmationReminder`）で抑止する。email payload と fallbackEmail payload の双方にこの context を設定するため、配送経路にかかわらず判定が効く。

- worker 配送失敗 → `markFailed`: 抑止 context のため要対応Inbox upsert をスキップ。
- enqueue 失敗 → `recordDeliveryEvent(enqueue_failed)`: 同様にスキップ。
- LINE quota 超過時は fallback email へ切り替わる既存挙動のまま、最終的に失敗しても上記で抑止。
- いずれも `notificationDeliveryEvents` には記録が残る。

## 関連ドキュメント

- `doc/features/notification-outbox.md`
- `doc/features/line-notification.md`
- `doc/features/shift-recruitment-management.md`
