# 店舗・グループ削除

## 機能説明

グループ設定から店舗またはグループの利用を終了し、対象scopeの権限、session、token、LINE連携、未送信通知を停止する。
店舗名、グループ名、請求先メールアドレス、氏名、メールアドレスは過去の業務履歴を識別するためDBに保持し、物理削除や匿名化は行わない。

## 保証する範囲

| 対象 | 店舗削除 | グループ削除 |
| --- | --- | --- |
| `shops` | `name`を保持し、対象店舗を論理削除 | 全店舗を同様に変更 |
| `organizations` | 変更しない | `name`、`billingEmail`、`billingEmailNormalized`を保持し、論理削除 |
| `staffs` | 氏名、メール、正規化メールを保持し、対象店舗分を論理削除 | 全店舗分を同様に変更 |
| `staffLineAccounts` | 対象店舗分を論理削除し、LINE IDを置換 | 全店舗分を同様に変更 |
| `organizationPeople` / `organizationMembers` | 変更しない | personの氏名、メール、正規化メールを保持し、`removed`へ変更 |
| `users` | 変更しない | 変更しない。ログインアカウントの削除は明示的なアカウント削除導線だけで受け付ける |
| session / token / 登録リンク | 対象店舗分を失効 | 全店舗分を失効 |
| 未送信通知 | 対象店舗scopeを停止 | 対象店舗・グループscopeを停止 |

LINE IDの置換値は`deleted:<documentId>`として行IDから決定的に作り、再試行でも同じ値を使ってindex衝突を避ける。
氏名、メールアドレス、正規化メール、店舗名、グループ名、請求先メールアドレスはcleanupで上書きしない。

## 保証しない範囲

- 氏名、メールアドレス、店舗名など、保持する業務識別情報の本人要請による消去。
- `rateLimits.key`、監査、シフト、同意、請求などの履歴、自由入力欄の物理削除。
- staff、shop member、通知、監査などに残る内部ID参照。
- raw token、session、scheduled function引数。保存値は残してもサーバー側で失効させる。
- 送信済みまたは送信処理中のメール、LINE、外部providerの保持データ。
- Clerkのユーザー、認証設定、session、ログ、export、バックアップ、ブラウザ履歴、別タブ、別端末。

この削除導線は個人データの消去要求を処理する機能ではないため、画面とドキュメントでは「個人情報の完全消去」や「匿名化」と表現しない。

## 削除可能条件

- 店舗削除は対象グループの有効管理者だけが行え、最後の未削除店舗は削除できない。
- グループ削除は対象グループで唯一の`active`管理者だけが行える。`readOnly`を含むほかの管理者がいる場合は先に整理する。
- グループ削除を許可する課金状態は、有料プラン未選択のTrial、Free、支払い不要Businessである。
  支払い不要Businessの保存状態は`complimentary.business`だけであり、旧`complimentary.pro`を現行の削除可否判定へ入力しない。
- 有料プラン未選択のTrialでも、Stripe Subscription、進行中のTrial作成operation、または一意な終了証跡がない過去の作成operationがあれば削除しない。
  provider上の契約が終了済みであることを、保存済みSubscriptionとcleanup operationの対応から確認できる場合だけ受け付ける。
- グループ削除は未完了の店舗削除jobがない場合だけ受け付ける。
- clientの店舗ID、グループID、確認ID、更新時刻は認可の根拠にせず、Clerk identityから解決した所属とサーバー上の最新状態へ照合する。
- 同じ操作意図では固定request IDを再利用し、監査とcleanup jobを重複作成しない。

## 削除後の状態

- 親の`isDeleted`を受付transactionで先に確定し、manager API、staff session、公開Capability、通知enqueueと外部送信を停止する。
- グループ削除ではglobal `users`を論理削除・匿名化しない。最後の有効グループを削除したuserは、同じClerk認証を維持して店舗登録画面へ戻り、新しいグループを作成できる。
- 共有userは削除したグループだけを候補から外し、別の有効グループを継続利用できる。
- 店舗名、グループ名、請求先メールアドレス、氏名、メールアドレス、正規化メールはDBに残すが、削除済みの店舗、グループ、人物、スタッフをactive一覧や通常の編集APIへ返さない。
- 明示的なアカウント削除受付済みuserまたはlegacy削除済みuserへの`getCurrentUser`は、`accountDeleted`と受付済みかどうかのbooleanだけを返す。Clerk identityに残る氏名・メールアドレスや受付時刻は返さない。
- Clerkの認証主体と`users.authTokenIdentifier`は変更しない。

## 画面一覧

| 画面 | 説明 |
| --- | --- |
| 店舗詳細ページ | グループ設定の店舗一覧から進み、対象店舗と影響範囲を確認して店舗削除を受け付ける |
| グループ設定「設定」タブ | グループ削除可否または拒否理由を表示し、グループ名の再入力後に削除を受け付ける |
| 店舗登録画面 | 最後のグループ削除後も認証を維持し、新しい店舗を登録できる |
| 削除済みアカウント状態 | 明示的なアカウント削除受付済みまたはlegacy削除済みuserへ、個人情報を表示せず終了状態を表示する |

## 関連ファイル

- `convex/schema.ts` — `deletionCleanupJobs`とcleanup用index。
- `convex/organization/deletion.ts` — グループ削除可否。
- `convex/organization/mutations.ts` — 店舗・グループ削除の公開受付。
- `convex/deletionCleanup/` — job作成、bounded worker、lease回収、LINE ID切断。旧user cleanup phase/resourceは永続済みjobとの互換用no-opとして維持する。
- `doc/features/account-deletion.md` — Clerkアカウントを含む明示的なアカウント削除。
- `convex/migrations/m016_deleted_shops_enqueue_cleanup_jobs.ts` — 既存削除済み店舗のjob作成。
- `convex/migrations/m017_deleted_organizations_enqueue_cleanup_jobs.ts` — 既存削除済みグループのjob作成。
- `convex/organization/deletion.test.ts` — 削除受付、認可、業務識別情報の保持、アクセス失効、global user維持のFunction Test。
- `convex/_scenario/organizationDeletion.test.ts` — 複数店舗、100件超の人物、中断回収、業務識別情報とglobal userの維持、再セットアップのScenario Test。
- `convex/deletionCleanup/migrations.test.ts` — m016/m017の対象限定と再実行のFunction Test。
- `src/components/features/ShopDetail/` — 店舗詳細と店舗削除UI。
- `src/components/features/OrganizationSettings/OrganizationDeletion/` — グループ削除UI。
- `src/components/features/AuthenticatedApp/DeletedAccountState.tsx` — 削除済みuserの終了状態。
- `src/components/features/ShopDetail/index.stories.tsx`と`useShopDeletionController.test.tsx` — 店舗削除の表示状態、確認、mutation接続。
- `src/components/features/OrganizationSettings/OrganizationDeletion/OrganizationDeletionDialog.stories.tsx`と`controllers.test.tsx` — グループ削除の確認、状態変化、mutation接続。

## API一覧

| API | 種別 | 説明 |
| --- | --- | --- |
| `api.organization.queries.getSettings` | `managerQuery` | グループID、更新時刻、削除可否と拒否理由を返す |
| `api.organization.mutations.deleteShop` | `authenticatedMutation` | 店舗を即時停止し、shop scopeのcleanup jobを開始する |
| `api.organization.mutations.deleteOrganization` | `authenticatedMutation` | グループを即時停止し、organization scopeのcleanup jobを開始する |
| `api.dashboard.queries.getCurrentUser` | `authenticatedQuery` | 削除済みuserへ個人情報を含まない終了状態を返す |
| `internal.deletionCleanup.mutations.kick` / `process` | `internalMutation` | lease付きのbounded cleanupを進める |
| `internal.deletionCleanup.mutations.recover` | `internalMutation` | retry待ちまたは期限切れleaseを再開する |
| `internal.deletionCleanup.queries.getStatus` | `internalQuery` | PIIを含まないcleanup jobの進捗と要対応状態を返す |

## 移行と運用

`m016`と`m017`は固定migration seriesへ登録されているが、登録だけでは実環境での完走を証明しない。
対象deploymentでは、事前export、対象件数、migration componentの完了状態、cleanup jobの非終端件数、アクセス失効状態、業務識別情報の保持を別々に確認し、結果を[リリース状態](../manual/release-status.md)へ記録する。
既に削除済みの値へ置き換えられた業務識別情報は、この変更で推測またはバックアップから自動復元しない。
新しいschema fieldやデータ形状の変更はないため、この保持方針のためのmigrationは追加しない。
