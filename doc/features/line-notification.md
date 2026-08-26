# LINE通知連携

> 文書種別: feature
>
> 最終コード照合: 2026-08-13
>
> 基準: LINE連携共通化の実装worktree

スタッフがLINEアカウントを組織内の人物へ連携し、シフトリから募集、確定、催促などの通知を受け取る機能である。
通知チャネルを手動で選ぶ設定は持たず、送信時点の連携状態とLINE quotaからLINEまたはメールを選ぶ。

## 機能の範囲

シフト担当者は、スタッフ詳細の「LINE連携」から連携用URLを表示し、スタッフへ連携依頼を送れる。
スタッフはLINE Loginを完了すると、その組織の人物へLINEアカウントを紐づけられる。
同じ組織の現在および今後の所属店舗では、この連携を共通利用する。
別の組織では、同じLINE利用者であっても、その組織用の連携操作が必要である。

連携済みで友だち追加中ならLINEを優先し、それ以外はメールを使う。
quotaの状態を取得できない場合はLINE送信を試みる。
Outbox workerが送信直前に保存済みquotaの超過を確認し、通知payloadにfallback用メールがある場合だけ、メールを別jobとして追加する。
LINE APIの429はquota fallbackとは別に再試行し、通常のLINE通知では最終失敗だけを理由にメールへ切り替えない。

外部送信はNotification Outboxが非同期で行う。
この文書の「送る」は受付と送信処理の開始を表し、providerへの到着を保証しない。

## 画面と利用者の操作

| 画面 | 利用者ができること |
|---|---|
| `/staff/<personId>?org=<organizationId>` | 組織共通のLINE連携状態を確認し、連携URLの表示、依頼メールの送信、明示解除を行う |
| `/staff/<personId>/shops/<shopId>?org=<organizationId>` | pathの`shopId`で指定した店舗の送信可否、通知履歴、個別の通知再送を確認する。LINE連携の変更はスタッフ詳細で行う |
| `/line/callback` | LINE Loginの成功、期限切れ、試行上限、エラーを確認する |
| LINE公式アカウントのトーク画面 | 受信メッセージに対する定型応答を受け取る |

個別再送は、通常の募集作成時またはシフト確定時に通知できなかった場合の補助導線である。
操作後の画面は「送りました」と案内し、配送済みとは表現しない。
店舗別設定ではpathの`shopId`とURLで検証済みの`organizationId`を各queryとmutationへ明示して渡し、browser storageの店舗IDを送信対象に使わない。

LINE連携案内メールは、同じ組織人物への送信受付から10分間だけoutlineの再送ボタンを無効にする。  期限中は「送信済みです。」と「送信から10分後に再送できるようになります。」だけを表示し、正確な時刻や送信履歴の詳細は表示しない。QRコードとURLの表示はメール送信ではないため、このクールダウン対象外とする。

## 連携token

連携URLは72時間有効で、同じ組織人物に再発行すると、発行元店舗にかかわらず以前の未使用tokenを失効させる。
利用できるtokenは同じ組織人物の最新一件だけであり、発行時の組織、人物、連携世代を再検証してから使用済みとして記録する。

無効、期限切れ、使用済み、失効済みtokenは、LINE providerと通信する前に拒否する。
Webhook、rate limit、環境変数、障害確認は[LINE通知の設定と運用](../manual/line-notification.md)を参照する。

## 通知の表示

LINE PushはFlex Messageを優先し、text fallbackとalt textにも単独で意味が分かる店舗名を残す。
CTAには`openExternalBrowser=1`を付け、LINEアプリ内ではなく端末の既定browserで開く。
メールのURLにはこのparameterを付けない。

## 初回設定とスタッフ追加

最初の店舗設定では、シフト担当者へLINE連携依頼メールを予約する。
スタッフ追加時は、組織人物がLINE未連携の場合だけ、法務同意依頼とは別にLINE連携依頼を送る。
同じ組織で連携済みの人物を別店舗へ追加した場合は、共通の連携を引き継ぎ、LINE連携依頼を重ねて送らない。
受付中の募集があれば、追加先店舗の希望シフト提出linkを送る。

スタッフのメールアドレスを変更した場合は、LINEを受信できないスタッフに限り、変更後の宛先へ受付中の募集を再送する。
LINE連携完了またはfollow受信でLINEを受信できる状態になった場合は、対象の受付中募集をLINEへ送る。

対象募集は、未削除の`open`状態で、シフト開始前かつ提出期限以前の募集である。
複数の対象募集がある場合は、募集ごとに一通を作る。

## 組織、店舗、友だち状態の関係

組織との明示連携は`organizationPersonId`単位で管理し、同じ人物の全店舗所属から一つの連携を参照する。
LINE公式アカウント上の友だち状態はLINE利用者単位で管理する。
同じLINE利用者が複数の組織で明示連携した場合も、組織間で連携を自動作成しない。

同じ組織の別人物が利用中のLINEアカウントは、自動で付け替えず連携を拒否する。
友だちをブロックしても組織との連携は残るが、明示連携済みのすべての組織と店舗でLINE通知を送れなくなり、メール通知へ切り替わる。
再び友だち追加すると、署名済みWebhookの状態を、明示連携済みの人物と全所属店舗へ再開可能な処理で反映する。

一つの店舗所属を外しても、組織人物のLINE連携は解除しない。
スタッフ詳細から明示解除すると、その組織のすべての所属店舗でLINE通知を停止し、再利用には新しい連携操作を必要とする。
別組織の明示連携には影響しない。

通常の業務更新を停止している間も、activeな管理者は通知停止の安全操作として明示解除できる。

## Public APIとHTTP入口

| API | 用途 |
|---|---|
| `api.line.mutations.generateLinkToken` | 連携用URLを発行する |
| `api.line.mutations.sendInvite` | 個別スタッフへ連携依頼メールを予約する |
| `api.staff.queries.getNotificationResendCooldowns` | 募集、確定、LINE連携案内の再送可能期限を最小DTOで返す |
| `api.line.mutations.disconnectOrganizationPersonLine` | 対象組織人物の共通LINE連携を明示解除する |
| `api.line.queries.getLinkStatusByShop` | 店舗のスタッフごとの連携状態を返す |
| `api.line.queries.getQuotaStatus` | 保存済みのLINE Push quota状態を返す |
| `api.line.actions.redeemLineToken` | OAuthのstateとcodeを検証し、連携を完了する |
| `POST /line/webhook` | LINE Messaging APIの署名済みWebhookを受け付ける |

スタッフへの募集通知と確定通知の個別再送は、`api.staff.mutations.sendOpenRecruitmentNotifications`と`api.staff.mutations.sendCurrentShiftNotification`が受け付ける。
外部送信、fallback、retry、redactionは[Notification Outbox](notification-outbox.md)を正本とする。

## 認可と機密情報

ブラウザから渡される`personId`、`shopId`、`organizationId`、`staffId`や、所属店舗一覧からの遷移は認可根拠にしない。
Convexは認証identityから管理アクセスを解決し、対象店舗への権限、スタッフと店舗・人物の対応、削除状態、店舗状態を各操作で再検証する。
権限のない店舗、不正な組み合わせ、削除済み対象は拒否するか、存在を区別できない最小情報の状態へ寄せる。
連携URL発行は既存tokenの失効を維持し、メール送信は既存のrate limitとOutboxの再検証を維持する。
送信受付から10分未満の`sendInvite`は`recentlySent`を返し、rate limit、Scheduler、Outboxを増やさない。
メールアドレス、LINE token、連携URL、通知本文を新しいログへ出力しない。

## コードの入口

| 責務 | 主な入口 |
|---|---|
| LINE LoginとWebhook | `convex/line/`, `convex/http.ts` |
| LINE API clientと署名 | `convex/_lib/lineClient.ts`, `convex/_lib/lineSignature.ts` |
| 通知チャネル選択 | `convex/_lib/notification.ts` |
| 通知文面 | `convex/notification/templates.ts` |
| 外部送信 | `convex/notificationOutbox/` |
| OAuth callback | `src/routes/_unregistered/line.callback.tsx`, `src/components/features/LineCallback/` |
| 管理者向け連携UI | `src/components/features/UserDetail/`, `src/components/features/UserShopDetail/`, `src/components/features/Line/LineLinkQrDialog/` |

## 関連文書

- [LINE通知の設定と運用](../manual/line-notification.md)
- [Notification Outbox](notification-outbox.md)
- [通知履歴](notification-history.md)
- [シフト確定リマインダー](shift-confirmation-reminder.md)
- [セキュリティ方針](../rules/security-strategy.md)
