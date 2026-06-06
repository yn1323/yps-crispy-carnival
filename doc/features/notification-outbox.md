# 通知配送outbox

LINE / メール通知を同期送信せず、Convex の `notificationOutbox` に `pending` ジョブとして予約し、worker が少量ずつ配送する仕組み。通常運用の30人・100人規模通知を入口でエラーにせず、外部APIの一時制限は再試行で吸収する。

## 関連ファイル

### バックエンド（`convex/`）

- `convex/schema.ts` — `notificationOutbox` テーブル定義
- `convex/notificationOutbox/schemas.ts` — outbox payload / status / channel validator
- `convex/notificationOutbox/types.ts` — enqueue helper 用の型
- `convex/notificationOutbox/enqueue.ts` — email / LINE ジョブ作成 helper
- `convex/notificationOutbox/mutations.ts` — enqueue / claim / sent / failed / retry の internal mutation
- `convex/notificationOutbox/actions.ts` — pending ジョブ配送 worker
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
| `internal.notificationOutbox.mutations.markSent` | internalMutation | 配送成功ジョブを `sent` にする |
| `internal.notificationOutbox.mutations.markRetry` | internalMutation | 一時エラーのジョブを `pending` に戻し、次回実行時刻を設定する |
| `internal.notificationOutbox.mutations.markFailed` | internalMutation | 恒久エラーまたは上限到達ジョブを `failed` にする |
| `internal.notificationOutbox.actions.processPending` | internalAction | claim 済みジョブを配送し、成功・再試行・失敗へ分類する |

## 配送ルール

- `email` は `sendResendEmail` 経由で配送し、outbox ID 由来の idempotency key を使う。
- Resend の一時エラーや retry header 対応は `convex/_lib/resend.ts` に集約する。
- `line` は LINE Push API に `X-Line-Retry-Key` を付けて配送する。
- LINE の 429 / 5xx は再試行し、恒久的な 4xx は `failed` にする。
- LINE quota が `exceeded` の場合、fallback email があれば email ジョブを enqueue して LINE ジョブは `failed` にする。
- `dedupeKey` が同じ active ジョブ（`pending` / `processing`）は重複作成しない。
- 店舗ごとの active 件数上限で攻撃的な連打を入口で止める。

## 関連ドキュメント

- `doc/features/line-notification.md`
