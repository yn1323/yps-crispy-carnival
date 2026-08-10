# 店舗設定

店舗名、希望シフトの提出方法、定休日など、シフト作成の前提になる店舗情報を管理する。初回登録では店舗名と提出方法だけを入力し、提出方法の種類に応じて必要な時間だけを入力する。

## 関連ファイル

- `src/components/features/Dashboard/OperationContext/` — ダッシュボードから現在店舗の店舗詳細ページへ進む導線
- `src/components/features/ShopForm/` — 店舗追加・編集で使うステップ形式フォーム
- `src/routes/_auth/shops.$shopId.tsx` と `src/pages/shop-detail/` — 店舗詳細ページのURL、読み込み、Not Found境界
- `src/components/features/OrganizationSettings/` — 組織設定の店舗一覧と店舗追加UI
- `src/components/features/ShopDetail/` — 店舗情報の閲覧・一括編集、所属スタッフ数とAccordion一覧、削除確認UI
- `src/components/shared/ShopSettingsFields/` — 店舗編集モーダルと店舗詳細で共有する入力UI
- `src/components/shared/OrganizationPersonRow/` — 組織設定と店舗詳細で共有するユーザー一覧行
- `convex/organization/mutations.ts` — 組織所属店舗の追加、状態変更、削除受付
- `convex/shop/mutations.ts` — 店舗設定更新と旧店舗モデル向け削除互換API
- `convex/staff/queries.ts` と `convex/staff/mutations.ts` — 表示中の店舗に対する所属スタッフのsnapshot、解除影響preview、一括変更
- `convex/deletionCleanup/` — 削除店舗の所属、session、token、LINE連携、未送信通知の終了処理
- `convex/dashboard/queries.ts` — ダッシュボード用の店舗設定取得
- `doc/features/data-deletion.md` — 店舗・組織削除の保証範囲と対象外

## 画面一覧

| 画面 | 説明 |
|---|---|
| ダッシュボード 店舗詳細導線 | 現在店舗の店舗詳細ページへ進む |
| 初回セットアップ | 店舗名、希望シフトの提出方法を登録する |
| 組織設定 店舗タブ | 店舗一覧から専用の店舗詳細ページへ進む |
| `/shops/<shopId>?shop=<contextShopId>&returnTo=dashboard` | 基本情報、所属スタッフ数、その他設定を縦並びで表示し、店舗情報の一括編集、スタッフ一覧の展開、削除を受け付ける |

## API一覧

| API | 種別 | 説明 |
|---|---|---|
| `api.dashboard.queries.getDashboardShop` | query | 店舗設定を取得する |
| `api.organization.queries.getSettings` | query | 同じ組織に属する店舗、所属店舗ID付きユーザー、各操作の可否を取得する |
| `api.staff.queries.getOrganizationShopStaffMembershipChange` | query | 表示中の店舗IDを明示し、所属候補、現在の選択状態、変更可否、競合検知用fingerprintを取得する |
| `api.staff.queries.previewOrganizationShopStaffMembershipRemovals` | query | 店舗から外す人物とsnapshotを指定し、今日以降のシフト割り当てへの影響を確認する |
| `api.staff.mutations.changeOrganizationShopStaffMemberships` | mutation | 希望する人物ID一覧、fingerprint、解除preview、request IDを検証し、1店舗の所属スタッフを一括変更する |
| `api.shop.mutations.updateShopSettings` | mutation | 店舗詳細の編集Dialogから、店舗名、希望シフトの提出方法、定休日を一括更新する |
| `api.shop.mutations.updateShopSetting` | mutation | 旧店舗詳細UIとの互換用に、指定した設定だけを更新する |
| `api.organization.mutations.deleteShop` | mutation | 組織所属と確認IDを再検証し、店舗を論理削除して永続cleanup jobを開始する |
| `api.shop.mutations.deleteShop` | mutation | 旧店舗モデル向け互換API。現行の組織所属店舗UIからは呼ばない |
| `api.setup.mutations.setupShopAndManager` | mutation | 初回セットアップ時に店舗を作成する |

## 仕様メモ

- 希望シフトの提出方法は `時間指定` / `日ごと` / `勤務区分` から選ぶ。
- `時間指定` は提出方法の中にシフト開始/終了時間を持つ。
- `日ごと` はスタッフが出勤可能日だけを選び、時間入力は持たない。
- `勤務区分` は区分名と時間帯を最大4件まで定義し、保存時に開始時間が早い順、同じ開始時間なら終了時間が早い順へ並べてから募集作成時点の設定が募集に保存される。
- 店舗詳細の基本情報は読み取り用の一覧として表示する。見出し右の鉛筆アイコン付き`編集する`ボタンから`ShopForm`を開き、表示中の店舗IDを明示して店舗名、希望シフトの集め方と勤務時間、定休日を1回のmutationで一括更新する。
- Dashboardの歯車から開く場合は`returnTo=dashboard`を付け、店舗詳細の戻る操作で同じ店舗のDashboardへ戻る。組織設定から開く場合は従来どおり店舗タブへ戻る。
- 店舗詳細のスタッフ欄は、対象店舗に所属する人物単位の件数だけを初期表示し、`スタッフ一覧を見る`から同じカード内へ全件を展開する。
- スタッフ欄の見出し右にある`所属スタッフを変更する`から、組織に登録済みの人物をチェックボックスで選ぶ。管理者かどうかと、ほかの店舗への所属は確認用に表示するだけで、この操作では変更しない。店舗設定が閲覧専用の場合は導線も無効にする。
- Dialogを開いた時点の所属snapshotを編集対象として固定する。追加だけならそのまま保存し、追加したスタッフにはシフト提出やLINE連携に必要な案内を予約する。
- 店舗から外す人物がいる場合は、名前と今日以降のシフト割り当て件数を再確認してから変更する。所属を外すと対象店舗へのアクセス、LINE連携、未送信通知を終了し、今日以降のシフト割り当てを削除する。組織への登録、管理者権限、ほかの店舗への所属、過去のシフト記録は保持する。
- 人物に対応しない既存スタッフなど、安全に人物単位へ変更できない行は選択済みのまま保持し、変更できない理由を表示する。全員を外す変更では、変更後に店舗のスタッフが0名になることを確認画面で警告する。
- 所属snapshotまたは解除対象のシフトが変わった場合は古い内容を保存しない。通信結果が不明な同一操作だけは、同じ入力とrequest IDで再試行する。
- 店舗詳細のスタッフ一覧は、`getSettings.people.shopIds`を対象店舗IDで絞り込む。同名店舗を店舗名で誤判定せず、人物単位の一覧件数と表示件数を一致させる。行を押すとスタッフ詳細へ進み、出発元店舗は`returnShop`に保持するため、スタッフ詳細内で店舗を切り替えても戻る操作で元の店舗詳細へ復帰する。
- 店舗削除は物理削除ではなく、受付時に店舗名を保持したまま`shops.isDeleted = true`にする。最後の未削除店舗は削除できない。
- 店舗削除に成功したら、削除対象とは異なる現在contextの店舗を優先し、なければ同じ組織の先頭の未削除店舗へ復帰する。復帰先URLへ削除済み店舗IDを残さない。
- 店舗詳細のpath paramは表示対象、`shop` queryは認証済みの店舗・組織コンテキストとして扱う。詳細表示は`api.organization.queries.getSettings`が返した同一組織の店舗だけに限定する。
- 外部から無効な店舗IDを明示した保護routeは、自動で別店舗へ読み替えず、認証境界でfail closedにする。
- 後続の永続cleanup jobは、対象店舗の`staffs`にある氏名、メールアドレス、正規化メールを保持したまま論理削除し、`staffLineAccounts`のLINE IDだけを削除済みの値へ置き換える。店舗用session、magic link、LINE連携token、法務同意token、登録リンクを失効し、未送信通知を停止する。
- 店舗削除では`users`、`organizationPeople`、`organizationMembers`を変更しない。対象店舗のユーザーは組織人物として残る。
- 店舗名、スタッフの氏名とメールアドレス、rate limit、自由入力欄、送信済みメール、LINEはDBに残るため、この導線を個人データの消去や匿名化とは扱わない。詳細は`doc/features/data-deletion.md`を参照する。
- 保持契約はConvex Function TestとScenario Testで検証する。E2Eはworker専用scenario上でUI追加した2店舗目だけを削除し、実browserの復帰導線を検証する。Clerk userや組織全体を破壊するE2Eは追加しない。
