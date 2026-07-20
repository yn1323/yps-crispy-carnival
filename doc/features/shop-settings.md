# 店舗設定

店舗名、希望シフトの提出方法、定休日など、シフト作成の前提になる店舗情報を管理する。初回登録では店舗名と提出方法だけを入力し、提出方法の種類に応じて必要な時間だけを入力する。

## 関連ファイル

- `src/components/features/Dashboard/ShopSettings/` — ダッシュボードの店舗編集モーダルと更新処理
- `src/components/features/ShopForm/` — 店舗追加・編集で使うステップ形式フォーム
- `src/routes/_auth/shops.$shopId.tsx` と `src/pages/shop-detail/` — 店舗詳細ページのURL、読み込み、Not Found境界
- `src/components/features/OrganizationSettings/` — グループ設定の店舗一覧と店舗追加UI
- `src/components/features/ShopDetail/` — 店舗情報の閲覧・一括編集、所属スタッフ数とAccordion一覧、削除確認UI
- `src/components/shared/ShopSettingsFields/` — 店舗編集モーダルと店舗詳細で共有する入力UI
- `src/components/shared/OrganizationPersonRow/` — グループ設定と店舗詳細で共有するユーザー一覧行
- `convex/organization/mutations.ts` — グループ所属店舗の追加、状態変更、削除受付
- `convex/shop/mutations.ts` — 店舗設定更新と旧店舗モデル向け削除互換API
- `convex/deletionCleanup/` — 削除店舗の所属、session、token、LINE連携、未送信通知の終了処理
- `convex/dashboard/queries.ts` — ダッシュボード用の店舗設定取得
- `doc/features/data-deletion.md` — 店舗・グループ削除の保証範囲と対象外

## 画面一覧

| 画面 | 説明 |
|---|---|
| ダッシュボード 店舗設定モーダル | 店舗名、希望シフトの提出方法、定休日を編集する |
| 初回セットアップ | 店舗名、希望シフトの提出方法を登録する |
| グループ設定 店舗タブ | 店舗一覧から専用の店舗詳細ページへ進む |
| `/shops/<shopId>?shop=<contextShopId>` | 基本情報、所属スタッフ数、その他設定を縦並びで表示し、店舗情報の一括編集、スタッフ一覧の展開、削除を受け付ける |

## API一覧

| API | 種別 | 説明 |
|---|---|---|
| `api.dashboard.queries.getDashboardShop` | query | 店舗設定を取得する |
| `api.organization.queries.getSettings` | query | 同じグループに属する店舗、所属店舗ID付きユーザー、各操作の可否を取得する |
| `api.shop.mutations.updateShopSettings` | mutation | Dashboardと店舗詳細の編集Dialogから、店舗名、希望シフトの提出方法、定休日を一括更新する |
| `api.shop.mutations.updateShopSetting` | mutation | 旧店舗詳細UIとの互換用に、指定した設定だけを更新する |
| `api.organization.mutations.deleteShop` | mutation | グループ所属と確認IDを再検証し、店舗を論理削除して永続cleanup jobを開始する |
| `api.shop.mutations.deleteShop` | mutation | 旧店舗モデル向け互換API。現行のグループ所属店舗UIからは呼ばない |
| `api.setup.mutations.setupShopAndManager` | mutation | 初回セットアップ時に店舗を作成する |

## 仕様メモ

- 希望シフトの提出方法は `時間指定` / `日ごと` / `勤務区分` から選ぶ。
- `時間指定` は提出方法の中にシフト開始/終了時間を持つ。
- `日ごと` はスタッフが出勤可能日だけを選び、時間入力は持たない。
- `勤務区分` は区分名と時間帯を最大4件まで定義し、保存時に開始時間が早い順、同じ開始時間なら終了時間が早い順へ並べてから募集作成時点の設定が募集に保存される。
- 店舗詳細の基本情報は読み取り用の一覧として表示する。見出し右の鉛筆アイコン付き`編集する`ボタンからDashboardと同じ`ShopForm`を開き、表示中の店舗IDを明示して店舗名、希望シフトの集め方と勤務時間、定休日を1回のmutationで一括更新する。
- 店舗詳細のスタッフ欄は、対象店舗に所属する人物単位の件数だけを初期表示し、`スタッフ一覧を見る`から同じカード内へ全件を展開する。
- 店舗詳細のスタッフ一覧は、`getSettings.people.shopIds`を対象店舗IDで絞り込む。同名店舗を店舗名で誤判定せず、人物単位の一覧件数と表示件数を一致させる。行を押すとユーザー詳細へ進み、出発元店舗は`returnShop`に保持するため、ユーザー詳細内で店舗を切り替えても戻る操作で元の店舗詳細へ復帰する。
- 店舗削除は物理削除ではなく、受付時に店舗名を保持したまま`shops.isDeleted = true`にする。最後の未削除店舗は削除できない。
- 店舗詳細のpath paramは表示対象、`shop` queryは認証済みの店舗・グループコンテキストとして扱う。詳細表示は`api.organization.queries.getSettings`が返した同一グループの店舗だけに限定する。
- 後続の永続cleanup jobは、対象店舗の`staffs`にある氏名、メールアドレス、正規化メールを保持したまま論理削除し、`staffLineAccounts`のLINE IDだけを削除済みの値へ置き換える。店舗用session、magic link、LINE連携token、法務同意token、登録リンクを失効し、未送信通知を停止する。
- 店舗削除では`users`、`organizationPeople`、`organizationMembers`を変更しない。対象店舗のユーザーはグループ人物として残る。
- 店舗名、スタッフの氏名とメールアドレス、rate limit、自由入力欄、送信済みメール、LINEはDBに残るため、この導線を個人データの消去や匿名化とは扱わない。詳細は`doc/features/data-deletion.md`を参照する。
- 保持契約はConvex Function TestとScenario Testで検証し、削除用アカウントを破壊する新しいE2Eは追加しない。
