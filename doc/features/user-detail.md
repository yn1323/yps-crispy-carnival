# ユーザー詳細

## 機能説明

グループ内の人物を表す`organizationPeople`を正本として、共通プロフィール、管理者権限、店舗ごとのスタッフ設定、通知、LINE連携を一つのページで扱う。
Dashboardのスタッフ一覧とグループ設定のユーザー一覧は、同じユーザー詳細ページへ遷移する。

## 情報のスコープ

| 情報 | スコープ | 保存先 |
|---|---|---|
| 氏名とメールアドレス | グループ共通 | `organizationPeople` |
| 管理者権限 | グループ共通 | `organizationMembers` |
| シフト対象設定 | 店舗別 | `staffs` |
| LINE連携 | 店舗別 | `staffLineAccounts` |
| 通知操作と通知履歴 | 店舗別 | 対象`staffId`に紐づく募集、Outbox、通知履歴 |

氏名とメールアドレスの更新は、同じ人物に紐づく有効な全店舗のスタッフ行へ同期する。
ページ本文は、基本情報を開くコンパクトな行、所属店舗一覧、ユーザー削除カードで構成する。
所属店舗一覧には有効な`staffs`がある店舗だけを表示し、未所属店舗は表示しない。
基本情報の行から、共通プロフィールと管理者権限を扱うレスポンシブDialogを開く。
グループからの削除は、所属店舗一覧の下にあるユーザー削除カードから確認表示を開く。
「店舗を追加」から、稼働中かつ未所属の店舗だけを表示する追加Dialogを開く。
所属店舗の行から、URLの`shop`で選択した店舗を扱う店舗Dialogを開く。
店舗Dialogは、LINE連携、通知、店舗操作をタブに分けず縦に並べる。

## URLと遷移

```text
/users/<personId>?shop=<shopId>&panel=<basic|addShop|shop>&returnTo=<dashboard|settings|shopDetail>&returnShop=<shopId>&returnShopTo=dashboard&users=<count>
```

`panel`は開いているDialogを表す。
`basic`は基本情報、`addShop`は店舗追加、`shop`は店舗詳細を開く。
`panel=shop`では`shop`が対象店舗を表し、所属店舗の行を押すと両方をURLへ反映する。
`panel`を省略したURLはDialogを開かないページ本体を表す。
Dialogを閉じると`panel`をURLから外し、人物ID、店舗、戻り先、一覧表示件数は維持する。
直接URLを開いた場合も、`panel`と`shop`にDialogの状態を追従させる。
旧`tab`検索パラメータは受け付けず、ユーザー詳細の状態管理には使わない。
Dashboardとグループ設定のユーザー一覧は、初期表示を10件とし、「もっと見る」で増やした表示件数を`users`へ10件単位で保持する。
ユーザー詳細へ遷移するときも`users`を引き継ぐ。
戻る操作は遷移元を`returnTo`で判定する。
Dashboardまたはグループ設定へは現在の`shop`と表示件数を引き継ぎ、`focus`に指定した直前のユーザー付近へスクロールする。
店舗詳細から遷移した場合は、店舗Dialogで別店舗を開いても`returnShop`に保持した出発元店舗へ戻る。Dashboard起点の場合は`returnShopTo=dashboard`も引き継ぎ、店舗詳細からDashboardへ戻れる状態を維持する。

Dashboardの移行済みスタッフは、`getDashboardStaffs`が返す`organizationPersonId`を`personId`に使う。
Widen期間中に`organizationPersonId`が未設定のスタッフだけは、操作不能にせず旧スタッフ詳細モーダルを暫定表示する。
グループ設定は一覧の人物IDをそのまま`personId`に使う。

## 画面一覧

| 画面 | 役割 |
|---|---|
| `/dashboard?shop=<shopId>&users=<count>&focus=<personId>` | 店舗スタッフ一覧から、移行済みスタッフのユーザー詳細ページへ遷移する。表示件数と復帰位置を保持する |
| `/settings?shop=<shopId>&tab=people&users=<count>&focus=<personId>` | 店舗未所属者を含むグループ人物一覧から、ユーザー詳細ページへ遷移する。表示件数と復帰位置を保持する |
| `/users/<personId>?shop=<shopId>` | 基本情報の入口、所属店舗、ユーザー削除カードを表示する |
| `/users/<personId>?shop=<shopId>&panel=basic` | 基本情報と管理者権限をDialogで扱う |
| `/users/<personId>?shop=<shopId>&panel=addShop` | 稼働中かつ未所属の店舗を選び、スタッフ所属を追加する |
| `/users/<personId>?shop=<shopId>&panel=shop` | 選択店舗のLINE連携、通知、店舗操作を一つのDialogで扱う |

## 表示状態

- 読み込み中はページ見出しと本文のSkeletonを表示する。
- 存在しない人物、削除済み人物、別グループの人物には同じ「ユーザーを表示できません」を表示し、存在や所属を区別して漏らさない。
- 基本情報Dialog、店舗追加Dialog、店舗Dialogは、PCではモーダル、SPではフルスクリーンで表示する。
- 所属店舗一覧には未所属店舗を表示しない。
- 店舗追加Dialogには、`active`で未所属の店舗だけを表示する。
- `archived`、`planSuspended`、削除済み、所属済みの店舗は追加候補に含めない。
- 店舗追加後は詳細Queryの更新に従って所属店舗一覧と追加候補を更新する。
- 店舗未所属の管理者もユーザー詳細ページを持ち、基本情報と店舗追加の導線を表示する。
- 店舗DialogではLINE連携、通知送信と履歴、シフト対象設定、店舗所属解除を縦に表示する。
- 閲覧専用または契約制限中は、サーバーが返す操作可否と理由を表示する。
- 管理者権限解除と店舗所属解除は各Dialog内、グループ削除はページ下部の確認表示から実行し、最後の有効管理者などの制約に違反した場合はサーバーのエラーを表示する。
- mutationは実行時に権限、グループ、店舗、対象人物を再検証し、フロントエンドの表示状態だけを認可判断に使わない。
- 個別通知の再送は、募集通知と現在の確定シフト通知の両方でactor単位とグループ単位の短時間・日次quotaを適用する。client request IDはquota keyに使わず、別managerへ切り替えてもグループquotaを共有する。
- 自分自身の管理者権限解除またはグループ削除後は、失効した店舗をURLに残さずダッシュボードへ戻る。

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
- `src/routes/_auth/users.$personId.tsx`：人物IDと`shop`、`panel`、戻り先、出発元店舗、一覧表示件数を受け取るURL境界。
- `src/pages/user-detail/`：詳細QueryとLoading、Not Found、正常表示の分岐。
- `src/components/features/UserDetail/`：基本情報の入口、所属店舗一覧、店舗追加、基本情報Dialog、店舗Dialog、URL同期、編集と確認操作。
- `src/components/features/StaffNotificationHistory/`：店舗Dialogと旧スタッフ詳細フォールバックから利用する通知履歴。
- `src/components/features/Dashboard/StaffManagement/`と`StaffRoster/`：店舗スタッフ一覧からの遷移と未移行スタッフの暫定フォールバック。
- `src/components/features/OrganizationSettings/`：グループ人物一覧からの遷移。
- `src/hooks/useScrollToListItem.ts`：一覧へ戻ったときに直前のユーザー行へスクロールする。
- `src/lib/userListSearch.ts`：一覧表示件数と復帰対象のQueryStringを正規化する。

## API一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.organization.userDetailQueries.getUserDetail` | `managerQuery` | URLの人物が選択店舗と同じグループに属することを確認し、共通プロフィール、管理者権限、操作可否、グループ内店舗、店舗別所属を返す |
| `api.dashboard.queries.getDashboardStaffs` | `managerQuery` | 店舗スタッフと対応する`organizationPersonId`をページングして返す |
| `api.organization.mutations.updatePersonProfile` | `authenticatedMutation` | グループ共通プロフィールを更新し、有効な店舗スタッフ行へ同期する |
| `api.organizationInvitation.mutations.createForPerson` | `authenticatedMutation` | 人物IDと現在のメールアドレスへ固定して管理者招待を発行または再送する |
| `api.organization.mutations.removeManagerRole` | `authenticatedMutation` | 人物とシフト記録を維持し、グループの管理者権限だけを外す。店舗所属がなければ管理アクセスを終了する |
| `api.organization.mutations.removePersonFromShop` | `authenticatedMutation` | 指定店舗のスタッフ所属とアクセスだけを終了する |
| `api.organization.mutations.removePersonFromOrganization` | `authenticatedMutation` | グループ内の全所属とアクセスを終了する |
| `api.staff.mutations.addOrganizationPersonToShop` | `managerMutation` | 同じグループの既存人物を選択店舗へスタッフとして追加する |
| `api.staff.mutations.setShiftExclusion` | `managerMutation` | 選択店舗のスタッフをシフト対象または対象外に切り替える |
| `api.line.mutations.generateLinkToken` | `managerMutation` | 選択店舗のスタッフ向けLINE連携リンクを発行する |
| `api.line.mutations.sendInvite` | `managerMutation` | 選択店舗のスタッフへLINE連携案内を送る |
| `api.staff.mutations.sendOpenRecruitmentNotifications` | `managerMutation` | 選択店舗のスタッフへ現在送れる募集通知を、actor・グループ単位の再送quota内で予約する |
| `api.staff.mutations.sendCurrentShiftNotification` | `managerMutation` | 選択店舗のスタッフへ現在の確定シフト通知を、actor・グループ単位の再送quota内で予約する |
| `api.notificationOutbox.queries.listStaffNotificationHistory` | `managerQuery` | 選択店舗のスタッフへ送った通知履歴を最小DTOでページングする |
