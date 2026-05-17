# 店舗設定

店舗名、シフト時間帯、定休日など、シフト作成の前提になる店舗情報を管理する。初回登録では最小限の店舗名・シフト時間帯だけを入力し、定休日は登録後の店舗設定から編集する。

## 関連ファイル

- `src/components/features/Dashboard/EditShopForm/` — 店舗設定フォーム
- `convex/shop/mutations.ts` — 店舗設定更新
- `convex/dashboard/queries.ts` — ダッシュボード用の店舗設定取得

## 画面一覧

| 画面 | 説明 |
|---|---|
| ダッシュボード 店舗設定モーダル | 店舗名、シフト時間帯、定休日を編集する |
| 初回セットアップ | 店舗名、シフト時間帯のみ登録する |

## API一覧

| API | 種別 | 説明 |
|---|---|---|
| `api.dashboard.queries.getDashboardShop` | query | 店舗設定を取得する |
| `api.shop.mutations.updateShopSettings` | mutation | 店舗名、シフト時間帯、定休日を更新する |
| `api.setup.mutations.setupShopAndManager` | mutation | 初回セットアップ時に店舗を作成する |
