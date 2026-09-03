# 店舗設定

店舗名、希望シフトの提出方法、定休日など、シフト作成の前提になる店舗情報を管理する。初回登録では店舗名と提出方法だけを入力し、提出方法の種類に応じて必要な時間だけを入力する。

## 関連ファイル

- `src/components/features/Dashboard/OperationContext/` — ダッシュボードから現在店舗の店舗詳細ページへ進む導線
- `src/components/features/ShopForm/` — 店舗追加・編集で使うステップ形式フォーム
- `src/routes/_auth/manage_.shops.$shopId.tsx`と`src/pages/shop-detail/` — 管理タブから開く店舗詳細ページのURL、読み込み、Not Found境界
- `src/components/features/OrganizationSettings/` — 組織設定の店舗一覧と、将来公開用の店舗追加UI
- `src/components/features/ShopDetail/` — 店舗情報の閲覧・一括編集、所属スタッフ数とAccordion一覧、削除確認UI
- `src/components/shared/ShopSettingsFields/` — 店舗編集モーダルと店舗詳細で共有する入力UI
- `src/components/shared/StaffListRow/` — Dashboard、組織設定、店舗詳細で共有するスタッフ一覧行
- `convex/organization/mutations.ts` — 組織所属店舗の追加、状態変更、削除受付
- `convex/shop/mutations.ts` — canonicalな店舗scopeでの店舗設定更新
- `convex/staff/queries.ts` と `convex/staff/mutations.ts` — 表示中の店舗に対する所属スタッフのsnapshot、解除影響preview、一括変更
- `convex/deletionCleanup/` — 削除店舗の所属、session、token、LINE連携、未送信通知の終了処理
- `convex/dashboard/queries.ts` — ダッシュボード用の店舗設定取得
- `doc/features/data-deletion.md` — 店舗・組織削除の保証範囲と対象外

## 画面一覧

| 画面 | 説明 |
|---|---|
| ダッシュボード 店舗詳細導線 | 現在店舗の店舗詳細ページへ進む |
| 初回セットアップ | 店舗名、希望シフトの提出方法を登録する |
| `/manage?org=<organizationId>` | 組織の店舗一覧を表示し、専用の店舗詳細ページまたは店舗追加へ進む |
| `/manage/shops/<shopId>?org=<organizationId>` | 管理タブで選択した組織の店舗詳細を表示し、戻る操作は管理タブ、スタッフ行は同じ組織のスタッフ詳細へ進む |

## API一覧

| API | 種別 | 説明 |
|---|---|---|
| `api.dashboard.queries.getDashboardShop` | query | 店舗設定を取得する |
| `api.organization.queries.getSettings` | query | 同じ組織に属する店舗、所属店舗ID付きユーザー、店舗管理通知の受信可否、各操作の可否を取得する。`/manage`ではURLの`org`を`expectedOrganizationId`として渡し、店舗との一致をサーバーで再検証する |
| `api.appOrganization.manageQueries.getManageOverview` | query | `/manage`向けに組織名、利用状況、非削除店舗数、操作可否を返す。店舗実体は含めない |
| `api.appOrganization.manageQueries.listOrganizationShops` | paginated query | URLで検証した組織の非削除店舗をcursor paginationし、プラン上限件数でtruncateしない |
| `api.organization.mutations.addShopForOrganization` | mutation | 店舗追加API。認証、組織境界、管理者状態、契約状態、店舗上限をwrite、通知、監査より前に確認する |
| `api.staff.queries.getOrganizationShopStaffMembershipChange` | query | 表示中の店舗IDを明示し、所属候補、現在の選択状態、変更可否、競合検知用fingerprintを取得する |
| `api.staff.queries.previewOrganizationShopStaffMembershipRemovals` | query | 店舗から外す人物とsnapshotを指定し、今日以降のシフト割り当てへの影響を取得する。snapshotが更新済みなら`stale`を返す |
| `api.staff.mutations.changeOrganizationShopStaffMemberships` | mutation | 希望する人物ID一覧、fingerprint、解除preview、request IDを検証し、1店舗の所属スタッフを一括変更する |
| `api.shop.mutations.updateShopSettings` | mutation | 店舗詳細の編集Dialogから、店舗名、希望シフトの提出方法、定休日を一括更新する |
| `api.organization.mutations.deleteShop` | mutation | 組織所属と確認IDを再検証し、店舗を論理削除して永続cleanup jobを開始する |
| `api.setup.mutations.setupShopAndManager` | mutation | 初回セットアップ時に店舗を作成する |

## 仕様メモ

- 希望シフトの提出方法は `時間指定` / `日ごと` / `勤務区分` から選ぶ。
- `時間指定` は提出方法の中にシフト開始/終了時間を持つ。
- `日ごと` はスタッフが出勤可能日だけを選び、時間入力は持たない。
- `勤務区分` は区分名と時間帯を最大4件まで定義し、保存時に開始時間が早い順、同じ開始時間なら終了時間が早い順へ並べてから募集作成時点の設定が募集に保存される。
- 店舗詳細の基本情報は読み取り用の一覧として表示する。見出し右の鉛筆アイコン付き`編集する`ボタンから`ShopForm`を開き、表示中の店舗IDを明示して店舗名、希望シフトの集め方と勤務時間、定休日を1回のmutationで一括更新する。
- Dashboardと管理画面から店舗詳細へ進むときは同じ`org`を維持する。  店舗詳細の戻る操作はbrowser historyを使い、旧`returnTo` searchは受け付けない。
- 店舗詳細のスタッフ欄は、対象店舗に所属する人物単位の件数だけを初期表示し、`スタッフ一覧を見る`から同じカード内へ全件を展開する。
- 対象店舗にスタッフとして所属するactive管理者が0人の場合は、スタッフ欄に店舗管理通知が送信されないことと、必要なら管理者をこの店舗の所属スタッフに追加する推奨案内を表示する。
  閲覧専用の場合も案内は表示する。
  店舗管理通知には、スタッフ参加申請digest、シフト確定催促、店舗登録後の本番募集案内、通知不達digestを含む。
- スタッフ欄の見出し右にある`所属スタッフを変更する`（所属スタッフが0人の場合は`所属スタッフを追加する`）から、組織に登録済みの人物をチェックボックスで選ぶ。管理者かどうかと、ほかの店舗への所属は確認用に表示するだけで、この操作では変更しない。店舗設定が閲覧専用の場合は導線も無効にする。
- Dialogを開いた時点の所属snapshotを編集対象として固定する。追加だけならそのまま保存し、追加した人物が組織共通のLINE連携を持たない場合だけ連携案内を予約する。
- 初期状態で所属していた人物のチェックを外した場合だけ、その人物の行を解除状態にし、`店舗から外す`と表示する。解除対象が1人以上いる間は、今日以降のシフト割り当てから削除され、シフト通知が届かなくなることをDialog下部の共通警告に1回だけ表示する。再びチェックすると解除表示を消し、解除対象が0人になった時点で共通警告も消す。解除対象ごとの件数と合計は表示しない。
- 解除対象がある場合は、現在の選択に対応する解除previewを自動で取得する。取得中、`tooMany`、`stale`では確定を無効にし、古いpreviewを変更処理へ渡さない。Dialog内の確認表示へ切り替えず、フッターは常に「キャンセル」と「変更する」を表示し、追加と解除のどちらも「変更する」を1回押すと確定する。
- 所属を外すと対象店舗のスタッフとしてのアクセス、互換用の店舗LINE投影、未送信通知を終了し、今日以降のシフト割り当てを削除する。
  組織共通のLINE連携、組織への登録、管理者権限、ほかの店舗への所属、過去のシフト記録は保持する。
- `active`管理者も個別に店舗から外せる。
  この変更で管理者権限と組織人物は維持し、`organizationMembers`に基づく管理画面アクセスは変更しない。
- 変更後にこの店舗へ所属するactive管理者が0人になる場合は、店舗管理通知が送信されなくなることを変更Dialog内で警告する。
  警告は変更を拒否せず、保存後は店舗詳細の案内で同じ状態を示す。
- 所属スタッフを全員外す変更では、変更後に店舗のスタッフが0名になることを変更Dialog内で警告する。
- 所属snapshotまたは解除対象のシフトが変わった場合は古い内容を保存しない。通信結果が不明な同一操作だけは、同じ入力とrequest IDで再試行する。
- 店舗詳細のスタッフ一覧は、`getSettings.people.shopIds`を対象店舗IDで絞り込む。同名店舗を店舗名で誤判定せず、人物単位の一覧件数と表示件数を一致させる。行を押すと同じ`org`のスタッフ詳細へ進む。
- 店舗削除は物理削除ではなく、受付時に店舗名を保持したまま`shops.isDeleted = true`にする。最後の未削除店舗は削除できない。
- 店舗削除に成功したら、削除対象とは異なる現在contextの店舗を優先し、なければ同じ組織の先頭の未削除店舗へ復帰する。復帰先URLへ削除済み店舗IDを残さない。
- `/manage/shops/<shopId>`ではURLの`org`が組織scopeの正本であり、`shopId`がその組織に属することをQueryとMutationの双方で再検証する。`selectedShopAtom`、先頭店舗、旧`shopMembers` fallbackをこの認可判断に使わない。戻る操作とスタッフ詳細へのdrilldownは同じ`org`を維持する。
- 外部から無効な店舗IDを明示した保護routeは、自動で別店舗へ読み替えず、認証境界でfail closedにする。
- 後続の永続cleanup jobは、対象店舗の`staffs`にある氏名、メールアドレス、正規化メールを保持したまま論理削除し、`staffLineAccounts`のLINE IDだけを削除済みの値へ置き換える。組織人物の`organizationPersonLineLinks`は変更しない。店舗用session、magic link、LINE連携token、法務同意token、登録リンクを失効し、未送信通知を停止する。
- 店舗削除では`users`、`organizationPeople`、`organizationMembers`を変更しない。対象店舗のユーザーは組織人物として残る。
- 店舗名、スタッフの氏名とメールアドレス、rate limit、自由入力欄、送信済みメール、LINEはDBに残るため、この導線を個人データの消去や匿名化とは扱わない。詳細は`doc/features/data-deletion.md`を参照する。
- 保持契約はConvex Function TestとScenario Testで検証する。E2Eはworker専用scenario上でUI追加した2店舗目だけを削除し、実browserの復帰導線を検証する。Clerk userや組織全体を破壊するE2Eは追加しない。
- 複数店舗と既存人物の複数店舗所属は通常の画面から利用できる。  public mutationは認証、組織境界、管理者状態、契約状態、プラン上限を再確認し、E2Eは専用Preview deploymentでこの契約を検証する。
