# 店舗設定

店舗名、希望シフトの提出方法、定休日など、シフト作成の前提になる店舗情報を管理する。初回登録では店舗名と提出方法だけを入力し、提出方法の種類に応じて必要な時間だけを入力する。

## 関連ファイル

- `src/components/features/Dashboard/EditShopForm/` — 店舗設定フォーム
- `src/components/features/OrganizationSettings/ShopManagement/` — 店舗一覧、店舗詳細モーダル、削除確認UI
- `convex/organization/mutations.ts` — グループ所属店舗の追加、状態変更、削除受付
- `convex/shop/mutations.ts` — 店舗設定更新と旧店舗モデル向け削除互換API
- `convex/deletionCleanup/` — 削除店舗の主要マスタ置換、所属・session・token・未送信通知の終了処理
- `convex/dashboard/queries.ts` — ダッシュボード用の店舗設定取得
- `doc/features/data-deletion.md` — 店舗・グループ削除の保証範囲と対象外

## 画面一覧

| 画面 | 説明 |
|---|---|
| ダッシュボード 店舗設定モーダル | 店舗名、希望シフトの提出方法、定休日を編集する |
| 初回セットアップ | 店舗名、希望シフトの提出方法を登録する |
| グループ設定 店舗タブ | 店舗一覧から店舗詳細モーダルを開き、対象店舗を確認して削除する |

## API一覧

| API | 種別 | 説明 |
|---|---|---|
| `api.dashboard.queries.getDashboardShop` | query | 店舗設定を取得する |
| `api.shop.mutations.updateShopSettings` | mutation | 店舗名、希望シフトの提出方法、定休日を更新する |
| `api.organization.mutations.deleteShop` | mutation | グループ所属と確認IDを再検証し、店舗を論理削除して永続cleanup jobを開始する |
| `api.shop.mutations.deleteShop` | mutation | 旧店舗モデル向け互換API。現行のグループ所属店舗UIからは呼ばない |
| `api.setup.mutations.setupShopAndManager` | mutation | 初回セットアップ時に店舗を作成する |

## 仕様メモ

- 希望シフトの提出方法は `時間指定` / `日ごと` / `勤務区分` から選ぶ。
- `時間指定` は提出方法の中にシフト開始/終了時間を持つ。
- `日ごと` はスタッフが出勤可能日だけを選び、時間入力は持たない。
- `勤務区分` は区分名と時間帯を最大4件まで定義し、保存時に開始時間が早い順、同じ開始時間なら終了時間が早い順へ並べてから募集作成時点の設定が募集に保存される。
- 店舗削除は物理削除ではなく、受付時に`shops.isDeleted = true`として店舗名を`削除済み店舗`へ置き換える。最後の未削除店舗は削除できない。
- 後続の永続cleanup jobは、対象店舗の`staffs`を論理削除して氏名・メールアドレスを置き換え、`staffLineAccounts`のLINE IDを置き換える。店舗用session、magic link、LINE連携token、法務同意token、登録リンクを失効し、未送信通知を停止する。
- 店舗削除では`users`、`organizationPeople`、`organizationMembers`を変更しない。対象店舗のユーザーはグループ人物として残る。
- rate limit、自由入力欄、通知履歴、送信済みメール・LINEなどは置換対象外とする。詳細は`doc/features/data-deletion.md`を参照する。
