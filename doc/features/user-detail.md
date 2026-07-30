# スタッフ詳細

## 機能説明

グループ内の人物を表す`organizationPeople`を正本として、共通プロフィールと管理者権限はスタッフ詳細ページ、店舗ごとのスタッフ設定、通知、LINE連携は店舗別設定ページで扱う。
Dashboardのスタッフ一覧とグループ設定のユーザー一覧は、同じスタッフ詳細ページへ遷移する。

## 情報のスコープ

| 情報 | スコープ | 保存先 |
|---|---|---|
| 氏名とメールアドレス | グループ共通 | `organizationPeople` |
| 管理者権限 | グループ共通 | `organizationMembers` |
| シフト対象設定 | 店舗別 | `staffs` |
| LINE連携 | 店舗別 | `staffLineAccounts` |
| 通知操作と通知履歴 | 店舗別 | 対象`staffId`に紐づく募集、Outbox、通知履歴 |

氏名とメールアドレスの更新は、同じ人物に紐づく有効な全店舗のスタッフ行へ同期する。
ページ本文は、スタッフ情報を開くコンパクトな行、所属店舗一覧、ユーザー削除カードで構成する。
所属店舗一覧には有効な`staffs`がある店舗だけを表示し、未所属店舗は表示しない。
スタッフ情報の行から、共通プロフィールと管理者権限を扱うレスポンシブDialogを開く。
Dialog下部は左に「キャンセル」、右に「変更を保存」を配置する。
`FEATURE_MANAGER_INVITATION`が閉じている間も氏名とメールアドレスの編集は残し、管理者招待・交代・権限解除のセクションと招待中Badgeだけを非表示にする。
グループからの削除は、所属店舗一覧の下にあるユーザー削除カードから確認Dialogを開く。
`FEATURE_SHOP_ADDITION`が公開中なら、「店舗を追加」から稼働中かつ未所属の店舗だけを表示する追加Dialogを開く。
閉じている間はボタン、空状態の操作案内、追加Dialogを描画せず、`panel=addShop`の直指定や古いcallbackからも追加処理を始めない。
所属店舗の行から、対象店舗をパスの`targetShopId`で表す店舗別設定ページへ遷移する。
店舗別設定ページは`<店舗名>：<スタッフ名>さん`を見出しとし、LINE連携、通知、シフト対象設定をタブに分けず縦に並べる。
店舗所属解除は`FEATURE_SHOP_ADDITION`が公開中の場合だけ表示する。

## URLと遷移

```text
/users/<personId>?shop=<sourceShopId>&panel=<basic|addShop>&returnTo=<dashboard|settings|shopDetail>&returnShop=<shopId>&returnShopTo=dashboard&users=<count>
/users/<personId>/shops/<targetShopId>?shop=<sourceShopId>&returnTo=<dashboard|settings|shopDetail>&returnShop=<shopId>&returnShopTo=dashboard&users=<count>
```

スタッフ詳細の`panel`は開いているDialogを表し、`basic`はスタッフ情報、`addShop`は店舗追加を開く。
`panel`を省略したスタッフ詳細URLはDialogを開かないページ本体を表す。
Dialogを閉じると`panel`をURLから外し、人物ID、店舗、戻り先、一覧表示件数は維持する。
直接URLを開いた場合も、`panel`に基本情報または店舗追加Dialogの状態を追従させる。
ブラウザバックまたは画面内の閉じる操作でDialogを閉じた後は、履歴上の`panel`も除去し、別画面から戻ってもDialogを再表示しない。
旧`tab`検索パラメータは受け付けず、スタッフ詳細の状態管理には使わない。

検索パラメータの`shop`はスタッフ詳細へ来たときの選択店舗を表し、`AuthGuard`、`selectedShopAtom`、ヘッダーの店舗選択と同期する。
所属店舗を押しても`shop`は変更せず、店舗別設定の取得・更新対象はパスの`targetShopId`として各APIへ明示的に渡す。
ブラウザ上で指定された`personId`、`targetShopId`、`staffId`は認可情報として扱わない。

Dashboardとグループ設定のユーザー一覧は、初期表示を10件とし、「もっと見る」で増やした表示件数を`users`へ10件単位で保持する。
スタッフ詳細へ遷移するときも`users`を引き継ぐ。
店舗別設定への遷移は通常の履歴を追加し、ブラウザバックで元のスタッフ詳細へ戻れるようにする。
店舗別設定の見出しにある戻る操作も、`shop`、`returnTo`、`returnShop`、`returnShopTo`、`users`を維持して元のスタッフ詳細へ戻る。
店舗所属解除後は削除済みの店舗別設定を表示し続けず、同じ検索条件のスタッフ詳細へ戻る。
スタッフ詳細からの戻る操作は遷移元を`returnTo`で判定する。
Dashboardまたはグループ設定へは現在の`shop`と表示件数を引き継ぎ、`focus`に指定した直前のユーザー付近へスクロールする。
店舗詳細から遷移した場合は、別店舗の店舗別設定を開いても`returnShop`に保持した出発元店舗へ戻る。
Dashboard起点の場合は`returnShopTo=dashboard`も引き継ぎ、店舗詳細からDashboardへ戻れる状態を維持する。

Dashboardの移行済みスタッフは、`getDashboardStaffs`が返す`organizationPersonId`を`personId`に使う。
Widen期間中に`organizationPersonId`が未設定のスタッフだけは、操作不能にせず旧スタッフ詳細モーダルを暫定表示する。
グループ設定は一覧の人物IDをそのまま`personId`に使う。

## 画面一覧

| 画面 | 役割 |
|---|---|
| `/dashboard?shop=<shopId>&users=<count>&focus=<personId>` | 店舗スタッフ一覧から、移行済みスタッフのスタッフ詳細ページへ遷移する。表示件数と復帰位置を保持する |
| `/settings?shop=<shopId>&tab=people&users=<count>&focus=<personId>` | 店舗未所属者を含むグループ人物一覧から、スタッフ詳細ページへ遷移する。表示件数と復帰位置を保持する |
| `/users/<personId>?shop=<shopId>` | スタッフ情報の入口、所属店舗、ユーザー削除カードを表示する |
| `/users/<personId>?shop=<shopId>&panel=basic` | スタッフ情報と管理者権限をDialogで扱う |
| `/users/<personId>?shop=<shopId>&panel=addShop` | 稼働中かつ未所属の店舗を選び、スタッフ所属を追加する |
| `/users/<personId>/shops/<targetShopId>?shop=<sourceShopId>` | 対象店舗のLINE連携、通知、シフト対象設定、店舗所属解除を専用ページで扱う。`shop`は出発元店舗として維持する |

## 表示状態

- 読み込み中はページ見出しと本文のSkeletonを表示する。
- 存在しない人物、削除済み人物、別グループの人物には同じ「ユーザーを表示できません」を表示し、存在や所属を区別して漏らさない。
- 対象店舗への管理アクセスがない、人物と店舗所属が一致しない、所属または店舗が削除済みの場合も、存在を区別しない最小情報のEmpty状態へ寄せる。
- スタッフ情報Dialogと店舗追加Dialogは、PCではモーダル、SPではフルスクリーンで表示する。
- 店舗別設定はPCとSPのどちらも通常のページとして表示し、Dialog用の固定高、入れ子スクロール、全画面モーダル用レイアウトを使わない。
- 所属店舗一覧には未所属店舗を表示しない。
- `FEATURE_SHOP_ADDITION`が公開中の場合だけ店舗追加のボタンとDialogを表示し、Dialogには`active`で未所属の店舗だけを表示する。
- `archived`、`planSuspended`、削除済み、所属済みの店舗は追加候補に含めない。
- 店舗追加後は詳細Queryの更新に従って所属店舗一覧と追加候補を更新する。
- 店舗未所属の管理者もスタッフ詳細ページを持つ。店舗追加の導線は`FEATURE_SHOP_ADDITION`が公開中の場合だけ表示する。
- 店舗別設定ページではLINE連携、通知送信と履歴、シフト対象設定を縦に表示し、`FEATURE_SHOP_ADDITION`が公開中の場合だけ店舗所属解除も表示する。
- 停止中の店舗、閲覧専用または契約制限中は、サーバーが返す操作可否と理由を表示し、更新操作を無効にする。
- API取得に失敗した場合はページのエラー状態へ寄せ、直前の別店舗データを表示しない。
- 通知、LINE案内、シフト対象設定は個別に処理中状態を表示し、同じ操作の重複送信を防ぐ。シフト対象設定は画面を先に切り替え、失敗時に元へ戻し、操作直後から最低1000msは再操作を無効にする。
- LINE連携済みの場合は店舗ごとの設定案内だけを表示し、スタッフ招待の案内と連携操作を表示しない。
- LINE連携URLの発行中はSkeletonを表示し、成功後は対象ユーザー専用のURLとQRコードをページ内へ表示する。失敗時は既存のエラー通知を表示する。
- 通知対象の募集と確定シフトは、Dashboardと同じ色・状態表現で期間、締切または確定日、提出人数を表示する。確定シフトは終了日が今日以降の現在分と将来分を表示して再送でき、過去分は表示しない。
- 管理者権限解除はスタッフ情報Dialog、店舗所属解除は店舗別設定ページの確認Dialog、グループ削除はページ下部の削除カードから開く確認Dialogで実行し、最後の有効管理者などの制約に違反した場合はサーバーのエラーを表示する。
- `managerInvitationState.kind`が`hidden`のときは管理者権限セクションを描画せず、開いていた招待・権限解除の確認も閉じ、古いcallbackからmutationを実行しない。
- 個別通知の再送は、募集通知と終了日が今日以降の確定シフト通知の両方でactor単位とグループ単位の短時間・日次quotaを適用する。client request IDはquota keyに使わず、別managerへ切り替えてもグループquotaを共有する。
- 自分自身の管理者権限解除またはグループ削除後は、失効した店舗をURLに残さずダッシュボードへ戻る。

## 認可と安全性

- Convexは認証identityから有効な管理アクセスを解決し、店舗別設定のQueryでは人物に対象店舗の有効な所属があることを応答前に検証し、更新時は対象店舗への書込権限を検証する。
- 店舗別APIは、対象スタッフと`targetShopId`の所属関係、人物との対応、削除状態、店舗状態をサーバー側で再検証する。
- 権限のない店舗、不正な人物・店舗・スタッフの組み合わせ、削除済み対象は拒否するか、存在を区別できない最小情報のEmpty状態へ寄せる。
- 所属店舗一覧から選ばれたことや、フロントエンドが保持する`selectedShopAtom`は認可根拠にしない。
- 通知とLINE案内は既存のrate limit、再送quota、Outboxの冪等性と配送直前の再検証を維持する。
- メールアドレス、LINE token、連携URL、通知本文を新しいログへ出力しない。

## 関連ファイル

### バックエンド

- `convex/schema.ts`：`organizationPeople`、`organizationMembers`、`staffs`、`staffLineAccounts`の定義。
- `convex/organization/userDetailQueries.ts`：人物、管理者権限、操作可否、グループ内店舗、店舗別所属を返す詳細Query。
- `convex/organization/personProfile.ts`：グループ共通プロフィールと有効な店舗スタッフ行の同期。
- `convex/organization/mutations.ts`：プロフィール更新、管理者権限解除、店舗所属解除、グループからの人物削除。
- `convex/staff/mutations.ts`：既存人物の店舗追加、店舗別のシフト対象設定と通知再送。
- `convex/line/`：店舗スタッフ単位のLINE連携状態、連携リンク、個別連携依頼。
- `convex/notificationOutbox/queries.ts`：店舗スタッフ単位の通知履歴。
- `convex/dashboard/queries.ts`：DashboardスタッフDTOへの`organizationPersonId`の付与。

### フロントエンド

- `src/routes/_auth/dashboard.tsx`と`settings.tsx`：ユーザー一覧の`users`と`focus`を受け取るURL境界。
- `src/routes/_auth/users.$personId.tsx`：人物IDと`shop`、スタッフ情報・店舗追加の`panel`、戻り先、出発元店舗、一覧表示件数を受け取るURL境界。
- `src/routes/_auth/users.$personId_.shops.$targetShopId.tsx`：対象店舗IDと、出発元店舗・戻り先情報を受け取る店舗別設定のURL境界。
- `src/pages/user-detail/`：詳細QueryとLoading、Not Found、正常表示の分岐。
- `src/pages/user-shop-detail/`：`targetShopId`を明示した詳細QueryとLoading、Empty、正常表示の分岐。
- `src/components/features/UserDetail/`：スタッフ情報の入口、所属店舗一覧、店舗追加、スタッフ情報Dialog、URL同期、編集と確認操作。
- `src/components/features/UserShopDetail/`：対象店舗のAPI接続と状態を所有し、LINE連携、通知、シフト対象設定、店舗所属解除をViewへ渡す。
- `src/components/features/StaffNotificationHistory/`：店舗別設定ページと旧スタッフ詳細フォールバックから利用する通知履歴。
- `src/components/features/Dashboard/StaffManagement/`と`StaffRoster/`：店舗スタッフ一覧からの遷移と未移行スタッフの暫定フォールバック。
- `src/components/features/OrganizationSettings/`：グループ人物一覧からの遷移。
- `src/hooks/useScrollToListItem.ts`：一覧へ戻ったときに直前のユーザー行へスクロールする。
- `src/lib/userListSearch.ts`：一覧表示件数と復帰対象のQueryStringを正規化する。

## API一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.organization.userDetailQueries.getUserDetail` | `managerQuery` | URLの人物が対象店舗と同じグループに属することを確認する。店舗別設定では対象店舗への有効な所属も必須とし、共通プロフィール、管理者権限、操作可否、グループ内店舗、店舗別所属を返す |
| `api.dashboard.queries.getDashboardStaffs` | `managerQuery` | 店舗スタッフと対応する`organizationPersonId`をページングして返す |
| `api.dashboard.queries.getDashboardRecruitments` | `managerQuery` | `targetShopId`で指定した対象店舗の募集中シフトを取得する |
| `api.dashboard.queries.getDashboardCurrentRecruitments` | `managerQuery` | `targetShopId`で指定した対象店舗の終了日が今日以降の確定シフトを取得する |
| `api.organization.mutations.updatePersonProfile` | `authenticatedMutation` | グループ共通プロフィールを更新し、有効な店舗スタッフ行へ同期する |
| `api.organizationInvitation.mutations.createForPerson` | `authenticatedMutation` | 公開中は人物IDと現在のメールアドレスへ固定して管理者招待を発行または再送し、ダークローンチ中は拒否する |
| `api.organization.mutations.removeManagerRole` | `authenticatedMutation` | 人物とシフト記録を維持し、グループの管理者権限だけを外す。店舗所属がなければ管理アクセスを終了する |
| `api.organization.mutations.removePersonFromShop` | `authenticatedMutation` | `targetShopId`で指定した店舗のスタッフ所属とアクセスだけを終了する |
| `api.organization.mutations.removePersonFromOrganization` | `authenticatedMutation` | グループ内の全所属とアクセスを終了する |
| `api.staff.mutations.addOrganizationPersonToShop` | `managerMutation` | 同じグループの既存人物を選択店舗へスタッフとして追加する |
| `api.staff.mutations.setShiftExclusion` | `managerMutation` | `targetShopId`で指定した店舗のスタッフをシフト対象または対象外に切り替える |
| `api.line.mutations.generateLinkToken` | `managerMutation` | `targetShopId`で指定した店舗のスタッフ向けLINE連携リンクを発行する |
| `api.line.mutations.sendInvite` | `managerMutation` | `targetShopId`で指定した店舗のスタッフへLINE連携案内を送る |
| `api.staff.mutations.sendOpenRecruitmentNotifications` | `managerMutation` | `targetShopId`で指定した店舗のスタッフへ現在送れる募集通知を、actor・グループ単位の再送quota内で予約する |
| `api.staff.mutations.sendCurrentShiftNotification` | `managerMutation` | `targetShopId`で指定した店舗のスタッフへ終了日が今日以降の確定シフト通知を、actor・グループ単位の再送quota内で予約する |
| `api.notificationOutbox.queries.listStaffNotificationHistory` | `managerQuery` | `targetShopId`で指定した店舗のスタッフへ送った通知履歴を最小DTOでページングする |
