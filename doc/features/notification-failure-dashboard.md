# 通知不達Dashboard

送信できなかった通知を `notificationFailureInbox` から店舗単位で読み取り、Dashboard の「今やること」から再通知を受け付ける機能。再通知は配送完了ではなく、Outbox または再通知 action に載った時点で受付済みとして扱う。

## 関連ファイル

### フロントエンド（`src/`）

- `src/pages/dashboard/index.tsx` — 店舗選択後に open 不達通知を取得し、Dashboardへ渡す
- `src/components/features/Dashboard/HeroSummary/index.tsx` — 「今やること」に不達通知カードを表示する
- `src/components/features/Dashboard/DashboardContent/index.tsx` — 不達通知Dialogの開閉、個別/一斉再通知mutation、受付済み状態を管理する
- `src/components/features/Dashboard/NotificationFailureDialog/` — 不達通知一覧、PCテーブル、SPリスト、Storybook

### バックエンド（`convex/`）

- `convex/notificationOutbox/queries.ts` — `notificationFailureInbox` の open 件をUI向けDTOで返す
- `convex/notificationOutbox/mutations.ts` — 個別/一斉再通知を受け付け、対象 failure を `retrying` にする
- `convex/notification/actions.ts` / `convex/notification/reminderActions.ts` — enqueue/preparation 失敗の再通知を1スタッフ・1募集単位でOutboxに載せる

## 画面一覧

| 画面 | 役割 |
|---|---|
| シフト担当者ダッシュボード | open 不達通知がある場合に `不達通知があります` カードを表示する |
| 不達通知Dialog | スタッフ名、通知種別、募集期間、チャネル、検知日時を表示し、個別/一斉に再通知を受け付ける |

## API 一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.notificationOutbox.queries.listOpenFailures` | query | 現在店舗の open 不達通知をUI表示用に返す |
| `api.notificationOutbox.mutations.resendFailure` | mutation | 1件の不達通知を再通知受付し、`retrying` にする |
| `api.notificationOutbox.mutations.resendOpenFailures` | mutation | 現在店舗の open 不達通知をまとめて再通知受付する |

## 表示ルール

- エラー理由、スタッフID、解決済み操作は表示しない。
- 再通知受付に成功した行は、開いているDialog内では `再通知済み` として押せなくする。
- Dialogを開き直すと `status = open` の不達通知だけを表示するため、`retrying` の行は表示されない。
- 非同期配送で再度失敗した場合は failure 記録により `open` として再表示される。
- 同じ通知種別・募集・スタッフの不達は最新1件だけを `open` として扱う。古い重複行は `resolved/superseded` になり、一覧や一斉再通知の対象にはしない。
