# 管理ユーザーと店舗所属

管理ユーザーと店舗の所属は `shopMembers` で管理する。将来の複数店舗対応に備え、`users` に店舗IDを直接持たせず、店舗ごとの権限・通知対象・操作対象は `shopMembers` と各ドメインデータの `shopId` で判定する。

## 関連ファイル

- `convex/schema.ts` — `users` / `shops` / `shopMembers` と所属検索index
- `convex/_lib/functions.ts` — manager向けAPIの認証と現在店舗解決
- `convex/dashboard/queries.ts` — dashboard表示用の店舗スコープquery
- `convex/setup/mutations.ts` — 初回店舗登録とmanager所属作成
- `src/components/features/AuthenticatedApp/AuthGuard.tsx` — フロントの選択中店舗を所属一覧と整合
- `src/hooks/useShopQuery.ts` — 選択中店舗をmanager queryへ注入
- `src/hooks/useShopPaginatedQuery.ts` — 選択中店舗をmanager paginated queryへ注入
- `src/hooks/useShopMutation.ts` — 選択中店舗をmanager mutationへ注入
- `src/components/features/AuthenticatedApp/AuthenticatedHeader/` — 店舗削除確認UI（入口は一時停止中）
- `convex/staffRegistration/notificationQueries.ts` — 店舗のmanager usersを通知対象として取得

## 画面一覧

| 画面 | 役割 |
|---|---|
| ダッシュボード | フロントで選択中のactive所属店舗を表示する |
| 右上ユーザーメニュー | 店舗削除入口は誤操作リスクを再検討するため一時停止中 |

## API一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.setup.mutations.setupShopAndManager` | mutation | 初回店舗とmanager所属を作成する。現時点ではactive所属があるmanagerの2店舗目作成は許可しない |
| `api.dashboard.queries.getDashboardShop` | query | 現在店舗の基本情報を取得する |
| `api.dashboard.queries.getDashboardRecruitments` | query | 現在店舗の募集一覧を取得する |
| `api.dashboard.queries.getDashboardStaffs` | query | 現在店舗のスタッフ一覧を取得する |
| `api.dashboard.queries.getMyShops` | query | ログインmanagerの全active所属店舗を返す（フロントの `selectedShopAtom` 初期化用） |

## 現在店舗の解決（manager API）

現行フロントは、`managerQuery` / `managerMutation`（`convex/_lib/functions.ts`）へ `shopId` を必ず渡す。

- `shopMembers.by_userId_and_shopId_and_isDeleted` でactive所属を確認し、指定店舗を `ctx.shop` にする。
- 店舗が削除済み、membershipが削除済み、または未所属の場合、queryは各APIの空結果を返し、mutationは `Not found` とする。
- クライアントの `shopId` は操作対象の指定にだけ使い、認可根拠には使わない。
- Convexをフロントより先にデプロイする間も旧フロントを壊さないよう、サーバー引数はこのリリースではoptionalとする。
  省略時だけ先頭のactive所属店舗へフォールバックし、現行フロントの配布後に別リリースで互換経路を削除する。

フロント側は `selectedShopAtom`（localStorage永続化）に選択中店舗を保持する。
`useShopQuery`、`useShopPaginatedQuery`、`useShopMutation` がmanager APIへ `shopId` を自動注入する。
店舗が未選択の場合、query系hookは購読を `skip` し、mutation hookはバックエンドを呼ばずに失敗する。
`AuthGuard` は `getMyShops` でatomを初期化・整合し、選択中店舗の確定前は配下画面を表示しない。
`getMyShops` が0件になった場合は `selectedShopAtom` を `null` にし、削除した店舗が保存値に残っている場合は先頭の有効店舗へ切り替える。

## 補足

- **店舗切替UI（プルダウン等）は未実装**。
  `selectedShopAtom` は `getMyShops` の先頭店舗で初期化され、現行フロントのmanager API呼び出しは必ず選択中の `shopId` を含む。
- ダッシュボードの店舗スコープ読み取りは `managerQuery` を使う。
- `getMyShops`、`getCurrentUser`、全体向けお知らせなどのbootstrap・userスコープqueryは `authenticatedQuery` のままとする。
- 2店舗目作成、店舗招待は未実装。
- managerの法務同意はuser単位で判定する。`legalConsentStates.shopId` は同意した店舗文脈の履歴として扱う。
