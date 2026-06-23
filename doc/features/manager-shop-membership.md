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
| `api.dashboard.queries.getMyShops` | query | ログインmanagerの全active所属店舗を返す（フロントの `selectedShopAtom` 初期化用） |

## 現在店舗の解決（manager API）

`managerQuery` / `managerMutation`（`convex/_lib/functions.ts`）は optional 引数 `shopId` を受け取る。

- `shopId` 指定あり: `shopMembers.by_userId_and_shopId_and_isDeleted` でactive所属を確認し、その店舗を `ctx.shop` にする。未所属なら query は `null`、mutation は `Not found`（IDOR・列挙対策）。
- `shopId` 未指定: 先頭のactive所属店舗にフォールバック（後方互換）。

フロント側は `selectedShopAtom`（localStorage永続化）に選択中店舗を保持し、`useShopMutation`（`src/hooks/useShopMutation.ts`）が manager 系 mutation へ `shopId` を自動注入する。`AuthGuard` が `getMyShops` で atom を初期化/整合する。

## 補足

- **店舗切替UI（プルダウン等）は未実装**。`selectedShopAtom` は先頭店舗で初期化されるため、現状の挙動は実質これまでと同じ（送信経路だけ整備済み）。
- ダッシュボードの読み取り（`getDashboardShop` 等）は `authenticatedQuery` + `getManagerShop`（先頭店舗）で、まだ `shopId` を受け取らない。完全な複数店舗読み取りは切替UI導入時に対応する。
- 2店舗目作成、店舗招待は未実装。
- managerの法務同意はuser単位で判定する。`legalConsentStates.shopId` は同意した店舗文脈の履歴として扱う。
