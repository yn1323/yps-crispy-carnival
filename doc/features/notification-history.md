# スタッフ通知履歴

スタッフの店舗別設定ページで、対象店舗のスタッフへ送ったメールとLINEの日時、タイトル、送信状況と配信状況を確認する機能。
履歴は実装後に新しく作成した実配送通知だけを対象とし、通知本文や宛先は保存・表示しない。

## 関連ファイル

### バックエンド（`convex/`）

- `convex/schema.ts` — `notificationHistory`テーブルと検索index
- `convex/notificationOutbox/schemas.ts` — 履歴metadataと配送状態のvalidator
- `convex/notificationOutbox/enqueue.ts` — 通知と履歴metadataのenqueue
- `convex/notificationOutbox/mutations.ts` — Outboxの状態遷移と履歴の同期、履歴cleanup
- `convex/notificationOutbox/queries.ts` — スタッフ単位の履歴ページングquery
- `convex/notificationOutbox/historyKinds.ts` — 再送クールダウン対象の通知kind
- `convex/notificationOutbox/resendCooldown.ts` — 履歴から再送可能期限を導出する有限走査と安全側判定
- `convex/notificationOutbox/resendWebhook.ts` — Resendの配信完了・遅延・失敗event受信
- `convex/notification/actions.ts` — 募集、確定、再送通知の履歴metadata設定
- `convex/notification/reminderActions.ts` — 提出催促通知の履歴metadata設定
- `convex/line/actions.ts` — LINE連携案内通知の履歴metadata設定
- `convex/legal/actions.ts` — 法務同意通知の履歴metadata設定
- `convex/staff/mutations.ts` — スタッフ削除時の履歴cleanup予約
- `convex/staff/queries.ts` — 再送可能期限のmanager query
- `convex/organization/mutations.ts` — 組織の人物・店舗所属削除時の履歴cleanup予約
- `convex/deletionCleanup/mutations.ts` — 店舗・組織削除時の履歴cleanup

### フロントエンド（`src/`）

- `src/components/features/StaffNotificationHistory/` — 履歴取得、ページング、PCテーブル、モバイルカード、表示状態
- `src/components/features/UserShopDetail/` — パスの`targetShopId`と対応するスタッフIDを店舗別設定ページの通知セクションと履歴へ接続

## 画面一覧

| 画面 | 表示内容 |
|---|---|
| `/staff/<personId>/shops/<shopId>?org=<organizationId>` | 店舗別設定ページの通知セクションで、`shopId`のスタッフへの通知履歴を最新順に表示する。初回3件を取得し、「もっと見る」で10件ずつ続きを取得する |

## API一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.notificationOutbox.queries.listStaffNotificationHistory` | managerQuery | `targetShopId`で指定した店舗に所属する有効なスタッフの履歴を、本文と宛先を除いた最小DTOでページング取得する |
| `api.staff.queries.getNotificationResendCooldowns` | managerQuery | 店舗単位の募集・確定通知と、組織人物単位のLINE案内の再送可能期限だけを返す |
| `internal.notificationOutbox.mutations.enqueue` | internalMutation | 実配送するスタッフ通知のOutboxと履歴metadataを同じtransactionで作成する |
| `internal.notificationOutbox.mutations.recordResendProviderDeliveryUpdate` | internalMutation | Resendの配信完了eventを履歴へ反映する |
| `internal.notificationOutbox.mutations.deleteStaffNotificationHistoryBatch` | internalMutation | スタッフ単位の履歴を100件ずつ削除する |

## 表示する情報

- 通知を依頼した日時
- 実際に使用したチャネル（メールまたはLINE）
- 通知目的を表す短いタイトル
- 送信・配信状況

再送クールダウンの操作付近には、これらの日時、チャネル、自動／手動を転記しない。  期限中だけ「送信済みです。」と「送信から10分後に再送できるようになります。」を表示し、履歴一覧の詳細表示と区別する。

LINEのシフト募集、確定シフト、シフト変更のタイトルは、通知名の後ろに対象期間を表示する。

例: `シフト募集のお知らせ 8/26(水)〜8/28(金)`

次の情報は`notificationHistory`へ保存せず、管理画面にも返さない。

- メールアドレス、LINE user ID
- メールHTML、LINE本文、Flex Message JSON
- magic link、法務同意URL、招待URL
- providerのraw error、Webhook body、署名

店舗別設定ページはpathの`shopId`とURLで検証済みの`organizationId`をqueryへ明示して渡し、browser storageの店舗IDを履歴の取得対象に使わない。
ブラウザから渡される`personId`、`shopId`、`organizationId`、`staffId`は認可情報として扱わない。
manager queryは認証identityから対象店舗への管理アクセスを解決し、スタッフと店舗の所属関係、店舗と親組織の削除状態をサーバー側で検証する。
権限のない店舗、不正な組み合わせ、削除済み対象では履歴を返さず、拒否時にOutboxや履歴を更新しない。

## 状況表示の意味

| 表示 | 意味 |
|---|---|
| 送信待ち | Outboxへ登録済みで、外部サービスへの送信完了前 |
| 送信済み | 外部サービスが送信要求を受け付けた状態 |
| 配信済み | メールのみ。Resendが受信側メールサーバーへの到達を通知した状態 |
| 配信が遅れています | メールのみ。Resendが配送の遅延を通知した状態 |
| 送れませんでした | 送信処理またはprovider配送が失敗した状態 |
| キャンセル | スタッフ・店舗の削除などにより配送を中止した状態 |

「配信済み」は受信者の開封を意味しない。
LINEは個別通知の端末到達を確認できないため、外部APIが受け付けた後も「送信済み」と表示する。

再送クールダウンは「送信待ち」「送信済み」「配信済み」「配信が遅れています」を対象にし、「送れませんでした」と「キャンセル」を対象外にする。  後者にはprovider配送の`failed`、`bounced`、`suppressed`も含む。判定は`requestedAt`を基準に10分間とし、10分ちょうどで解除する。

## 対象範囲と互換性

- 対象はリリース後に新しくenqueueしたスタッフ向け実通知だけとする。
- 過去のOutboxはbackfillしない。
- 対象期間を含むLINEタイトルは変更後にenqueueした履歴だけに適用し、既存履歴は更新しない。
- dry-run、disabled、mockなど配送を抑止した通知は履歴を作成しない。
- リリース前からpendingだったOutboxは、履歴がなくても従来どおり配送を継続する。
- LINEからメールへfallbackした場合は、LINEとメールを別の履歴として表示する。
- 再送クールダウンは既存の`notificationHistory`とindexを使うため、schema変更とbackfillを必要としない。

## 保持と削除

履歴metadataはスタッフまたは店舗が削除されるまで保持する。
スタッフの論理削除直後からmanager queryの対象外とし、履歴本体は100件単位の再実行可能なcleanupで物理削除する。
店舗・組織削除では、既存の削除workflowに履歴cleanupと残存確認を含める。

## 関連ドキュメント

- `doc/features/notification-outbox.md`
- `doc/features/notification-failure-dashboard.md`
- `doc/features/line-notification.md`
- `doc/plans/2026-07-19_スタッフ通知履歴_実装計画.md`
