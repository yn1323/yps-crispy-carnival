# アカウント削除

管理ユーザーが、Clerkのstrict再認証を経てアカウント削除を依頼できる機能です。
サーバーは本人の有効な組織所属を確認し、所属がなければアカウントだけを削除し、有効な組織が一つなら管理者構成に応じて本人の所属または組織全体の利用を終了します。

受付transactionでローカル利用を先に停止し、durable jobが必要なcleanupを待ってからClerkユーザー削除とprovider識別子のredactionを完了させます。
既存のローカルuserにある氏名、メールアドレス、正規化メールは過去の業務履歴を識別するため保持し、この導線では個人データの物理削除や匿名化を行いません。

## 削除範囲の決定

| 本人の有効な組織所属 | 管理者構成 | 受付する処理 |
| --- | --- | --- |
| なし | 非該当 | ローカルアカウントの利用を停止し、Clerkユーザー削除を開始 |
| 一つ | 本人以外に有効な`active`管理者がいる | 現役管理者、または同じpersonを指す`removed`管理者所属が一件だけ残る元管理者について、本人のmanager、person、staff、session、token、LINE連携、未送信通知を終了し、今日以降のシフト割り当てを削除。本人staffの通知履歴を物理削除してからClerkユーザー削除へ進み、組織、店舗、別管理者、過去のシフト履歴は維持 |
| 一つ | 本人が唯一の有効な`active`管理者 | 組織を論理削除して全店舗のcleanupを開始。cleanup完了後にだけClerkユーザー削除へ進行 |
| 二つ以上または所属不整合 | 非該当 | 受付せず、所属を一つ以下へ整理するか問い合わせるよう案内 |

`readOnly`管理者は、共有組織を引き継げる有効な管理者として扱いません。
請求先メールアドレスは通知先の文字列であり、管理者ロール、削除可否、引き継ぎ先の判定には使用しません。  旧`restricted`にだけ存在する最後の`readOnly`所属は内部で安全側に拒否しますが、現行ロールとして案内せず、一般的な組織削除不可理由を返します。

## 画面

- アカウント設定画面: 現在の所属から削除範囲を取得し、実行可能な場合に削除入口を表示
- 店舗登録画面: 過去に利用履歴があり、現在は有効な管理者所属がないユーザー向けの補助入口。アカウント設定と同じ削除previewを取得し、元管理者に関連付けが残る場合も削除範囲とfingerprintを表示する。初回セットアップでは表示しない
- 削除確認ダイアログ: アカウントだけ、共有組織からの退出、組織と全店舗の終了を区別して、不可逆性、削除対象、保持対象を確認
- 削除受付完了画面: 公開routeで**受付済み**を案内。cleanupやClerk削除の完了とは表現しない
- legacy削除済み画面: 明示要求の記録がない既存tombstone向けの補助導線

## API

- `accountDeletion.queries.getDeletionPreview`: 認証identityから全所属を再構成し、破壊対象IDを含まない削除範囲とfingerprintを返す
- `POST /account-deletion/request`: Bearer session token、Origin、issuer、strict再認証、最新previewを検証して削除を受付
- `OPTIONS /account-deletion/request`: 許可済みOrigin向けCORS preflight
- `accountDeletion.mutations.*`: 所属の再判定、本人所属の終了または組織cleanupの開始、lease取得、provider実行前検証、再試行・回収、完了redaction、保持期限後の削除、運用retry
- `accountDeletion.actions.*`: Clerk provider worker、read-only readiness
- `accountDeletion.queries.*`: 削除範囲previewと、個人情報を含まないboundedな運用probe

## 関連ファイル

- `src/components/features/AccountDeletion/`
- `src/pages/account-security/`
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

- 旧payloadの公開入力はrequest IDだけとし、所属なしの削除に限定する。所属整理を伴う要求は`scope=accountAndAssociations`と最新preview fingerprintを必須にする。
- Clerk user ID、ローカルuser ID、組織ID、店舗ID、roleをbrowserから受け取らず、認証identityとサーバー上の所属から削除範囲を決める。
- Clerkの代理操作sessionは本人同意として扱わず、`actor`と`act` claimをfail closedで拒否する。
- previewと受付の間に組織、管理者、店舗、課金状態、将来割当、または元管理者の関連付け種別・member状態が変わった場合はstale fingerprintとして拒否し、user、所属、job、schedulerを変更しない。
- 受付時と外部削除直前に所属を再検査し、判定不能を含めてfail closedにする。元管理者として扱うのは、同じ組織・personを指す`removed` memberが一件だけあり、本人以外の有効な管理者が確認できる場合に限る。共有組織から退出する場合は、本人staffの通知履歴が残っていないことを確認するまでproviderへ触れず、残存していれば削除batchを再開する。
- 組織削除を伴う場合は、対象組織と一致するcleanup jobの`completed`を確認するまでproviderへ触れない。関連付けたcleanup jobが`actionRequired`になった場合は親jobも`actionRequired`で停止し、運用retryでは対象とversionを再確認して子jobから再開する。
- 同一ユーザーの既存jobは設定検証やrate limitより先に再利用し、Clerk再認証の自動再送を冪等に扱う。
- 既存の`users`行は`name`、`email`、`emailNormalized`、`authTokenIdentifier`を上書きせず、`isDeleted`と`accountDeletionRequestedAt`で利用を停止する。
- `users`行がない認証主体には、Clerk claimの氏名やメールアドレスを複製せず、schema必須値を満たす非PIIの合成行を作る。
- `authTokenIdentifier`は古いJWTを削除済み状態へ解決して拒否するために保持し、公開responseやログへ出さず、新しいClerkアカウントとの再関連付けに使用しない。
- provider対象を一度確認し、削除試行を記録した後の404だけを完了扱いにする。
- 完了時にprovider識別子をredactし、完了jobは90日後にbounded batchで削除する。
- Clerk user IDは処理中jobだけへ一時保存し、完了transactionでredactする。Clerk user ID、secret、session token、provider response本文はログや公開responseへ出さず、secret、session token、provider response本文はDBにも保存しない。
- 削除済みuserへの`getCurrentUser`は`accountDeleted`と`accountDeletionRequested`のbooleanだけを返し、保持した氏名やメールアドレスを通常画面へ返さない。
- 再登録したClerkユーザーを、保持している履歴や削除済みuserへ自動で関連付けない。
- 削除後に同じメールでスタッフ追加、QR申請承認、または管理者招待を行う場合は、削除済みuserに紐づく旧人物を履歴として維持し、新しい人物を作る。旧staff、管理者所属、LINE連携、招待、通知、課金参照は新しい人物へ移さない。
- 本人からの個人データ消去要求は、本人確認、法務判断、対象データの抽出を伴う別の運用または将来機能として扱う。
- frontendのbuild-time flagは使わず、アカウント設定では現在の削除可否を常にサーバーへ問い合わせる。既存の所属なしユーザーとlegacy削除済みユーザーには補助入口も表示し、初回セットアップでは表示しない。
- 必須のClerk設定が揃い、`CLERK_SECRET_KEY`で取得したClerk domainと`CLERK_JWT_ISSUER_DOMAIN`の一致を確認できる場合は常に受付可能とする。

## テストと公開前確認

Clerkユーザーを実際に削除するE2Eは追加しません。
HTTP Function Test、Clerk adapterのfakeを使うConvex Function / Scenario Test、Frontend Logic / Behavior Testで自動検証し、各deploymentではユーザー取得・削除を行わないread-only readinessを実行します。
`convex/accountDeletion/combined.test.ts`では、preview分岐、複数組織とstale previewの拒否、現役管理者と元管理者の共有組織からの本人離脱、元管理者関連付けの不整合拒否、通知履歴の削除待機、単独管理者のcleanup待機、子jobの`actionRequired`と運用retry、重複受付を検証します。
`convex/_scenario/accountDeletion.test.ts`では、子jobと親jobが要対応で停止した後に、対象とversionを照合してcleanupとprovider削除へ収束する復旧経路を検証します。

既存jobと互換にするため、組織cleanupへの参照、共有退出の通知履歴cleanup対象、各待機phaseはoptional wideningで追加します。
既存jobは従来のprovider phaseを継続できるため、backfill migrationは行いません。
すでに削除済みの値へマスキングされた氏名やメールアドレスは、この変更で推測またはバックアップから自動復元しません。

公開前に、対象deploymentで既存の`VITE_CLERK_PUBLISHABLE_KEY`を含む環境変数を同期し、Clerk domainとissuerの一致、再認証factor、既存migrationの完了、legacy tombstoneの件数を確認します。
業務識別情報の保持目的と保持期間はプロダクト責任者が確定し、プライバシーポリシーへ反映してから公開します。
