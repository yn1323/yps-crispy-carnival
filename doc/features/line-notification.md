# LINE通知連携

スタッフへのシフト通知をLINE Pushと既存メールへ自動で振り分ける機能。
通知チャネルを手動で選ぶ設定は持たず、スタッフの連携状態に応じて切り替える。

## 関連ファイル

### バックエンド（`convex/`）

- `convex/schema.ts` — `staffLineAccounts` / `lineLinkTokens` / `lineQuotaStatus` / `lineWebhookMessageReceipts` / `notificationOutbox` テーブル
- `convex/http.ts` — `/line/webhook` エンドポイント登録
- `convex/crons.ts` — Quota 日次更新とWebhook message receipt削除のcron
- `convex/line/schemas.ts` — Zod スキーマ
- `convex/line/queries.ts` — 連携状況・Quota・Webhook 用 staff 引き
- `convex/line/mutations.ts` — トークン発行 / 状態更新 / Webhook 受信ディスパッチ
- `convex/line/actions.ts` — `redeemLineToken`（公開）、Push 送信、Reply、Quota 更新、連携依頼メール送信
- `convex/line/webhook.ts` — `httpAction`（HMAC 検証 + イベントディスパッチ）
- `convex/_lib/lineSignature.ts` — HMAC-SHA256 署名検証
- `convex/_lib/lineClient.ts` — LINE API ラッパー（Flex/text push / reply / quota / profile / token / authorizeUrl）
- `convex/_lib/notification.ts` — `selectChannel`（純粋関数）
- `convex/notification/actions.ts` / `convex/notification/reminderActions.ts` — 既存通知に LINE 振り分け統合
- `convex/notificationOutbox/` — LINE / メール通知の配送予約、重複排除、再試行 worker
- `convex/notification/templates.ts` — メールHTML、LINE text fallback、LINE Flex Message builder / 型

### フロントエンド（`src/`）

- `src/routes/_unregistered/line.callback.tsx` — OAuth コールバックページ
- `src/components/features/Line/LineLinkQrDialog/` — シフト担当者UI: QR / URL 表示
- `src/components/features/LineCallback/` — OAuth action、状態遷移、コールバック完了 / エラー UI
- `src/components/features/Dashboard/StaffRoster/StaffRow.tsx` — ユーザー詳細ページへの入口
- `src/components/features/UserDetail/` — 店舗Dialog内のLINE連携状態表示、連携リンク表示、個別連携依頼、個別通知再送
- `src/components/features/Dashboard/StaffManagement/` — ユーザー詳細ページへの遷移と、人物IDが未移行のスタッフに限った旧詳細モーダルの暫定接続
- `src/devtools/NotificationPreview/` — Storybook で目的別にメール文面・LINE Flex previewを VRT 管理
- `src/devtools/FlexMessagePreview/` — シフトリで生成するFlex JSON subsetのReact preview

## 画面一覧

| 画面 | 役割 |
|---|---|
| `/users/<personId>?shop=<shopId>&panel=shop` | 選択店舗のDialogで通知再送、通知履歴、LINE連携、店舗設定を縦に表示する |
| LineLinkQrDialog | QR 表示 + URL コピー |
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
| `internal.line.mutations.pruneExpiredWebhookMessageReceipts` | internalMutation | 期限切れmessage receiptを100件ずつ削除し、残件時は継続を予約 |
| `POST /line/webhook` | httpAction | LINE Messaging API Webhook 受信（署名検証） |

## Webhook受信制約

- `POST /line/webhook` はparameter付きの `application/json` を受け付け、raw bodyを1 MiB、`events`を100件までに制限する。
- `Content-Length`は早期拒否にだけ使い、request streamの実byte数も検査する。上限内のraw bodyを変更せずに署名検証し、検証後だけJSON parseとinternal mutationを行う。
- LINEの疎通確認で送られる`events: []`と未知のevent typeは`200`で受理する。eventがある場合は`webhookEventId`とprovider `timestamp`を必須とし、不正なContent-Type、body、署名、最小payload shapeは副作用なしで拒否する。
- follow/unfollowは`staffLineAccounts`へ最後に反映したevent IDとprovider timestampを保存する。同じeventの再送と、保存済みtimestamp以前のeventはno-opにし、古いfollow/unfollowで新しい状態を巻き戻さない。既存rowの順序fieldはoptional wideningとし、最初の署名済みevent受信時に設定するためbackfillしない。
- messageはglobal rate limitと外部Reply APIを呼ぶ前に`webhookEventId`を永続receiptと照合し、新規eventだけを同じtransactionでclaimする。別HTTP requestで同じ署名済みeventが再送されても、初回だけがmessage用global budgetを消費してreply tokenを外部actionへ渡す。message予算はfollow/unfollowへ適用せず、message集中時も状態eventを破棄しない。receiptにはreply token、source user ID、message ID、本文を保存せず、event IDと保持期限だけを保存する。
- message receiptは受信から30日後を期限とし、日次cronが100件ずつ削除する。101件目がある場合だけ同じbounded mutationを再予約するため、中断後はcronまたは予約済みjobから再開できる。provider timestampが受信時刻の30日前以前のmessageはreceipt削除後もno-opにし、古い署名bodyの再利用でReply APIを再実行させない。

## LINE連携token

- 同じスタッフへtokenを再発行する時は、manager issuerとinternal issuerのどちらからでも、72時間内の旧activeかつunused tokenを同じtransactionで失効させる。
- 利用できるtokenは最新の一件だけで、連携完了時に`usedAt`を記録する。失効済み・使用済みtokenの再利用はprovider通信前に拒否する。

## 通知振り分けロジック

`convex/_lib/notification.ts` の `selectChannel(staff, quota)`:

- Quota が `exceeded` → email
- スタッフが連携済み（`lineUserId`）かつ友達追加中（`lineFollowing`）→ line
- それ以外 → email

Quota が未取得の場合は、LINE送信を試みる。処理時に Quota 超過が判明した場合は、通知outboxの `fallbackEmail` を email ジョブとして enqueue する。LINE Push API の失敗は既存の retry / final_failed に任せる。

呼び出し点は既存の `sendShiftConfirmationEmails` / `sendRecruitmentNotificationEmails` / `sendReminderEmails` action のスタッフごとループ内。配送は同期送信ではなく `notificationOutbox` に `pending` ジョブとして予約し、worker が少量ずつ処理する。

## LINE Flex Messageと外部ブラウザ対応

outbox経由のLINE PushはFlex Messageを優先して送る。`payload.text` は必須のまま残し、既存pendingジョブ・altText・fallback用途に使う。Webhook通常返信はReply APIのtext messageのまま。

Flex Messageのタイトルは「店舗名」と「通知目的」を改行して表示し、本文内では店舗名を繰り返さない。Flex非対応時や通知一覧で使われるtext fallback / altTextには、単独でも文脈が分かるよう店舗名を残す。

Flex MessageのCTA URLにも `withOpenExternalBrowser()`（`convex/_lib/lineUrl.ts`）で `openExternalBrowser=1` を一律付与する。LINEアプリ内ブラウザではGoogle OAuthがブロックされる（403: disallowed_useragent）ため、リンクを端末の既定ブラウザで開かせる。メールHTML内のURLには付与しない。

StorybookのLINE previewは公式LINE rendererの完全再現ではなく、シフトリが生成する `bubble` / `box` / `text` / `separator` / `button` / `uri action` subsetをReactで描画し、Flex JSONとレイアウト意図の退行をVRTで検知する。LINE previewのStoryでは、Flex Message Simulatorへ貼り付けやすいように、そのStoryで使う `contents` のJSONをブラウザconsoleへ出力し、画面上のボタンからもコピーできる。

## レートリミット

`convex/_lib/rateLimits.ts`:

- `lineLinkRedeemGlobal`: 100回/分（固定anonymous/global bucket） — attacker-controlled stateを引く前の試行上限
- `lineLinkRedeem`: 5回/分（存在する有効stateの先頭8文字キー） — 有効tokenに対する二次防御
- `lineWebhook`: message reply request 100回/分（global） — message集中を抑止しつつfollow/unfollowは処理する
- `lineInviteShort`: 3回/分（shopId + staffId キー） — 同じスタッフへの個別連携依頼の短時間連打防止

OAuth callbackは未認証のpublic Convex actionで、信頼できるidentityや送信元IPを取得できない。このため最初のbucketは全callbackで共有し、上限到達時はwindowが回復するまで正当なcallbackも一時的に抑止される。送信元ごとの分離が必要になった場合は、trusted proxy/IP契約を定めたHTTP Actionへ入口を移し、固定global bucketは暴発時の二次防御として残す。

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
- ユーザー詳細ページの店舗Dialogにある通知セクションから、選択店舗の募集通知と現在の確定シフト通知を手動再送できる。通常は募集作成時とシフト確定時に自動通知されるため、送れなかった場合だけ使う補助導線として扱う。操作後のUIでは「送りました」と案内する

## 複数店舗での連携

LINE連携は `staffLineAccounts`（`staffId` 単位、各 `staffs` は1店舗に属する）で管理する。同じ人が複数店舗に所属する場合は店舗ごとに別 `staffs` レコードがあるため、**同一 `lineUserId` を店舗ごとに同時連携できる**。

- `finalizeLinking`: 同一 `lineUserId` の重複排除は**同一店舗内のみ**（同じ店舗で別スタッフに紐づいていた場合だけ旧アカウントを論理削除）。別店舗のアカウントは残す。
- `dispatchWebhookEvents`（follow/unfollow）: 同一 `lineUserId` に紐づく**全店舗のアカウント**へ following 状態を反映し、初回follow時は店舗（staff）ごとに同意依頼・募集通知をスケジュールする。
- 連携状況の引き当ては `getStaffLineAccount`（`staffId` 単位）で店舗ごとに独立して行う。

## 設計ドキュメント

`doc/plans/2026-05-06_LINE通知連携設計.md`
