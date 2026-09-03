# 通知配送outbox

LINE / メール通知を同期送信せず、Convex の `notificationOutbox` に `pending` ジョブとして予約し、worker が少量ずつ配送する仕組み。最大50人規模の通知を入口でエラーにせず、外部APIの一時制限は再試行で吸収する。

`notificationOutbox`はactive中だけ宛先・本文を含む配送ジョブの正とし、terminal化から30日後に機密payloadと生errorをredactする。管理画面で長期表示する安全なmetadataは`notificationHistory`へ分離する。

## 関連ファイル

### バックエンド（`convex/`）

- `convex/schema.ts` — `notificationOutbox` / `notificationHistory` / `notificationDeliveryEvents` / `notificationFailureInbox` / `notificationResendDelayedFailureDeadlines` / `notificationUsage` テーブル定義
- `convex/notificationOutbox/schemas.ts` — outbox payload / status / channel validator
- `convex/notificationOutbox/types.ts` — enqueue helper 用の型
- `convex/notificationOutbox/enqueue.ts` — email / LINE ジョブ作成 helper
- `convex/notificationOutbox/mutations.ts` — enqueue / claim / sent / failed / retry、履歴同期、配送イベント・要対応Inbox操作
- `convex/notificationOutbox/queries.ts` — スタッフ通知履歴と要対応通知失敗のページング取得
- `convex/notificationOutbox/actions.ts` — pending ジョブ配送 worker
- `convex/notificationOutbox/safeError.ts` — LINE / Resend / 内部失敗を固定taxonomyへ変換
- `convex/notificationOutbox/redaction.ts` — terminal payloadから宛先・本文・capability URLを除去
- `convex/notificationOutbox/maintenance.ts` — migration / retentionの残件をPIIなしのbounded queryで確認
- `convex/notificationOutbox/resendDelayedFailure.ts` — Resend配送遅延の猶予期限を作成・取得・削除する
- `convex/notificationOutbox/resendWebhook.ts` — Resend provider webhook を署名検証し、配信完了・配送遅延・失敗を履歴と現在状態へ反映
- `convex/crons.ts` — 1分ごとの outbox / fanout / 配送遅延期限回収、古い配送イベントログ削除、古いFailureInboxの期限切れ化
- `convex/_lib/resend.ts` — Resend 送信間隔・retry header 対応・idempotency key 指定
- `convex/_lib/resendWebhookSignature.ts` — Resend / Svix webhook 署名検証
- `convex/_lib/lineClient.ts` — LINE Push message送信、`X-Line-Retry-Key` 付与、エラー分類
- `convex/_lib/shopManagerRecipients.ts` — 組織人物を正本に店舗の有効管理者とLINE連携を解決する
- `convex/_lib/notificationDeliveryQueries.ts` — actionから共通の通知dry-run判定を参照するinternal query
- `convex/_lib/shiftAssignmentNormalization.ts` — 時間入力方式の確定通知とsnapshotが使うread-time正規化
- `convex/notification/templates.ts` — LINE Push payload の text / Flex message 型と通知文面builder
- `convex/notification/actions.ts` / `convex/notification/reminderActions.ts` — 募集開始・確定・再発行・催促通知の enqueue
- `convex/line/actions.ts` — LINE連携依頼メールの enqueue
- `convex/legal/actions.ts` — スタッフ法務同意通知の enqueue
- `convex/staffRegistration/actions.ts` — 店舗担当者向け日次ダイジェストの enqueue
- `convex/migrations/m019_notification_outbox_terminal_redaction.ts` — 旧Outbox shapeのmetadata backfillと期限切れpayload redaction
- `convex/migrations/m020_notification_failure_inbox_redaction.ts` — 期限切れFailureInboxのerror redaction
- `convex/migrations/m024_notification_outbox_narrow_prep.ts` — `purpose` / `notificationContext` / `deliverySuppressed`のNarrow前補完
- `convex/migrations/m030_notification_fanout_operations_narrow_prep.ts` — 旧fanout operationのsupersede discriminator補完
- `convex/migrations/m037_notification_outbox_scope_narrow_prep.ts` — 旧shop-scoped Outboxの`organizationId`補完とscope矛盾のconflict記録

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
| `internal.notificationOutbox.mutations.recordResendProviderIssue` | internalMutation | Resend provider の配送遅延・失敗イベントを既存outboxに照合する。初回遅延は猶予期限を作り、hard failureは要対応Inboxへ即時反映する |
| `internal.notificationOutbox.mutations.recordResendProviderDeliveryUpdate` | internalMutation | Resend provider の配信完了イベントを既存outboxに照合し、通知履歴へ反映する |
| `internal.notificationOutbox.mutations.recoverOverdueResendDelayedFailures` | internalMutation | 30分の猶予期限を過ぎた配送遅延をbounded batchで既存の失敗経路へ昇格する |
| `internal.notificationOutbox.mutations.deleteStaffNotificationHistoryBatch` | internalMutation | 削除済みスタッフの通知履歴を100件ずつ削除する |
| `internal.notificationOutbox.mutations.pruneExpiredEvents` | internalMutation | 保存期限を過ぎた配送イベントを少量ずつ削除 |
| `internal.notificationOutbox.mutations.redactExpiredTerminalData` | internalMutation | terminal化から30日を過ぎたOutboxの宛先・本文・capability URL・生errorを少量ずつredact |
| `internal.notificationOutbox.mutations.expireOldFailures` | internalMutation | 最終失敗から30日を過ぎたFailureInboxの生errorをredactし、`open` / `retrying` を `resolved/expired` にする |
| `internal.notificationOutbox.maintenance.getRedactionReadiness` | internalQuery | terminal時刻欠落と期限切れ未redactの有無を、IDやPIIを返さずstatus別0/1で確認する |
| `notificationOutbox.queries.listStaffNotificationHistory` | managerQuery | 選択店舗の有効なスタッフの通知履歴を、本文・宛先を除いたDTOでページング取得する |
| `notificationOutbox.queries.listOpenFailures` | managerQuery | 現在 `open` の要対応通知失敗をpayload抜きDTOでページング取得する |
| `notificationOutbox.queries.hasOpenFailures` | managerQuery | バッジ/通知向けに `open` な要対応通知失敗の有無だけを返す |
| `notificationOutbox.mutations.retryFailure` | managerMutation | 要対応Inboxのoutbox失敗を手動再送し、ジョブを `pending`、Inboxを `retrying` にする |
| `notificationOutbox.mutations.resolveFailure` | managerMutation | 同一店舗の open かつDashboard表示対象の失敗を手動で `resolved/dismissed` にする |
| `internal.notificationOutbox.actions.processPending` | internalAction | claim 済みジョブを配送し、成功・再試行・失敗へ分類する |
| `internal.notification.mutations.recoverNotificationFanoutOperations` | internalMutation | 予約漏れのpending fanoutと期限切れprocessing leaseをboundedに再予約する |
| `internal.notification.actions.sendCurrentShiftConfirmationForStaff` | internalAction | rolling deploy前に予約済みの旧個別通知を、新しい40件上限のdurable fanoutへ収束させる互換入口 |
| `POST /resend/webhook` | HTTP action | Resend の `email.delivered` / `email.delivery_delayed` / `email.failed` / `email.bounced` / `email.suppressed` を受信する |

## 配送ルール

- `enqueue` は重複排除と `pending` ジョブ作成だけを行う。大量通知時のOCCを避けるため、`_scheduled_functions` は読まない。
- `processPending` は1分間隔cronで起動する。batch が満杯の場合だけ自己継続し、backlog を追加で処理する。
- 新規 enqueue は少しだけ未来の `nextRunAt` にして、実行中 worker の `claimDue(now)` と同時にぶつかりにくくする。
- `email` は `sendResendEmail` 経由で配送し、outbox ID 由来の idempotency key と `shiftori_outbox_id` tag を使う。
- Resend 送信成功時に返る `email_id` は `notificationOutbox.resendEmailId` に保存し、provider webhook の照合キーにする。
- Resend の一時エラーや retry header 対応は `convex/_lib/resend.ts` に集約する。
- Resend provider webhook はparameter付きの`application/json`を受け付け、raw bodyを64 KiBまでに制限する。`Content-Length`は早期拒否にだけ使い、request streamの実byte数も検査する。
- `RESEND_WEBHOOK_SECRET` と `svix-*` headersで上限内のraw bodyを変更せずに署名検証し、検証後だけJSON objectをparseしてDBへ反映する。
  `email.delivered`はメールサーバー到達として履歴へ反映する。
  `email.failed` / `email.bounced` / `email.suppressed`は要対応Inboxへ即時反映し、`email.delivery_delayed`は対応する履歴へ即時反映したうえで30分の猶予を開始する。
- 配送遅延の猶予期限は最初の`email.delivery_delayed`の`occurredAt`から30分後で固定し、同じOutboxの遅延eventを再受信しても延長しない。
  猶予中はFailureInboxや管理者招待の`sendFailed`を作らず、1分間隔cronが期限切れを回収した時点で既存の失敗経路へ昇格する。
- 猶予中により新しい`email.delivered`を受信した場合は期限を削除して失敗扱いにしない。
  hard failureは期限を削除して即時失敗へ移る。
  専用期限行がない旧`email.delivery_delayed`状態は、導入前から失敗扱いだった既存データとの互換のため失敗として読む。
- 猶予期限は新しい空の`notificationResendDelayedFailureDeadlines`テーブルへ保存し、Outboxごとの一意性と期限順のbounded回収をindexで守る。
  既存の増加済みOutboxへ同一deployで新しい検索indexを追加しないための配置であり、利用者向けの30分猶予という契約は変わらない。
- provider eventは`occurredAt`で順序を判定し、古いeventで新しい履歴状態やFailureInboxを上書きしない。
- provider payload の店舗・スタッフ情報は信用しない。`resendEmailId` または `shiftori_outbox_id` tag から保存済み outbox を引き、`shopId` / `staffId` / `recruitmentId` / `notificationContext` を復元する。
- `line` は `payload.message` があればそのmessageを、なければ既存 `payload.text` からtext messageを作って LINE Push API に配送する。どちらも `X-Line-Retry-Key` を付ける。
- 新規のLINE Push通知は `payload.message.type === "flex"` を優先し、`payload.text` は既存ジョブ互換・altText・fallback用途として必須のまま保持する。
- LINE の 429 / 5xx は再試行し、恒久的な 4xx は `failed` にする。
- provider response body、email、token、capability URL、生例外messageはconsole、Outbox、配送event、FailureInbox、client responseへ出さない。永続化・ログには`line_rate_limited`、`email_recipient_rejected`等の固定taxonomyだけを残す。
- LINE quota が `exceeded` の場合、fallback email があれば email ジョブを enqueue して LINE ジョブは `failed` にする。
- `DEBUG_MODE=true`かつ`DEBUG_NOTIFICATION_DELIVERY_MODE=dry-run`の場合、メールとLINEをproviderへ送信しない。`force-failure`の場合もproviderを呼ばず、非リトライの失敗にする。設定方法は[デバッグ環境変数の運用](../manual/debug-mode.md)を参照する。
- `dedupeKey` が同じ active ジョブ（`pending` / `processing`）は重複作成しない。
- 募集・確定fanoutは対象スタッフを最大50人で固定し、10人ずつ処理する。確定通知の各batchは`targetStaffIds`ごとの`by_recruitmentId_staffId` indexだけを読み、募集全体のassignmentを毎回走査しない。
- 時間入力方式の新しい確定通知は、同一スタッフ・同一日・同一ポジションの完全隣接assignmentだけをread-timeで一つの時間帯へ統合する。  正の空白、異なるポジション、option付き割当、overlap、不正値は自動統合しない。  この読み込みで既存`shiftAssignments`は書き換えない。
- 募集・確定のdurable fanoutは `fanoutTargetKey`（semantic operation × staff）でchannelをまたいで同じOutboxを再利用する。`sent` / `failed` / `cancelled`後やemail/LINE選択の変更後にactionが再開しても、outbox ID由来のprovider idempotency keyを変えない。Widen前のrowはemail/LINE両方の旧dedupe keyを照合し、`fanoutTargetKey`と`fanoutOperationId`をlazy付与する。
- 確定fanoutの新規Outbox作成は、その本文に対応する`shiftConfirmationSnapshots`更新と同じtransactionで行う。通常のdedupe時は現在のsnapshotを上書きせず、先に固定済みのOutbox Aへ再開時のBを誤対応させない。例外としてatomic導入前の現在canonical Outboxにsnapshotだけが欠落した場合は、rolling互換のevidence gateが現在の割当・operation・Outboxの一致を確認できたときだけ修復する。
- `fanoutOperationId`を持つOutboxはprovider呼び出し直前にoperation、募集、店舗、対象スタッフを再照合する。確定通知は募集の`lastConfirmationNotificationOperationKey`と一致する最新世代だけを許可し、完走済みでも旧世代なら`notification_superseded`でcancelする。
- deploy前にenqueue済みで`fanoutOperationId`を持たない確定通知は、最新operationの対象とdedupe suffixに一致する場合だけ互換配送を許可する。別semantic rowは`notification_superseded`へ収束し、旧rowが最新operationからlazy参照された場合はIDを付与する。
- LINE fallback emailは元の`recruitmentId`と`fanoutOperationId`を継承し、fallback予約後に募集削除や世代更新が起きても同じ送信直前ゲートを通る。
- 確定通知のview linkは同じoperation × staffでtokenを再利用する。link作成後からOutbox作成前に24時間を超えて中断した場合だけ同じtokenの期限を延長し、Outbox作成後は保存済みpayloadとのURL不一致を避けるため延長しない。
- `recruitmentId`を持つ通知はprovider呼び出し直前に募集の存在、論理削除、スタッフのshift対象性を再確認し、削除済みなら`recruitment_inactive`、対象外なら`recipient_inactive`でcancelする。
- worker の高頻度な status 更新と衝突しないよう、`enqueue` は重複排除に必要な `dedupeKey` 範囲だけを読む。

## 管理者通知の宛先

- 店舗単位の管理通知は、スタッフ参加申請digest、シフト確定催促、店舗登録後の本番募集案内、通知不達digestを対象とする。
- 店舗単位の管理通知は、activeな`organizationMembers`と、同じ組織人物に紐づく対象店舗のactiveな正規`staffs`を両方一意に解決できる人物だけへ送る。
  該当者が0人ならメールとLINEのどちらも予約しない。
- `organizationPeople.name`と`organizationPeople.email`を店舗管理通知の正本にする。
  組織共通のLINE連携が有効かつ友だち状態ならLINEを優先し、それ以外は現在のシフト連絡先へメールで送る。
- 店舗管理通知のメール、LINE、Quota超過時のfallbackメールは、provider呼び出し直前に管理者権限、店舗のstaff所属、現在の宛先を再確認する。
  条件を満たさない場合は`recipient_inactive`でcancelする。
- 課金通知と管理者招待は組織単位の通知のままとし、店舗のstaff所属を受信条件にしない。
  シフトリから有効管理者へ送る課金関連メールは組織人物の連絡先を使い、Stripeが請求書やカード関連を送る`organizations.billingEmail`と分ける。
- Clerkのログイン用メールアドレスは通知先の正本として参照しない。

## 配送イベントログ（`notificationDeliveryEvents`）

通知配送の内部調査用ログ。Convex Dashboard で店舗・スタッフ・管理者ユーザー・通知種別・発生時刻・エラー内容を追うために使う。ユーザー/運用者が対応すべき現在状態は `notificationFailureInbox` に寄せる。

- 記録対象は `enqueue_failed` / `enqueue_preparation_failed` / `retry_scheduled` / `final_failed` / `fallback_enqueued` / `worker_failed` / `provider_delivery_issue` / `provider_delivery_update`。
- `createdAt` と `expiresAt` を保持し、90日後に日次cronで削除する。
- `shopId` / `recruitmentId` / `staffId` / `userId` / `outboxId` / `channel` / `dedupeKey` / `notificationContext` を、分かる範囲で保持する。
- provider event は `provider` / `providerEventId` / `providerEmailId` / `providerEventType` を最小限だけ保持し、`providerEventId` で重複処理を防ぐ。
- 問題系eventは生error本文を保存せず固定taxonomyだけを持つ。配信完了eventはerrorを持たず、メールHTMLやpayload全文も複製しない。

## 管理画面向け履歴（`notificationHistory`）

スタッフ詳細へ表示する通知metadata。Outboxのstate machineを置き換えず、Outboxの状態遷移とResend webhookから更新する読み取りモデルとして扱う。

- 実装後に新しくenqueueしたスタッフ向け実通知だけを記録し、過去のOutboxはbackfillしない。
- `shopId` / `staffId` / `channel` / `notificationKind` / `displayTitle` / 送信・配信状態と各時刻だけを保持する。
- 宛先、メールHTML、LINE本文、Flex Message、token URL、provider errorは保存しない。
- dry-run中の通知は履歴を作成しない。
- メールの`delivered`は受信側メールサーバーへの到達であり、開封を意味しない。LINEは個別到達を確認できない。
- スタッフ削除時はmanager queryから直ちに隠し、履歴本体をbounded cleanupで削除する。店舗・組織削除は既存の削除workflowで完走を確認する。

## 要対応Inbox（`notificationFailureInbox`）

通知失敗のうち、人が確認・再送・解決する現在状態を保持するテーブル。`notificationDeliveryEvents` は時系列ログ、`notificationOutbox` は配送ジョブ本体、`notificationFailureInbox` は要対応の要約という役割分担にする。

- `markFailed` が最終失敗した通知を `open` として upsert する。通知種別・募集・スタッフが同じ失敗はチャネルや再送runが違っても最新1件に寄せ、古いopen行は `resolved/superseded` にする。
- `recordDeliveryEvent` は `enqueue_failed` / `enqueue_preparation_failed` かつ `shopId` と `dedupeKey` が分かる場合だけ `open` として upsert する。通知種別・募集・スタッフが分かる場合は配送最終失敗と同じFailureInbox行へまとまる。`retry_scheduled` / `fallback_enqueued` / `worker_failed` は要対応扱いにしない。
- `recordResendProviderIssue` は `email.failed` / `email.bounced` / `email.suppressed` を `sourceType: "provider"` として即時に `open` にする。
  `email.delivery_delayed`は猶予期限が切れた後だけ同じ形で`open`へ昇格する。
  outbox照合できないeventはユーザー向けInboxに出さない。
- `enqueue_preparation_failed` は magic link 作成、LINE CTA 作成、メール/LINE payload 構築など、Outbox ジョブ作成前に落ちた失敗を表す。募集作成通知、現在募集中シフト通知、催促通知、確定シフト通知で staff ごとに記録する。
- `markSent` は同じ outbox のInbox行を `resolved/sent` にする。
- `retryFailure` は manager mutation として同一店舗の `open` な outbox 失敗だけを `retrying` にし、配送ジョブを `pending` に戻す。再失敗すれば `markFailed` が `open` に戻す。
- `resolveFailure` は manager mutation として同一店舗の `open` かつDashboard表示対象の失敗だけを `resolved/dismissed` にする。行は削除せず、解決した担当者と日時を保持する。
- 最終失敗 `lastFailedAt` から30日を過ぎた行は、statusを問わず日次cronで`lastError` / `errorName` / `lastEventId`をredactする。過去の初回失敗後に新しい失敗が記録された行は保持し、`open` / `retrying` は期限到達時に `resolved/expired` としてDashboard表示と再通知対象から外す。
- メールHTML、LINE本文、LINE Flex JSON、payload全文は複製しない。Inboxは `recruitmentId` / `staffId` / `channel` / `dedupeKey` / `notificationContext` / 最終エラーなどの要約だけを持つ。
- `sourceType: "outbox"` は既存 outbox job を `retryFailure` で再実行できる。`sourceType: "enqueue"` / `"enqueue_preparation"` は outbox job が存在しないため、UIからの個別再送では通知種別ごとの再送処理で新しく Outbox に投入する。
- 既存データの重複open行は `m006_notification_failure_inbox_collapse_duplicates` migration で最新1件だけを残し、古い行を `resolved/superseded` にする。

## terminal payload / errorの保持と移行

- `sent` / `failed` / `cancelled` は`terminalAt`から30日間だけ配送payloadを保持し、期限後はkind・`notificationContext`・`deliverySuppressed`・dedupe・監査ID・状態時刻だけを残す。
- `pending` / `processing` は送信に必要なためretention対象外にする。
- `organizationId` / `purpose` / `notificationContext` / `deliverySuppressed`はrequiredである。  現行readerは保存済みOutboxを店舗所属やpayloadへ戻して補完しない。
- 新規enqueueは`purpose`を明示し、canonicalな`organizationId`を保存する。  旧scheduled引数に限り、互換stubが必須値へ正規化してから保存する。
- m037は、`organizationId`が欠損し、参照店舗とその事業者が実在するrowだけを店舗の所属へ補完する。両scope欠損、dangling参照、保存済み事業者と店舗所属の不一致はtenant scopeを推測せず、`organizationMigrationConflicts`へPIIなしで記録する。`organizationBillingVersionAtEnqueue`はenqueue時点のsnapshotなので現在値から補完せず、業務上optionalのまま維持する。
- `notificationFanoutOperations.supersedesActiveOperations`はrequiredである。  `false`の個別再送だけが持つ二つのbaselineは条件付きfieldのまま維持し、欠損rowはreadinessでfail closedに確認する。
- `magicLinks.notificationOperationKey` と `notificationOutbox.fanoutTargetKey` / `fanoutOperationId` はoptional wideningとする。旧view linkへ誤ったoperationを割り当てる方が危険なため一括backfillは行わず、旧Outboxは再開時にemail/LINE両方の既存dedupe keyを照合してtarget keyとoperation IDをlazy付与する。旧scheduled actionが残っていないことと、optional field未設定の新規fanout link/Outboxが0件であることを確認できた後にだけnarrowを検討する。
- `notificationFanoutOperations.scheduledFunctionId`もoptional wideningとし、既存operationに一括backfillしない。回復cronが予約漏れ・失敗済みscheduler rowだけを再予約してIDを保存し、生存中のpending / in-progress scheduler rowは重ねない。batch完了時はlease回収予約をcancelしてから次batchを予約する。
- rolling deployでは旧`sendCurrentShiftConfirmationForStaff` action名・旧query return shape・旧`upsertConfirmationSnapshot` mutation名を1互換期間残す。pendingの旧actionは新しいdurable fanoutへ移す。in-progress旧actionのsnapshot mutationは、渡されたraw assignmentsと従来signatureの整合性を先に検証する。  時間入力方式はその後に保存済みと現在の割当をsemantic canonicalizeし、splitとmergedの表現差だけなら同値とする。  壊れたsignatureは同値とせず、新しいsnapshotはcanonical assignmentsから従来方式のsignatureを再計算して保存する。  最新確定operation×staffのcanonical Outboxが実在する場合だけ互換snapshotを保存し、受付時baselineを復元できない旧`manualConfirmation` Outboxは、enqueue時とprovider呼び出し直前の両方で`notification_superseded`へfail closedする。  作成済みOutboxのpayload、dedupe key、fanout operation、provider idempotency keyは書き換えない。
- `m019`、`m020`、`m024`、`m030`、`m037`は`@convex-dev/migrations`のcursor / batchを使う。各rowのmarkerまたは現在のscopeを確認してpatchするため、停止後のresumeと再実行はidempotentである。

deploy前後の確認は次の順で行う。

```bash
npx convex run migrations/index:runNotificationTerminalRedaction '{"dryRun":true}' --push --deployment <fully-qualified-deployment>
npx convex run migrations/index:runNotificationTerminalRedaction --deployment <fully-qualified-deployment>
npx convex run --component migrations lib:getStatus --watch --deployment <fully-qualified-deployment>
npx convex run notificationOutbox/maintenance:getRedactionReadiness --deployment <fully-qualified-deployment>
```

`lib:getStatus`はmigrationのcursor完走を確認する正とする。
`getRedactionReadiness`はindexでboundedに走査し、terminal時刻欠落、期限切れterminal未redact、期限切れFailureInbox未redactがすべて0で`ready: true`になることを別に確認する。
Narrow artifactの反映前には、m024 / m025 / m037の成功、`verifyNotificationOutbox`の全scope異常0件、`verifyOrganizationMigrationConflicts.unresolvedNotificationOutboxScopeRows: 0`を対象deploymentごとに確認する。

個別再送behaviorをrollbackする場合は、最初にmanual受付を停止する。`supersedesActiveOperations: false`のoperationと参照Outboxをdrainまたはcancelし、欠落0を確認するまではundefinedを旧canonicalとして読むcompat readerとprovider直前gateを維持する。false operation / Outboxの残件と通知欠落が0になった後にだけbehaviorを戻し、optional fieldは互換期間が終わるまで残す。

## 通知使用量カウント（`notificationUsage`）

店舗ごとの通知送信数を月単位（JST、`"YYYY-MM"`）で集計するテーブル。オーナーがResend / LINEの課金プラン判断やデータ分析に使う。

- 店舗×月で1行。`emailCount` / `lineCount` をチャネル別に保持する。
- `markSent` が成功遷移したときだけインクリメントする（dedupe・failed・retry中はカウントしない。LINEのfallback emailは実際に送れた時点でemailとして数える）。
- dry-run等で実際には配送していないジョブはカウントしない（`isNotificationDeliverySuppressed` を送信時と同じ最終ゲートとして使う）。
- 既に `sent` のジョブを再度 `markSent` しても二重カウントしない。
- 閲覧UIはなし。Convexダッシュボードの `notificationUsage` テーブルを直接確認する。

## 関連ドキュメント

- `doc/features/notification-history.md`
- `doc/features/line-notification.md`
