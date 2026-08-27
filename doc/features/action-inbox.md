# 要対応

`/actions`は、組織内で管理ユーザーの判断や操作が必要な現在状態を、一つの一覧へ投影する。  通知履歴や招待履歴を集める画面ではなく、未解決のsource documentだけを表示する。

Dashboardの「要対応」も同じスタッフ申請・通知失敗カードを使う。  Dashboardでは現在店舗のqueryを維持し、スタッフ申請と通知失敗を独立して開閉できる。両方を同時に開くこともできる。

## 画面とscope

| 画面状態 | 表示対象 |
|---|---|
| `?org=<organizationId>` | active組織に属する全active店舗の項目と、組織単位の管理者招待項目 |
| `?org=<organizationId>&shopFilter=<shopId>` | serverで同一組織・active店舗と確認できた店舗の項目だけ。組織単位の管理者招待は含めない |
| `limitRecoveryOnly`による業務write制限中 | 項目は閲覧できるが、server DTOの`can*`に応じて操作を無効にする |

`org`、`shopFilter`、項目ID、画面に表示した`can*`は信頼しない。  public queryと各mutationは、Clerk identityからcanonicalな組織所属を解決し、組織、店舗、対象documentの対応を再検証する。

## 表示する項目

| 種類 | source | 表示条件 | 主な操作 |
|---|---|---|---|
| シフト | `recruitments` | 募集期間内で、提出期限を過ぎても`open`の募集 | 既存のシフト表を開く |
| スタッフ | `staffRegistrationRequests` | `pending`のスタッフ登録申請 | 承認、確認後の却下 |
| 通知 | `notificationFailureInbox` | `open`かつ管理画面から再送・解決できる通知失敗 | 再送、確認後の対応済み |
| 管理 | `organizationInvitations` | `sendFailed`、`limitReached`、`conflict`の管理者招待 | 再送、確認後の取消 |

通常の送信済み通知、承認済み・却下済み申請、解決済み通知、単なる招待中は表示しない。  source tableを正本とし、Action Inbox専用tableへ複製保存しない。

管理者招待の`sendFailed`には、Outboxの最終失敗とenqueue失敗に加え、Resendの`email.failed`、`email.bounced`、`email.suppressed`を含める。
`email.delivery_delayed`は配送状態へ即時反映するが、最初の遅延から30分間は招待中のままにし、1分間隔の期限切れ回収後に`sendFailed`として要対応へ出す。
同じOutboxの遅延を再受信しても期限は延長しない。

猶予中により新しい`email.delivered`を受信した場合は期限を削除し、要対応へ出さない。
`email.failed`、`email.bounced`、`email.suppressed`を受信した場合は猶予を打ち切って即時に`sendFailed`へ移る。
専用期限がない導入前の`email.delivery_delayed`状態は、既存データ互換のため`sendFailed`として読む。

## 読み取りと追加取得

- `api.appOrganization.actionInboxQueries.getActionInbox`が4種類を最小DTOへ投影する。
- 種類ごとにcursorを持ち、初期pageより古い項目は「さらに表示」から取得する。
- 店舗filterはsource別上限やpaginationより前にserverで適用する。
- cursorには組織、店舗filter、種類を結び付け、別scopeへの使い回しを拒否する。
- 提出期限の判定はserver時刻を正本にする。  queryが返す`nextRefreshAt`でclientが再購読し、画面を開いたまま提出期限が到来した場合も再評価する。
- query失敗時は項目を空として扱わず、再読み込みできるエラー状態を表示する。
- メインナビゲーションはsource別の初期page件数を組織全体の正確な未解決件数として表示しない。exact totalを返す専用集計契約がない間は件数badgeを表示せず、固定値や下限値を実件数に見せない。

## 操作と完了表示

- 再送は配送完了ではなく、既存Outboxまたは招待送信処理が受付済みになった時点を成功とする。
- 成功したカードは右へ退場し、後続カードを繰り上げる。  sourceが再び未解決状態になれば、同じIDでも再表示できる。
- Dashboardでは最後のカードの退場animationが終わるまで種類ごとの要対応行を残し、終了後に行を外す。
- 却下、対応済み、招待取消は既存`Dialog`の確認を経て実行する。
- 操作失敗時はカードまたは確認Dialogを保持し、再試行できるエラーを表示する。
- UIのsingle-flightに加え、mutation側でstatus、rate limit、request ID、Outbox dedupeなど既存の重複防止契約を維持する。
- Dashboardで店舗scopeが変わった場合は、開閉状態、退場中のsnapshot、確認対象、人数上限案内を新しい店舗へ持ち越さない。

## 関連ファイル

### フロントエンド

- `src/pages/app-actions/` — route container、店舗filter、clock invalidation、追加取得、4種類のmutation dispatch、状態別StoryとUnit Test
- `src/components/features/ActionInbox/` — Dashboardと専用画面で共有するitem builder、確認Dialog、カードのpending・failure・退場animation、Storybook Behavior/VRT
- `src/components/features/Dashboard/StaffRegistrationRequestManagement/` / `NotificationFailureRecovery/` — 現在店舗のquery、Mutation、一括操作、人数上限案内を共有カードへ接続する
- `src/routes/_auth/actions.tsx` — route searchとcanonical組織scopeの接続

### バックエンド

- `convex/appOrganization/actionInboxQueries.ts` — canonical組織scopeの集約query
- `convex/staffRegistration/mutations.ts` — 申請の承認・却下
- `convex/notificationOutbox/mutations.ts` — 通知失敗の再送・解決
- `convex/organizationInvitation/mutations.ts` — 組織scopeの管理者招待再送・取消

## テスト境界

| 層 | 主に守る契約 |
|---|---|
| Frontend Unit | DTOの4種類へのdispatch、共通builder、明示org・shop・target ID、Dashboardの一括再送・人数上限・確認操作、filter正規化、clock invalidation、cursor破棄、single-flight |
| Storybook Behavior/VRT | Ready、Loading、Empty、QueryError、`limitRecoveryOnly`、独立した複数開閉、操作失敗、確認Dialog、SPのカード配置と退場animation |
| Convex Function | canonical所属、別org/shop拒否、filter、write capability、種類別continuation、提出期限境界、最小DTO |
| Convex Scenario | 4種類のexact set、既存mutation成功後の消失、二重操作時の副作用集合 |

実環境での公開状態は[リリース状態](../manual/release-status.md)の証跡を参照する。
