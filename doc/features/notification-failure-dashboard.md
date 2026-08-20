# 通知不達Dashboard

送信できなかった通知を `notificationFailureInbox` から店舗単位で読み取り、Dashboard の「要対応」から再通知または「無視する」を受け付ける機能。再通知は配送完了ではなく、Outbox または再通知 action に載った時点で受付済みとして扱う。

マネージャーがDashboardを開かないと不達に気づけないため、open 不達通知がある店舗で、対象店舗にスタッフとして所属するactive管理者へ、毎日 JST 17:00 に「Dashboardから再通知してください」というリマインダー（日次ダイジェスト）を送る。

## 関連ファイル

### フロントエンド（`src/`）

- `src/components/features/Dashboard/HeroSummary/index.tsx` — 「要対応」に不達通知カードを表示する
- `src/components/features/Dashboard/NotificationFailureRecovery/` — open 不達通知query、Dialogの開閉、個別/一斉再通知・無視操作のmutation、受付済み状態を所有する
- `src/components/features/Dashboard/NotificationFailureDialog/` — 不達通知一覧、PCテーブル、SPリスト、Storybook

### バックエンド（`convex/`）

- `convex/notificationOutbox/queries.ts` — `notificationFailureInbox` の open 件をUI向けDTOで返す
- `convex/notificationOutbox/mutations.ts` — 個別/一斉再通知を受け付けて対象 failure を `retrying` にするほか、無視操作を `resolved/dismissed` として記録する
- `convex/notificationOutbox/resendWebhook.ts` — Resend provider の配送遅延・失敗を履歴と現在状態へ反映する
- `convex/notificationOutbox/resendDelayedFailure.ts` — 最初の配送遅延から30分の猶予期限をOutboxごとに保持する
- `convex/notification/actions.ts` / `convex/notification/reminderActions.ts` — enqueue/preparation 失敗の再通知を1スタッフ・1募集単位でOutboxに載せる
- `convex/notificationOutbox/failureReminderActions.ts` / `failureReminderQueries.ts` — open 不達通知がある店舗のmanagerへ日次リマインダーを送る（cron `notification-failure-reminder-digest`）
- `convex/_lib/shopManagerRecipients.ts` — 組織人物を正本に店舗の有効管理者とLINE連携を解決する共通ヘルパー（承認依頼ダイジェストと共有）

## リマインダー（日次ダイジェスト）

- cron `notification-failure-reminder-digest`（JST 17:00 = UTC 08:00）が `internal.notificationOutbox.failureReminderActions.sendFailureReminderDigest` を起動する。
- `status = open` かつ最新失敗（`lastFailedAt`）が直近24時間以内（`NOTIFICATION_FAILURE_REMINDER_WINDOW_MS`）の不達通知がある店舗だけを対象にする。失敗が再発するたびに対象期間を再計算し、日次cronでは通常1回だけ送る。
- 配信先は、activeな組織管理者のうち、同じ組織人物に紐づく対象店舗のactiveな正規`staffs`を一意に解決できる人物だけとする。
  該当者が0人ならリマインダーを送らない。
- `organizationPeople.name`と`organizationPeople.email`を通知先の正本にする。
  組織共通のLINE連携が有効かつ友だち状態ならLINEを優先する。
- LINE未連携・友だち解除・Quota超過時は現在のシフト連絡先へメールで送り、配送直前に管理者権限、店舗所属、宛先を再確認する。
- メール / LINE のCTAは通知元店舗を `shop` クエリで指定したDashboard URLを使う。
- このリマインダー通知自体の配送が失敗しても`notificationFailureInbox`には記録しない。通知contextのallowlistで抑止し、メタ失敗でInboxを汚さない。

## 画面一覧

| 画面 | 役割 |
|---|---|
| シフト担当者ダッシュボード | open 不達通知がある場合に `送れなかった通知があります` カードを表示する |
| 送れなかった通知Dialog | スタッフ名、通知種別、募集期間、チャネル、検知日時を表示し、個別/一斉の再通知または無視操作を受け付ける |

## API 一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.notificationOutbox.queries.listOpenFailures` | query | 現在店舗の open 不達通知をUI表示用に返す |
| `api.notificationOutbox.mutations.resendFailure` | mutation | 1件の不達通知を再通知受付し、`retrying` にする |
| `api.notificationOutbox.mutations.resendOpenFailures` | mutation | 現在店舗の open 不達通知をまとめて再通知受付する |
| `api.notificationOutbox.mutations.resolveFailure` | mutation | 現在店舗の open かつDashboard表示対象の通知を `resolved/dismissed` にする |
| `POST /resend/webhook` | HTTP action | Resendの`email.delivery_delayed` / `email.failed` / `email.bounced` / `email.suppressed`を受信する。遅延は30分猶予、その他はopen不達通知へ即時反映する |
| `internal.notificationOutbox.mutations.recoverOverdueResendDelayedFailures` | internalMutation | 1分間隔cronから期限切れの配送遅延をbounded batchでopen不達通知へ昇格する |
| `internal.notificationOutbox.failureReminderActions.sendFailureReminderDigest` | internalAction | 毎日17:00 JSTに open 不達通知がある店舗のmanagerへリマインダーを送る |
| `internal.notificationOutbox.failureReminderQueries.listShopIdsWithRecentOpenFailuresPage` | internalQuery | 直近24時間以内に失敗した open 不達通知がある店舗IDをページングで返す |
| `internal.notificationOutbox.failureReminderQueries.getFailureReminderTargetForShop` | internalQuery | 店舗名、ダッシュボードURL、対象店舗にスタッフ所属するactive管理者のシフト連絡先とLINE連携状態を返す |

## 表示ルール

- 通知種別が`通知`（`other` = どの通知種別にもマッピングされないcontext）の不達は、管理画面から対応できる対象として扱わず、一覧・要対応有無（HeroSummaryの「送れなかった通知があります」カード）・日次リマインダーのいずれにも出さない。判定は`isManagerActionableNotificationFailure`（`convex/notificationOutbox/failureResend.ts`）。記録自体は`notificationFailureInbox`に残す（配送ログ・Resend webhook突合のため）。
- 個別の`resendFailure`は、IDを直接指定した`other`由来のOutbox失敗にactionable判定を再適用しない。管理画面の非表示とpublic mutationの保証を揃えるかは、[現行コードとの差分調査](../plans/2026-07-23_doc現行コード差分調査.md#4-コードと文書のどちらを直すか決める差分)に残す。
- 募集に紐づく不達は、対象 `recruitments` が非削除かつ `status = open` の場合だけ一覧・要対応有無・日次リマインダー・一斉再通知の対象にする。募集終了後の不達行は記録としては残すが、Dashboard では扱わない。
- エラー理由、スタッフID、解決済み操作は表示しない。
- 不達理由を画面では断定せず、何度も失敗する場合はスタッフの通知先やLINE連携状態を確認し、問題が見つからなければ時間をおいて再送するよう案内する。
- メール channel の不達には、スタッフ詳細で登録メールアドレスを確認すること、問題が見つからなければ時間をおいて再送すること、メールを利用できない場合は対象店舗のLINE連携リンクを案内できることを補足する。
- Resend provider由来の失敗・拒否・抑止は、既存行と同じ`送れなかった通知`として即時表示する。
  配送遅延は通知履歴へすぐ表示するが、最初の遅延から30分間は要対応へ表示せず、期限切れ回収後に同じ`送れなかった通知`として表示する。
  細かいprovider状態ラベルは出さない。
- 同じOutboxの配送遅延を再受信しても30分の期限は延長しない。
  猶予中により新しい配信成功を受信した場合は要対応へ出さず、hard failureを受信した場合は猶予を打ち切って即時表示する。
- 再通知受付に成功した行は、開いているDialog内では `再通知済み` として押せなくする。
- 「無視する」は確認Dialogを経て実行し、成功後は対象行を一覧から即時に外す。確認文は「無視すると一覧から削除され、再送されません。」とする。
- 無視した行は物理削除せず、`resolved/dismissed` と解決した担当者・日時を記録する。一覧・要対応有無・日次リマインダー・再通知対象からは外す。
- `resolveFailure` は現在店舗の `status = open` かつDashboard表示対象の行だけを受け付ける。再通知直後の `retrying`、解決済み、募集終了後、再通知不能な通知種別は `Not found` として扱う。
- Dialogを開き直すと `status = open` の不達通知だけを表示するため、`retrying` の行は表示されない。
- 無視操作または再通知のあとに同じ通知が再度失敗した場合は、同じ failure 記録が `open` に戻り再表示される。
- 最終失敗から30日を過ぎた不達通知は日次cronで `resolved/expired` になり、行は残したままDashboard表示と再通知対象から外れる。
- 同じ通知種別・募集・スタッフの不達は最新1件だけを `open` として扱う。古い重複行は `resolved/superseded` になり、一覧や一斉再通知の対象にはしない。
- `LINE連携案内`（context `line.sendInviteEmail`）の不達は募集に紐づかないため、PCテーブルの募集期間セルは `-`（ダッシュ）を表示し、SPカードでは募集期間行自体を出さない。
- `LINE連携案内` の再通知は `sourceType` を問わず `internal.line.actions.sendInviteEmail` を予約し、**送信のたびに新しいマジックリンク（連携トークン）を発行して送り直す**（既存 outbox の再実行で古いトークンを使い回さない）。スタッフIDがあれば再通知可能だが、連携依頼はメールで送るためメール未登録（空文字）のスタッフには再送しない。判定は `isLineInviteResendContext`（`convex/notificationOutbox/failureResend.ts`）。
