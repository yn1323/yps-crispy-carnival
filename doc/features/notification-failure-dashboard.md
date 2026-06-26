# 通知不達Dashboard

送信できなかった通知を `notificationFailureInbox` から店舗単位で読み取り、Dashboard の「今やること」から再通知を受け付ける機能。再通知は配送完了ではなく、Outbox または再通知 action に載った時点で受付済みとして扱う。

マネージャーがDashboardを開かないと不達に気づけないため、open 不達通知がある店舗のmanager usersへ、毎日 JST 17:00 に「Dashboardから再通知してください」というリマインダー（日次ダイジェスト）を送る。

## 関連ファイル

### フロントエンド（`src/`）

- `src/pages/dashboard/index.tsx` — 店舗選択後に open 不達通知を取得し、Dashboardへ渡す
- `src/components/features/Dashboard/HeroSummary/index.tsx` — 「今やること」に不達通知カードを表示する
- `src/components/features/Dashboard/DashboardContent/index.tsx` — 不達通知Dialogの開閉、個別/一斉再通知mutation、受付済み状態を管理する
- `src/components/features/Dashboard/NotificationFailureDialog/` — 不達通知一覧、PCテーブル、SPリスト、Storybook

### バックエンド（`convex/`）

- `convex/notificationOutbox/queries.ts` — `notificationFailureInbox` の open 件をUI向けDTOで返す
- `convex/notificationOutbox/mutations.ts` — 個別/一斉再通知を受け付け、対象 failure を `retrying` にする
- `convex/notificationOutbox/resendWebhook.ts` — Resend provider の配送遅延・失敗を `notificationFailureInbox` に反映する
- `convex/notification/actions.ts` / `convex/notification/reminderActions.ts` — enqueue/preparation 失敗の再通知を1スタッフ・1募集単位でOutboxに載せる
- `convex/notificationOutbox/failureReminderActions.ts` / `failureReminderQueries.ts` — open 不達通知がある店舗のmanagerへ日次リマインダーを送る（cron `notification-failure-reminder-digest`）
- `convex/_lib/shopManagerRecipients.ts` — 店舗のmanager usersを通知受信者として組み立てる共通ヘルパー（承認依頼ダイジェストと共有）

## リマインダー（日次ダイジェスト）

- cron `notification-failure-reminder-digest`（JST 17:00 = UTC 08:00）が `internal.notificationOutbox.failureReminderActions.sendFailureReminderDigest` を起動する。
- `status = open` かつ最新失敗（`lastFailedAt`）が直近3日以内（`NOTIFICATION_FAILURE_REMINDER_WINDOW_MS`）の不達通知がある店舗だけを対象にする。失敗が再発するたびに窓がリセットされ、無ければ最大3回で打ち切られる。
- 配信先は店舗のmanager users全員。LINE連携済みなら LINE（emailフォールバック付き）、それ以外はメール。
- このリマインダー通知自体の配送が失敗しても `notificationFailureInbox` には記録しない（payloadの `suppressFailureInbox` で抑止。メタ失敗でInboxを汚さないため）。

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
| `POST /resend/webhook` | HTTP action | Resend の `delivery_delayed` / `failed` / `bounced` / `suppressed` を受信し、open 不達通知に反映する |
| `internal.notificationOutbox.failureReminderActions.sendFailureReminderDigest` | internalAction | 毎日17:00 JSTに open 不達通知がある店舗のmanagerへリマインダーを送る |
| `internal.notificationOutbox.failureReminderQueries.listShopIdsWithRecentOpenFailuresPage` | internalQuery | 直近3日以内に失敗した open 不達通知がある店舗IDをページングで返す |
| `internal.notificationOutbox.failureReminderQueries.getFailureReminderTargetForShop` | internalQuery | 店舗名、ダッシュボードURL、通知対象manager users、LINE連携状態を返す |

## 表示ルール

- エラー理由、スタッフID、解決済み操作は表示しない。
- メール channel の不達が含まれる場合は「メールが届かない場合は、メールアドレスに誤りがないか確認ください。それでも失敗する場合は、スタッフ行のメニューからLINE連携リンクを案内できます。」と補足する。
- Resend provider 由来の遅延・失敗・拒否・抑止は、既存行と同じ `送れなかった通知` として表示する。細かい provider 状態ラベルは出さない。
- 再通知受付に成功した行は、開いているDialog内では `再通知済み` として押せなくする。
- Dialogを開き直すと `status = open` の不達通知だけを表示するため、`retrying` の行は表示されない。
- 非同期配送で再度失敗した場合は failure 記録により `open` として再表示される。
- 初回失敗から30日を過ぎた不達通知は日次cronで `resolved/expired` になり、行は残したままDashboard表示と再通知対象から外れる。
- 同じ通知種別・募集・スタッフの不達は最新1件だけを `open` として扱う。古い重複行は `resolved/superseded` になり、一覧や一斉再通知の対象にはしない。
