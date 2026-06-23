# LINE通知連携

スタッフへのシフト通知を LINE Push と既存メールで自動振り分けする機能。設定UIなし、ゼロ負担を維持。

## 関連ファイル

### バックエンド（`convex/`）

- `convex/schema.ts` — `staffs` 拡張（`lineUserId` / `lineLinkedAt` / `lineFollowing`）+ `lineLinkTokens` / `lineQuotaStatus` / `notificationOutbox` テーブル
- `convex/http.ts` — `/line/webhook` エンドポイント登録
- `convex/crons.ts` — Quota 日次更新 cron
- `convex/line/schemas.ts` — Zod スキーマ
- `convex/line/queries.ts` — 連携状況・Quota・Webhook 用 staff 引き
- `convex/line/mutations.ts` — トークン発行 / 状態更新 / Webhook 受信ディスパッチ
- `convex/line/actions.ts` — `redeemLineToken`（公開）、Push 送信、Reply、Quota 更新、連携依頼メール送信
- `convex/line/webhook.ts` — `httpAction`（HMAC 検証 + イベントディスパッチ）
- `convex/_lib/lineSignature.ts` — HMAC-SHA256 署名検証
- `convex/_lib/lineClient.ts` — LINE API ラッパー（push / reply / quota / profile / token / authorizeUrl）
- `convex/_lib/notification.ts` — `selectChannel`（純粋関数）
- `convex/notification/actions.ts` / `convex/notification/reminderActions.ts` — 既存通知に LINE 振り分け統合
- `convex/notificationOutbox/` — LINE / メール通知の配送予約、重複排除、再試行 worker
- `convex/notification/templates.ts` — `buildLineInviteEmailHtml` / `buildLineCtaSection` / `buildShiftConfirmation/Recruitment/ReminderLineText`

### フロントエンド（`src/`）

- `src/routes/_unregistered/line.callback.tsx` — OAuth コールバックページ
- `src/components/features/Line/LineLinkQrDialog/` — シフト担当者UI: QR / URL 表示
- `src/components/features/Line/LineInviteConfirmContent/` — 個別連携依頼確認モーダル中身
- `src/components/features/Line/LineCallbackPage/` — コールバック完了 / エラー UI
- `src/components/features/Dashboard/StaffRoster/StaffRow.tsx` — `…` メニューに LINE 連携項目追加
- `src/components/features/Dashboard/DashboardContent/index.tsx` — モーダル接続
- `src/components/devtools/EmailPreview/` — Storybook でメール文面・LINE本文を VRT 管理

## 画面一覧

| 画面 | 役割 |
|---|---|
| シフト担当者ダッシュボード（既存）| StaffRow メニュー経由で連携リンク表示 / 個別連携依頼 |
| シフト担当者ダッシュボード（既存）| StaffRow メニュー経由で募集通知 / 現在の確定シフト通知を個別再送 |
| LineLinkQrDialog | QR 表示 + URL コピー |
| 連携依頼確認ダイアログ（個別） | 送信前の確認 |
| `/line/callback` | OAuth 完了画面（成功 / 期限切れ / レート超過 / エラー） |
| LINE 公式アカウントトーク画面 | 受信メッセージへ Reply API で定型応答 |

## API 一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.line.mutations.generateLinkToken` | mutation | シフト担当者UIから連携用QR/URL発行 |
| `api.line.mutations.sendInvite` | mutation | 個別スタッフへ連携依頼メール |
| `api.staff.mutations.sendOpenRecruitmentNotifications` | mutation | 個別スタッフへ現在送れる募集通知を再送予約 |
| `api.staff.mutations.sendCurrentShiftNotification` | mutation | 個別スタッフへ現在の確定シフト通知を再送予約 |
| `api.line.queries.getLinkStatusByShop` | query | 店舗のスタッフごと連携状況 |
| `api.line.queries.getQuotaStatus` | query | Quota 状態（normal / exceeded） |
| `api.line.actions.redeemLineToken` | action | OAuth コールバック処理（state 検証 → code 交換 → 連携完了） |
| `internal.line.actions.refreshQuotaStatus` | internalAction | cron で Quota DB 更新 |
| `internal.line.actions.sendInviteEmail` | internalAction | 連携依頼メールを通知 outbox へ予約 |
| `internal.notificationOutbox.actions.processPending` | internalAction | 通知 outbox の pending ジョブを少量ずつ配送 |
| `internal.line.mutations.dispatchWebhookEvents` | internalMutation | Webhook follow/unfollow/message ディスパッチ |
| `POST /line/webhook` | httpAction | LINE Messaging API Webhook 受信（署名検証） |

## 通知振り分けロジック

`convex/_lib/notification.ts` の `selectChannel(staff, quota)`:

- Quota が `exceeded` → email
- スタッフが連携済み（`lineUserId`）かつ友達追加中（`lineFollowing`）→ line
- それ以外 → email

Quota が未取得の場合は、LINE送信を試みる。LINE Push が失敗した場合は、通知outboxのfallback emailで補う。

呼び出し点は既存の `sendShiftConfirmationEmails` / `sendRecruitmentNotificationEmails` / `sendReminderEmails` action のスタッフごとループ内。配送は同期送信ではなく `notificationOutbox` に `pending` ジョブとして予約し、worker が少量ずつ処理する。

## LINE本文URLの外部ブラウザ対応

LINEメッセージ本文に載せるURLには `withOpenExternalBrowser()`（`convex/_lib/lineUrl.ts`）で `openExternalBrowser=1` を一律付与する。LINEアプリ内ブラウザではGoogle OAuthがブロックされる（403: disallowed_useragent）ため、リンクを端末の既定ブラウザで開かせる。適用箇所は `convex/notification/templates.ts` の `build*LineText()` 内部。メールHTML内のURLには付与しない。

## レートリミット

`convex/_lib/rateLimits.ts`:

- `lineLinkRedeem`: 5回/分（state先頭8文字キー） — OAuth コールバックのブルートフォース防御
- `lineWebhook`: 100回/分（global） — Webhook 暴発時のセーフティネット
- `lineInviteShort`: 3回/分（shopId + staffId キー） — 同じスタッフへの個別連携依頼の短時間連打防止

店舗単位の `lineInvite`（30回/時）は削除済み。1店舗で30人以上に連携依頼する通常運用は outbox に積んで順次配送し、同一スタッフへの短時間重複は `lineInviteShort` と outbox の `dedupeKey` で抑止する。

## 環境変数

| 変数 | 用途 |
|---|---|
| `LINE_LOGIN_CHANNEL_ID` | LINE Login チャネル ID（認可URL組み立て）|
| `LINE_LOGIN_CHANNEL_SECRET` | LINE Login チャネルシークレット（code 交換）|
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | Messaging API アクセストークン（push / reply / quota）|
| `LINE_MESSAGING_CHANNEL_SECRET` | Messaging API チャネルシークレット（Webhook 署名検証）|

未設定でも既存メール送信は動作する（CTA 非表示・LINE Push スキップ）。

## 初回セットアップ・追加スタッフへの通知

店舗初回セットアップ時に、シフト担当者ユーザーのメールアドレスへ LINE 連携依頼メールを送る。スタッフ追加時にも、スタッフ向け利用規約/プライバシーポリシー同意依頼メールとは別に LINE 連携依頼メールを送る。シフト募集中にスタッフを追加した場合、追加スタッフにも希望提出リンクをメールで送る。スタッフのメールアドレスを変更した場合も、変更後メールへ同じ対象募集の希望提出リンクを送る。LINEログイン完了時に友だち追加済み、またはWebhook followで `lineFollowing` が `true` になった場合は、同じ対象募集の希望提出リンクをLINEで送る。

- 対象募集: `status === "open"`、未削除、シフト開始前、締切前または締切当日
- シフト担当者向けLINE連携依頼メール: `setup.mutations.setupShopAndManager` から初回登録したシフト担当者スタッフ行に対して `internal.line.actions.sendInviteEmail` をスケジュール
- スタッフ向けLINE連携依頼メール: `staff.mutations.addStaffs` から追加スタッフごとに `internal.line.actions.sendInviteEmail` をスケジュール
- メール通知: `staff.mutations.addStaffs` から追加スタッフごとに `internal.notification.actions.sendOpenRecruitmentNotificationEmailsForStaff` をスケジュール
- メール変更時の追送: `staff.mutations.editStaff` でメールが実際に変わった場合だけ、変更後メールへ `internal.notification.actions.sendOpenRecruitmentNotificationEmailsForStaffEmailChange` をスケジュール。LINE受信可能なスタッフには送らず、未連携・unfollow・Quota超過時はメールで送る
- LINE通知: `line.mutations.finalizeLinking` / `dispatchWebhookEvents` から `internal.notification.actions.sendOpenRecruitmentNotificationLinesForStaff` をスケジュール
- 複数の対象募集がある場合は募集ごとに1通ずつ送る
- スタッフ一覧の個別メニューから、募集通知と現在の確定シフト通知を手動再送できる。通常は募集作成時・シフト確定時に自動通知されるため、不達時だけ使う補助導線として扱う。操作後のUIでは「送りました」と案内する

## 複数店舗での連携

LINE連携は `staffLineAccounts`（`staffId` 単位、各 `staffs` は1店舗に属する）で管理する。同じ人が複数店舗に所属する場合は店舗ごとに別 `staffs` レコードがあるため、**同一 `lineUserId` を店舗ごとに同時連携できる**。

- `finalizeLinking`: 同一 `lineUserId` の重複排除は**同一店舗内のみ**（同じ店舗で別スタッフに紐づいていた場合だけ旧アカウントを論理削除）。別店舗のアカウントは残す。
- `dispatchWebhookEvents`（follow/unfollow）: 同一 `lineUserId` に紐づく**全店舗のアカウント**へ following 状態を反映し、初回follow時は店舗（staff）ごとに同意依頼・募集通知をスケジュールする。
- 連携状況の引き当ては `getStaffLineAccount`（`staffId` 単位）で店舗ごとに独立して行う。

## 設計ドキュメント

`doc/plans/2026-05-06_LINE通知連携設計.md`
