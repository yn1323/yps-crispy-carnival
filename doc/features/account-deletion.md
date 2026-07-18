# 所属なしユーザーのアカウント削除

店舗・グループに所属していない管理ユーザーが、Clerkのstrict再認証を経てアカウント削除を依頼できる機能です。
受付transactionでローカル利用を先に停止し、durable jobがClerkユーザー削除を再試行可能な形で完了させます。

## 画面

- 店舗登録画面: 店舗登録を続けないユーザー向けの削除入口
- 削除確認ダイアログ: 不可逆性、削除対象、再登録時の扱いを確認
- 削除受付完了画面: 公開routeで受付済み状態を案内
- legacy削除済み画面: 明示要求の記録がない既存tombstone向けの補助導線

## API

- `POST /account-deletion/request`: Bearer session token、Origin、issuer、strict再認証、所属なしを検証して削除を受付
- `OPTIONS /account-deletion/request`: 許可済みOrigin向けCORS preflight
- `accountDeletion.mutations.*`: 受付、lease取得、provider実行前検証、再試行・回収、完了redaction、保持期限後の削除、運用retry
- `accountDeletion.actions.*`: Clerk provider worker、read-only readiness
- `accountDeletion.queries.*`: 個人情報を含まないboundedな運用probe

## 関連ファイル

- `src/components/features/AccountDeletion/`
- `src/components/features/Dashboard/Setup/SetupView.tsx`
- `src/components/features/AuthenticatedApp/AuthGuard.tsx`
- `src/components/features/AuthenticatedApp/DeletedAccountState.tsx`
- `src/pages/account-deletion-accepted/`
- `src/routes/account-deletion-accepted.tsx`
- `convex/accountDeletion/`
- `convex/http.ts`
- `convex/crons.ts`
- `convex/schema.ts`

## 安全契約

- 公開入力はrequest IDだけとし、Clerk user IDやローカルuser IDを受け取らない。
- Clerkの代理操作sessionは本人同意として扱わず、`actor`と`act` claimをfail closedで拒否する。
- 受付時と外部削除直前に所属を再検査し、判定不能を含めてfail closedにする。
- 同一ユーザーの既存jobはkill switchやrate limitより先に再利用し、Clerk再認証の自動再送を冪等に扱う。
- provider対象を一度確認し、削除試行を記録した後の404だけを完了扱いにする。
- 完了時にprovider識別子をredactし、完了jobは90日後にbounded batchで削除する。
- Clerk user IDは処理中jobだけへ一時保存し、完了transactionでredactする。Clerk user ID、secret、session token、provider response本文はログや公開responseへ出さず、secret、session token、provider response本文はDBにも保存しない。
- `ACCOUNT_DELETION_ENABLED`を先に、`VITE_ACCOUNT_DELETION_ENABLED`を最後に有効化する。

## テストと公開前確認

Clerkユーザーを実際に削除するE2Eは追加しません。
HTTP Function Test、Clerk adapterのfakeを使うConvex Function / Scenario Test、Frontend Logic / Behavior Testで自動検証し、各deploymentではユーザー取得・削除を行わないread-only readinessを実行します。

公開前に、対象deploymentで環境変数とClerk instanceの一致、再認証factor、既存migrationの完了、legacy tombstoneの件数を確認します。
