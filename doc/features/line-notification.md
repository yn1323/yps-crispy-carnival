# LINE通知連携

> 文書種別: feature
>
> 最終コード照合: 2026-07-23
>
> 基準commit: `b61100a680e80d154a74f576d03c53712846e062`

スタッフがLINEアカウントを店舗のスタッフ情報へ連携し、シフトリから募集、確定、催促などの通知を受け取る機能である。
通知チャネルを手動で選ぶ設定は持たず、送信時点の連携状態とLINE quotaからLINEまたはメールを選ぶ。

## 機能の範囲

シフト担当者は、ユーザー詳細から連携用URLを表示し、スタッフへ連携依頼を送れる。
スタッフはLINE Loginを完了すると、その店舗のスタッフ情報へLINEアカウントを紐づけられる。

連携済みで友だち追加中ならLINEを優先し、それ以外はメールを使う。
quotaの状態を取得できない場合はLINE送信を試みる。
Outbox workerが送信直前に保存済みquotaの超過を確認し、通知payloadにfallback用メールがある場合だけ、メールを別jobとして追加する。
LINE APIの429はquota fallbackとは別に再試行し、通常のLINE通知では最終失敗だけを理由にメールへ切り替えない。

外部送信はNotification Outboxが非同期で行う。
この文書の「送る」は受付と送信処理の開始を表し、providerへの到着を保証しない。

## 画面と利用者の操作

| 画面 | 利用者ができること |
|---|---|
| `/users/<personId>?shop=<shopId>&panel=shop` | 選択店舗の通知履歴、LINE連携状態、連携URL、個別の通知再送を確認する |
| LINE連携URLのDialog | QRを表示し、URLをコピーする |
| `/line/callback` | LINE Loginの成功、期限切れ、試行上限、エラーを確認する |
| LINE公式アカウントのトーク画面 | 受信メッセージに対する定型応答を受け取る |

個別再送は、通常の募集作成時またはシフト確定時に通知できなかった場合の補助導線である。
操作後の画面は「送りました」と案内し、配送済みとは表現しない。

## 連携token

連携URLは72時間有効で、同じスタッフに再発行すると、発行主体にかかわらず以前の未使用tokenを失効させる。
利用できるtokenは最新の一件だけであり、連携完了時に使用済みとして記録する。

無効、期限切れ、使用済み、失効済みtokenは、LINE providerと通信する前に拒否する。
Webhook、rate limit、環境変数、障害確認は[LINE通知の設定と運用](../manual/line-notification.md)を参照する。

## 通知の表示

LINE PushはFlex Messageを優先し、text fallbackとalt textにも単独で意味が分かる店舗名を残す。
CTAには`openExternalBrowser=1`を付け、LINEアプリ内ではなく端末の既定browserで開く。
メールのURLにはこのparameterを付けない。

## 初回設定とスタッフ追加

最初の店舗設定では、シフト担当者へLINE連携依頼メールを予約する。
スタッフ追加時は、法務同意依頼とは別にLINE連携依頼を送り、受付中の募集があれば希望提出linkも送る。

スタッフのメールアドレスを変更した場合は、LINEを受信できないスタッフに限り、変更後の宛先へ受付中の募集を再送する。
LINE連携完了またはfollow受信でLINEを受信できる状態になった場合は、対象の受付中募集をLINEへ送る。

対象募集は、未削除の`open`状態で、シフト開始前かつ締切日以前の募集である。
複数の対象募集がある場合は、募集ごとに一通を作る。

## 複数店舗での連携

LINE連携は`staffId`単位で管理する。
同じ人物が複数店舗に所属する場合は店舗ごとにスタッフ情報があるため、同じ`lineUserId`を複数店舗で連携できる。

同じ店舗で別スタッフに紐づいていたLINEアカウントだけを、連携完了時に切り替える。
followとunfollowは、同じ`lineUserId`へ紐づく全店舗の連携状態へ反映する。

## Public APIとHTTP入口

| API | 用途 |
|---|---|
| `api.line.mutations.generateLinkToken` | 連携用URLを発行する |
| `api.line.mutations.sendInvite` | 個別スタッフへ連携依頼メールを予約する |
| `api.line.queries.getLinkStatusByShop` | 店舗のスタッフごとの連携状態を返す |
| `api.line.queries.getQuotaStatus` | 保存済みのLINE Push quota状態を返す |
| `api.line.actions.redeemLineToken` | OAuthのstateとcodeを検証し、連携を完了する |
| `POST /line/webhook` | LINE Messaging APIの署名済みWebhookを受け付ける |

スタッフへの募集通知と確定通知の個別再送は、`api.staff.mutations.sendOpenRecruitmentNotifications`と`api.staff.mutations.sendCurrentShiftNotification`が受け付ける。
外部送信、fallback、retry、redactionは[Notification Outbox](notification-outbox.md)を正本とする。

## コードの入口

| 責務 | 主な入口 |
|---|---|
| LINE LoginとWebhook | `convex/line/`, `convex/http.ts` |
| LINE API clientと署名 | `convex/_lib/lineClient.ts`, `convex/_lib/lineSignature.ts` |
| 通知チャネル選択 | `convex/_lib/notification.ts` |
| 通知文面 | `convex/notification/templates.ts` |
| 外部送信 | `convex/notificationOutbox/` |
| OAuth callback | `src/routes/_unregistered/line.callback.tsx`, `src/components/features/LineCallback/` |
| 管理者向け連携UI | `src/components/features/UserDetail/`, `src/components/features/Line/LineLinkQrDialog/` |

## 関連文書

- [LINE通知の設定と運用](../manual/line-notification.md)
- [Notification Outbox](notification-outbox.md)
- [通知履歴](notification-history.md)
- [シフト確定リマインダー](shift-confirmation-reminder.md)
- [セキュリティ方針](../rules/security-strategy.md)
