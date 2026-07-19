# 所属なしユーザーのアカウント削除

店舗・グループに所属していない管理ユーザーが、Clerkのstrict再認証を経てアカウント削除を依頼できる機能です。
受付transactionでローカル利用を先に停止し、durable jobがClerkユーザー削除とprovider識別子のredactionを再試行可能な形で完了させます。
既存のローカルuserにある氏名、メールアドレス、正規化メールは過去の業務履歴を識別するため保持し、この導線では個人データの物理削除や匿名化を行いません。

## 画面

- 店舗登録画面: 過去に利用履歴があり、現在は所属がないユーザー向けの削除入口。初回セットアップでは表示しない
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
- `convex/accountDeletion/mutations.ts`
- `convex/dashboard/queries.ts`
- `convex/http.ts`
- `convex/crons.ts`
- `convex/schema.ts`
- `doc/features/data-deletion.md`

## 安全契約

- 公開入力はrequest IDだけとし、Clerk user IDやローカルuser IDを受け取らない。
- Clerkの代理操作sessionは本人同意として扱わず、`actor`と`act` claimをfail closedで拒否する。
- 受付時と外部削除直前に所属を再検査し、判定不能を含めてfail closedにする。
- 同一ユーザーの既存jobは設定検証やrate limitより先に再利用し、Clerk再認証の自動再送を冪等に扱う。
- 既存の`users`行は`name`、`email`、`emailNormalized`、`authTokenIdentifier`を上書きせず、`isDeleted`と`accountDeletionRequestedAt`で利用を停止する。
- `users`行がない認証主体には、Clerk claimの氏名やメールアドレスを複製せず、schema必須値を満たす非PIIの合成行を作る。
- `authTokenIdentifier`は古いJWTを削除済み状態へ解決して拒否するために保持し、公開responseやログへ出さず、新しいClerkアカウントとの再関連付けに使用しない。
- provider対象を一度確認し、削除試行を記録した後の404だけを完了扱いにする。
- 完了時にprovider識別子をredactし、完了jobは90日後にbounded batchで削除する。
- Clerk user IDは処理中jobだけへ一時保存し、完了transactionでredactする。Clerk user ID、secret、session token、provider response本文はログや公開responseへ出さず、secret、session token、provider response本文はDBにも保存しない。
- 削除済みuserへの`getCurrentUser`は`accountDeleted`と`accountDeletionRequested`のbooleanだけを返し、保持した氏名やメールアドレスを通常画面へ返さない。
- 再登録したClerkユーザーを、保持している履歴や削除済みuserへ自動で関連付けない。
- 本人からの個人データ消去要求は、本人確認、法務判断、対象データの抽出を伴う別の運用または将来機能として扱う。
- frontendのbuild-time flagは使わず、既存の所属なしユーザーとlegacy削除済みユーザーには削除入口を表示する。初回セットアップでは表示しない。
- 必須のClerk設定が揃い、`CLERK_SECRET_KEY`で取得したClerk domainと`CLERK_JWT_ISSUER_DOMAIN`の一致を確認できる場合は常に受付可能とする。

## テストと公開前確認

Clerkユーザーを実際に削除するE2Eは追加しません。
HTTP Function Test、Clerk adapterのfakeを使うConvex Function / Scenario Test、Frontend Logic / Behavior Testで自動検証し、各deploymentではユーザー取得・削除を行わないread-only readinessを実行します。
保持対象も論理削除fieldも現行schemaに存在するため、この変更に伴うschema migrationはありません。
すでに削除済みの値へマスキングされた氏名やメールアドレスは、この変更で推測またはバックアップから自動復元しません。

公開前に、対象deploymentで既存の`VITE_CLERK_PUBLISHABLE_KEY`を含む環境変数を同期し、Clerk domainとissuerの一致、再認証factor、既存migrationの完了、legacy tombstoneの件数を確認します。
業務識別情報の保持目的と保持期間はプロダクト責任者が確定し、プライバシーポリシーへ反映してから公開します。
