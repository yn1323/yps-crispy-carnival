# LINE通知連携

スタッフへのシフト通知を LINE Push と既存メールで自動振り分けする機能。設定UIなし、ゼロ負担を維持。

## 関連ファイル

### バックエンド（`convex/`）

- `convex/schema.ts` — `staffs` 拡張（`lineUserId` / `lineLinkedAt` / `lineFollowing`）+ `lineLinkTokens` / `lineQuotaStatus` テーブル
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
- `convex/notification/templates.ts` — `buildLineInviteEmailHtml` / `buildLineCtaSection` / `buildShiftConfirmation/Recruitment/ReminderLineText`

### フロントエンド（`src/`）

- `src/routes/_unregistered/line.callback.tsx` — OAuth コールバックページ
- `src/components/features/Line/LineLinkQrDialog/` — 店長UI: QR / URL 表示
- `src/components/features/Line/LineInviteConfirmContent/` — 個別連携依頼確認モーダル中身
- `src/components/features/Line/LineCallbackPage/` — コールバック完了 / エラー UI
- `src/components/features/Dashboard/StaffRoster/StaffRow.tsx` — `…` メニューに LINE 連携項目追加
- `src/components/features/Dashboard/DashboardContent/index.tsx` — モーダル接続

## 画面一覧

| 画面 | 役割 |
|---|---|
| 店長ダッシュボード（既存）| StaffRow メニュー経由で連携リンク表示 / 個別連携依頼 |
| LineLinkQrDialog | QR 表示 + URL コピー |
| 連携依頼確認ダイアログ（個別） | 送信前の確認 |
| `/line/callback` | OAuth 完了画面（成功 / 期限切れ / レート超過 / エラー） |
| LINE 公式アカウントトーク画面 | 受信メッセージへ Reply API で定型応答 |

## API 一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.line.mutations.generateLinkToken` | mutation | 店長UIから連携用QR/URL発行 |
| `api.line.mutations.sendInvite` | mutation | 個別スタッフへ連携依頼メール |
| `api.line.queries.getLinkStatusByShop` | query | 店舗のスタッフごと連携状況 |
| `api.line.queries.getQuotaStatus` | query | Quota 状態（normal / exceeded） |
| `api.line.actions.redeemLineToken` | action | OAuth コールバック処理（state 検証 → code 交換 → 連携完了） |
| `internal.line.actions.refreshQuotaStatus` | internalAction | cron で Quota DB 更新 |
| `internal.line.actions.sendInviteEmail` | internalAction | 連携依頼メール送信本体 |
| `internal.line.mutations.dispatchWebhookEvents` | internalMutation | Webhook follow/unfollow/message ディスパッチ |
| `POST /line/webhook` | httpAction | LINE Messaging API Webhook 受信（署名検証） |

## 通知振り分けロジック

`convex/_lib/notification.ts` の `selectChannel(staff, quota)`:

- Quota が未取得 or `exceeded` → email
- スタッフが連携済み（`lineUserId`）かつ友達追加中（`lineFollowing`）→ line
- それ以外 → email

呼び出し点は既存の `sendShiftConfirmationEmails` / `sendRecruitmentNotificationEmails` / `sendReminderEmails` action のスタッフごとループ内。

## レートリミット

`convex/_lib/rateLimits.ts`:

- `lineLinkRedeem`: 5回/分（state先頭8文字キー） — OAuth コールバックのブルートフォース防御
- `lineWebhook`: 100回/分（global） — Webhook 暴発時のセーフティネット
- `lineInvite`: 30回/時（shopId キー） — 個別連携依頼メールの連打防止

## 環境変数

| 変数 | 用途 |
|---|---|
| `LINE_LOGIN_CHANNEL_ID` | LINE Login チャネル ID（認可URL組み立て）|
| `LINE_LOGIN_CHANNEL_SECRET` | LINE Login チャネルシークレット（code 交換）|
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | Messaging API アクセストークン（push / reply / quota）|
| `LINE_MESSAGING_CHANNEL_SECRET` | Messaging API チャネルシークレット（Webhook 署名検証）|

未設定でも既存メール送信は動作する（CTA 非表示・LINE Push スキップ）。

## 追加スタッフへの募集中通知

スタッフ追加時に、スタッフ向け利用規約/プライバシーポリシー同意依頼メールとは別に LINE 連携依頼メールも送る。シフト募集中にスタッフを追加した場合、追加スタッフにも希望提出リンクをメールで送る。LINEログイン完了時に友だち追加済み、またはWebhook followで `lineFollowing` が `true` になった場合は、同じ対象募集の希望提出リンクをLINEで送る。

- 対象募集: `status === "open"`、未削除、締切前または締切当日
- LINE連携依頼メール: `staff.mutations.addStaffs` から追加スタッフごとに `internal.line.actions.sendInviteEmail` をスケジュール
- メール通知: `staff.mutations.addStaffs` から追加スタッフごとに `internal.notification.actions.sendOpenRecruitmentNotificationEmailsForStaff` をスケジュール
- LINE通知: `line.mutations.finalizeLinking` / `dispatchWebhookEvents` から `internal.notification.actions.sendOpenRecruitmentNotificationLinesForStaff` をスケジュール
- 複数の対象募集がある場合は募集ごとに1通ずつ送る

## 設計ドキュメント

`doc/plans/2026-05-06_LINE通知連携設計.md`
