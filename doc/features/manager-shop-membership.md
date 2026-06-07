# 管理ユーザーと店舗所属

管理ユーザーと店舗の所属は `shopMembers` で管理する。将来の複数店舗対応に備え、`users` に店舗IDを直接持たせず、店舗ごとの権限・通知対象・操作対象は `shopMembers` と各ドメインデータの `shopId` で判定する。

## 関連ファイル

- `convex/schema.ts` — `users` / `shops` / `shopMembers` と所属検索index
- `convex/_lib/functions.ts` — manager向けAPIの認証と現在店舗解決
- `convex/dashboard/queries.ts` — dashboard表示用の現在店舗解決
- `convex/setup/mutations.ts` — 初回店舗登録とmanager所属作成
- `convex/staffRegistration/notificationQueries.ts` — 店舗のmanager usersを通知対象として取得

## 画面一覧

| 画面 | 役割 |
|---|---|
| ダッシュボード | 現在はログインmanagerの最初のactive所属店舗を表示する |

## API一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.setup.mutations.setupShopAndManager` | mutation | 初回店舗とmanager所属を作成する。現時点ではactive所属があるmanagerの2店舗目作成は許可しない |
| `api.dashboard.queries.getDashboardShop` | query | 現在店舗の基本情報を取得する |
| `api.dashboard.queries.getDashboardRecruitments` | query | 現在店舗の募集一覧を取得する |
| `api.dashboard.queries.getDashboardStaffs` | query | 現在店舗のスタッフ一覧を取得する |

## 補足

- 複数店舗切替UI、2店舗目作成、店舗招待は未実装。
- 将来のmanager APIは、選択中 `shopId` を受け取り、`shopMembers.by_userId_and_shopId_and_isDeleted` でactive所属を確認してから各データの `shopId` と突合する。
- managerの法務同意はuser単位で判定する。`legalConsentStates.shopId` は同意した店舗文脈の履歴として扱う。
