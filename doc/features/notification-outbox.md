# 通知配送outbox

LINE / メール通知を同期送信せず、Convex の `notificationOutbox` に `pending` ジョブとして予約し、worker が少量ずつ配送する仕組み。通常運用の30人・100人規模通知を入口でエラーにせず、外部APIの一時制限は再試行で吸収する。

## 関連ファイル

### バックエンド（`convex/`）

- `convex/schema.ts` — `notificationOutbox` / `notificationDeliveryEvents` / `notificationFailureInbox` / `notificationUsage` テーブル定義
- `convex/notificationOutbox/schemas.ts` — outbox payload / status / channel validator
- `convex/notificationOutbox/types.ts` — enqueue helper 用の型
- `convex/notificationOutbox/enqueue.ts` — email / LINE ジョブ作成 helper
- `convex/notificationOutbox/mutations.ts` — enqueue / claim / sent / failed / retry と配送失敗イベント・要対応Inbox操作
- `convex/notificationOutbox/queries.ts` — 要対応通知失敗のページング取得 / 有無確認
- `convex/notificationOutbox/actions.ts` — pending ジョブ配送 worker
- `convex/crons.ts` — 1分ごとの outbox 回収と古い配送イベントログ削除
- `convex/_lib/resend.ts` — Resend 送信間隔・retry header 対応・idempotency key 指定
- `convex/_lib/lineClient.ts` — LINE Push の `X-Line-Retry-Key` 付与とエラー分類
- `convex/notification/actions.ts` / `convex/notification/reminderActions.ts` — 募集開始・確定・再発行・催促通知の enqueue
- `convex/line/actions.ts` — LINE連携依頼メールの enqueue
- `convex/legal/actions.ts` — スタッフ法務同意通知の enqueue
- `convex/staffRegistration/actions.ts` — 店舗担当者向け日次ダイジェストの enqueue

## 画面一覧

なし。バックエンド配送基盤のため、既存の通知操作画面から利用する。

## API 一覧

| API | 種別 | 用途 |
|---|---|---|
| `internal.notificationOutbox.mutations.enqueue` | internalMutation | `pending` ジョブを作成。active な同一 `dedupeKey` があれば重複作成しない |
| `internal.notificationOutbox.mutations.claimDue` | internalMutation | 実行時刻を迎えた `pending` ジョブを少量 claim して `processing` にする |
| `internal.notificationOutbox.mutations.markSent` | internalMutation | 配送成功ジョブを `sent` にし、`notificationUsage` の月次カウントを加算する |
| `internal.notificationOutbox.mutations.markRetry` | internalMutation | 一時エラーのジョブを `pending` に戻し、次回実行時刻を設定する |
| `internal.notificationOutbox.mutations.markFailed` | internalMutation | 恒久エラーまたは上限到達ジョブを `failed` にする |
| `internal.notificationOutbox.mutations.recordDeliveryEvent` | internalMutation | enqueue失敗・enqueue準備失敗・retry・最終失敗・fallback等の配送イベントを内部調査用に記録 |
| `internal.notificationOutbox.mutations.pruneExpiredEvents` | internalMutation | 保存期限を過ぎた配送イベントを少量ずつ削除 |
| `notificationOutbox.queries.listOpenFailures` | managerQuery | 現在 `open` の要対応通知失敗をpayload抜きDTOでページング取得する |
| `notificationOutbox.queries.hasOpenFailures` | managerQuery | バッジ/通知向けに `open` な要対応通知失敗の有無だけを返す |
| `notificationOutbox.mutations.retryFailure` | managerMutation | 要対応Inboxのoutbox失敗を手動再送し、ジョブを `pending`、Inboxを `retrying` にする |
| `notificationOutbox.mutations.resolveFailure` | managerMutation | 要対応Inboxの失敗を手動で `resolved/dismissed` にする |
| `internal.notificationOutbox.actions.processPending` | internalAction | claim 済みジョブを配送し、成功・再試行・失敗へ分類する |

## 配送ルール

- `enqueue` は重複排除と `pending` ジョブ作成だけを行う。大量通知時のOCCを避けるため、`_scheduled_functions` は読まない。
- `processPending` は1分間隔cronで起動する。batch が満杯の場合だけ自己継続し、backlog を追加で処理する。
- 新規 enqueue は少しだけ未来の `nextRunAt` にして、実行中 worker の `claimDue(now)` と同時にぶつかりにくくする。
- `email` は `sendResendEmail` 経由で配送し、outbox ID 由来の idempotency key を使う。
- Resend の一時エラーや retry header 対応は `convex/_lib/resend.ts` に集約する。
- `line` は LINE Push API に `X-Line-Retry-Key` を付けて配送する。
- LINE の 429 / 5xx は再試行し、恒久的な 4xx は `failed` にする。
- LINE quota が `exceeded` の場合、fallback email があれば email ジョブを enqueue して LINE ジョブは `failed` にする。
- `DEBUG_NOTIFY_FAIL` に空でない値がある場合、メール/LINE送信は dry-run より優先して非リトライの失敗にする。FailureInbox の確認用デバッグスイッチとして扱い、実送信は行わない。
- `dedupeKey` が同じ active ジョブ（`pending` / `processing`）は重複作成しない。
- worker の高頻度な status 更新と衝突しないよう、`enqueue` は重複排除に必要な `dedupeKey` 範囲だけを読む。

## 配送イベントログ（`notificationDeliveryEvents`）

通知配送の内部調査用ログ。Convex Dashboard で店舗・スタッフ・管理者ユーザー・通知種別・発生時刻・エラー内容を追うために使う。ユーザー/運用者が対応すべき現在状態は `notificationFailureInbox` に寄せる。

- 記録対象は `enqueue_failed` / `enqueue_preparation_failed` / `retry_scheduled` / `final_failed` / `fallback_enqueued` / `worker_failed`。
- `createdAt` と `expiresAt` を保持し、90日後に日次cronで削除する。
- `shopId` / `recruitmentId` / `staffId` / `userId` / `outboxId` / `channel` / `dedupeKey` / `notificationContext` を、分かる範囲で保持する。
- エラー本文は長すぎる場合に丸める。メールHTMLやpayload全文は複製しない。

## 要対応Inbox（`notificationFailureInbox`）

通知失敗のうち、人が確認・再送・解決する現在状態を保持するテーブル。`notificationDeliveryEvents` は時系列ログ、`notificationOutbox` は配送ジョブ本体、`notificationFailureInbox` は要対応の要約という役割分担にする。

- `markFailed` が最終失敗した通知を `open` として upsert する。通知種別・募集・スタッフが同じ失敗はチャネルや再送runが違っても最新1件に寄せ、古いopen行は `resolved/superseded` にする。
- `recordDeliveryEvent` は `enqueue_failed` / `enqueue_preparation_failed` かつ `shopId` と `dedupeKey` が分かる場合だけ `open` として upsert する。通知種別・募集・スタッフが分かる場合は配送最終失敗と同じFailureInbox行へまとまる。`retry_scheduled` / `fallback_enqueued` / `worker_failed` は要対応扱いにしない。
- `enqueue_preparation_failed` は magic link 作成、LINE CTA 作成、メール/LINE payload 構築など、Outbox ジョブ作成前に落ちた失敗を表す。募集作成通知、現在募集中シフト通知、催促通知、確定シフト通知で staff ごとに記録する。
- `markSent` は同じ outbox のInbox行を `resolved/sent` にする。
- `retryFailure` は manager mutation として同一店舗の `open` な outbox 失敗だけを `retrying` にし、配送ジョブを `pending` に戻す。再失敗すれば `markFailed` が `open` に戻す。
- `resolveFailure` は manager mutation として同一店舗の失敗を `resolved/dismissed` にする。
- メールHTML、LINE本文、payload全文は複製しない。Inboxは `recruitmentId` / `staffId` / `channel` / `dedupeKey` / `notificationContext` / 最終エラーなどの要約だけを持つ。
- `sourceType: "outbox"` は既存 outbox job を `retryFailure` で再実行できる。`sourceType: "enqueue"` / `"enqueue_preparation"` は outbox job が存在しないため、UIからの個別再送では通知種別ごとの再送処理で新しく Outbox に投入する。
- 既存データの重複open行は `m006_notification_failure_inbox_collapse_duplicates` migration で最新1件だけを残し、古い行を `resolved/superseded` にする。

## 通知使用量カウント（`notificationUsage`）

店舗ごとの通知送信数を月単位（JST、`"YYYY-MM"`）で集計するテーブル。オーナーがResend / LINEの課金プラン判断やデータ分析に使う。

- 店舗×月で1行。`emailCount` / `lineCount` をチャネル別に保持する。
- `markSent` が成功遷移したときだけインクリメントする（dedupe・failed・retry中はカウントしない。LINEのfallback emailは実際に送れた時点でemailとして数える）。
- dry-run等で実際には配送していないジョブはカウントしない（`isNotificationDeliverySuppressed` を送信時と同じ最終ゲートとして使う）。
- 既に `sent` のジョブを再度 `markSent` しても二重カウントしない。
- 閲覧UIはなし。Convexダッシュボードの `notificationUsage` テーブルを直接確認する。

## 関連ドキュメント

- `doc/features/line-notification.md`
