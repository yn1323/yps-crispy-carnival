# 店舗・グループ削除

## 機能説明

グループ設定から店舗またはグループの利用を終了し、主要マスタにある店舗名、グループ名、氏名、メールアドレス、LINE IDを削除済みの値へ置き換える。
物理削除や全保存先からの完全消去ではなく、対象scopeの即時利用停止と、再開可能な永続cleanupによる主要マスタ置換を保証する。

## 保証する範囲

| 対象 | 店舗削除 | グループ削除 |
| --- | --- | --- |
| `shops` | 対象店舗を論理削除し、nameを`削除済み店舗`へ置換 | 全店舗を同様に変更 |
| `organizations` | 変更しない | 論理削除し、nameとbilling emailを削除済み値へ置換 |
| `staffs` | 対象店舗分を論理削除し、氏名・メールを置換 | 全店舗分を同様に変更 |
| `staffLineAccounts` | 対象店舗分を論理削除し、LINE IDを置換 | 全店舗分を同様に変更 |
| `organizationPeople` / `organizationMembers` | 変更しない | `removed`へ変更し、personの氏名・メールを置換 |
| `users` | 変更しない | 対象外の有効グループ所属がないuserだけ論理削除し、氏名・メールを置換 |
| session / token / 登録リンク | 対象店舗分を失効 | 全店舗分を失効 |
| 未送信通知 | 対象店舗scopeを停止 | 対象店舗・グループscopeを停止 |

置換値は行IDから決定的に作る。
メールアドレスは`deleted+<table>.<documentId>@example.invalid`、LINE IDは`deleted:<documentId>`とし、再試行しても同じ値を使ってindex衝突を避ける。

## 保証しない範囲

- `rateLimits.key`、監査、シフト・同意・請求などの履歴、自由入力欄。
- staff、shop member、通知、監査などに残る内部ID参照。
- raw token、session、scheduled function引数。保存値は残してもサーバー側で失効させる。
- 送信済みまたは送信処理中のメール・LINE、外部providerの保持データ。
- Clerkのユーザー、認証設定、session、ログ、export、バックアップ、ブラウザ履歴、別タブ、別端末。

このため、画面とドキュメントでは「個人情報の完全消去」や「全システムからの匿名化」と表現しない。

## 削除可能条件

- 店舗削除は対象グループの有効管理者だけが行え、最後の未削除店舗は削除できない。
- グループ削除は対象グループで唯一の`active`管理者だけが行える。`readOnly`を含むほかの管理者がいる場合は先に整理する。
- グループ削除を許可する課金状態は、有料プラン未選択のTrial、Free、無償Businessである。有料契約中またはプラン変更中は受け付けない。
- グループ削除は未完了の店舗削除jobがない場合だけ受け付ける。
- clientの店舗ID、グループID、確認ID、更新時刻は認可の根拠にせず、Clerk identityから解決した所属とサーバー上の最新状態へ照合する。
- 同じ操作意図では固定request IDを再利用し、監査とcleanup jobを重複作成しない。

## 削除後の状態

- 親の`isDeleted`を受付transactionで先に確定し、manager API、staff session、公開Capability、通知enqueueと外部送信を停止する。
- 削除済みuserへの`getCurrentUser`は`{ accountDeleted: true }`だけを返し、Clerk identityに残る氏名・メールアドレスをアプリへ戻さない。
- グループ専属userは削除済み状態を表示してサインアウトできる。共有userは削除したグループだけを候補から外し、別の有効グループを継続利用できる。
- Clerkの認証主体と`users.authTokenIdentifier`は変更しない。

## 画面一覧

| 画面 | 説明 |
| --- | --- |
| グループ設定「店舗」タブの店舗詳細モーダル | 対象店舗と影響範囲を確認し、店舗削除を受け付ける |
| グループ設定「設定」タブ | グループ削除可否または拒否理由を表示し、グループ名の再入力後に削除を受け付ける |
| 削除済みアカウント状態 | 個人情報を表示せず、利用終了案内とサインアウトを表示する |

## 関連ファイル

- `convex/schema.ts` — `deletionCleanupJobs`とcleanup用index。
- `convex/organization/deletion.ts` — グループ削除可否。
- `convex/organization/mutations.ts` — 店舗・グループ削除の公開受付。
- `convex/deletionCleanup/` — tombstone生成、job作成、bounded worker、lease回収。
- `convex/migrations/m016_deleted_shops_enqueue_cleanup_jobs.ts` — 既存削除済み店舗のjob作成。
- `convex/migrations/m017_deleted_organizations_enqueue_cleanup_jobs.ts` — 既存削除済みグループのjob作成。
- `convex/organization/deletion.test.ts` — 削除受付、認可、主要マスタ置換、共有user維持のFunction Test。
- `convex/_scenario/organizationDeletion.test.ts` — 複数店舗・100件超の人物・中断回収・別グループ非干渉のScenario Test。
- `convex/deletionCleanup/migrations.test.ts` — m016/m017の対象限定と再実行のFunction Test。
- `src/components/features/OrganizationSettings/ShopManagement/` — 店舗削除UI。
- `src/components/features/OrganizationSettings/OrganizationDeletion/` — グループ削除UI。
- `src/components/features/AuthenticatedApp/DeletedAccountState.tsx` — 削除済みuserの終了状態。
- `e2e/scenarios/shop-deletion-flow.test.ts` — 店舗削除の実画面接続。
- `e2e/scenarios/organization-deletion-flow.test.ts` — グループ削除の実画面接続。

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

`m016`と`m017`は固定migration seriesへ登録済みだが、この実装作業では本番データへ実行しない。
本番では事前export、対象件数、migration componentの完了状態、cleanup jobの非終端件数、主要マスタの置換結果を別々に確認する。
既に置き換えた主要マスタの値は、コードをロールバックしても元へ戻さない。
