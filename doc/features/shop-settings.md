# 店舗設定

店舗名、希望シフトの提出方法、定休日など、シフト作成の前提になる店舗情報を管理する。初回登録では店舗名と提出方法だけを入力し、提出方法の種類に応じて必要な時間だけを入力する。

## 関連ファイル

- `src/components/features/Dashboard/EditShopForm/` — 店舗設定フォーム
- `src/components/features/AuthenticatedApp/AuthenticatedHeader/` — 店舗削除確認UI（入口は一時停止中）
- `convex/shop/mutations.ts` — 店舗設定更新
- `convex/dashboard/queries.ts` — ダッシュボード用の店舗設定取得

## 画面一覧

| 画面 | 説明 |
|---|---|
| ダッシュボード 店舗設定モーダル | 店舗名、希望シフトの提出方法、定休日を編集する |
| 初回セットアップ | 店舗名、希望シフトの提出方法を登録する |
| 右上ユーザーメニュー | 店舗削除入口は誤操作リスクを再検討するため一時停止中 |

## API一覧

| API | 種別 | 説明 |
|---|---|---|
| `api.dashboard.queries.getDashboardShop` | query | 店舗設定を取得する |
| `api.shop.mutations.updateShopSettings` | mutation | 店舗名、希望シフトの提出方法、定休日を更新する |
| `api.shop.mutations.deleteShop` | mutation | 現在店舗を論理削除し、関連アクセスのcleanupを予約する |
| `api.setup.mutations.setupShopAndManager` | mutation | 初回セットアップ時に店舗を作成する |

## 仕様メモ

- 希望シフトの提出方法は `時間指定` / `日ごと` / `勤務区分` から選ぶ。
- `時間指定` は提出方法の中にシフト開始/終了時間を持つ。
- `日ごと` はスタッフが出勤可能日だけを選び、時間入力は持たない。
- `勤務区分` は区分名と時間帯を最大4件まで定義し、保存時に開始時間が早い順、同じ開始時間なら終了時間が早い順へ並べてから募集作成時点の設定が募集に保存される。
- 店舗削除は物理削除ではなく論理削除。削除後にactive所属店舗がなくなった場合は、既存の初回セットアップ導線から店舗登録を再開する。
- 店舗削除の右上メニュー入口は一時停止中。確認Dialogと削除後の所属店舗整合は、入口再設計時に再接続する。
