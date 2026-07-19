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
店舗別の操作は、「店舗設定」見出し直下の店舗セレクトとURLの`shop`で選択した店舗だけを対象にする。
Hero直下にはユーザー情報とグループ内全店舗を表示し、管理者権限はユーザー情報カード内にまとめる。未所属店舗を明示し、各店舗行から対象店舗のDashboardへ遷移できる。グループからの削除は、店舗別タブより後のページ末尾に表示する。

## URLと遷移

```text
/users/<personId>?shop=<shopId>&tab=<tab>&returnTo=<dashboard|settings|shopDetail>&returnShop=<shopId>&users=<count>
```

`tab`は`notification`、`line`、`settings`を受け付ける。
未指定、不正な値、旧`information`は`notification`として扱う。
店舗を切り替えた場合は`shop`を更新し、同じ人物とタブを維持する。
タブは画面内の状態を先に切り替えてからURLの`tab`へ同期し、切り替え前のスクロール位置を維持する。ブラウザの戻る・進むで`tab`が変わった場合は、画面内の状態もURLへ追従する。
Dashboardとグループ設定のユーザー一覧は、初期表示を10件とし、「もっと見る」で増やした表示件数を`users`へ10件単位で保持する。
ユーザー詳細へ遷移するときも`users`を引き継ぐ。
戻る操作は遷移元を`returnTo`で判定する。Dashboardまたはグループ設定へは現在表示中の`shop`と表示件数を引き継ぎ、`focus`に指定した直前のユーザー付近へスクロールする。店舗詳細から遷移した場合は、ユーザー詳細内で表示店舗を切り替えても`returnShop`に保持した出発元店舗へ戻る。

Dashboardの移行済みスタッフは、`getDashboardStaffs`が返す`organizationPersonId`を`personId`に使う。
Widen期間中に`organizationPersonId`が未設定のスタッフだけは、操作不能にせず旧スタッフ詳細モーダルを暫定表示する。
グループ設定は一覧の人物IDをそのまま`personId`に使う。

## 画面一覧

| 画面 | 役割 |
|---|---|
| `/dashboard?shop=<shopId>&users=<count>&focus=<personId>` | 店舗スタッフ一覧から、移行済みスタッフのユーザー詳細ページへ遷移する。表示件数と復帰位置を保持する |
| `/settings?shop=<shopId>&tab=people&users=<count>&focus=<personId>` | 店舗未所属者を含むグループ人物一覧から、ユーザー詳細ページへ遷移する。表示件数と復帰位置を保持する |
| `/users/<personId>?shop=<shopId>&tab=notification` | 選択店舗の通知再送と通知履歴を扱う |
| `/users/<personId>?shop=<shopId>&tab=line` | 選択店舗のLINE連携状態、連携リンク、個別連携依頼を扱う |
| `/users/<personId>?shop=<shopId>&tab=settings` | 選択店舗のシフト対象設定と店舗所属解除を扱う |

## 表示状態

- 読み込み中はページ見出しと本文のSkeletonを表示する。
- 存在しない人物、削除済み人物、別グループの人物には同じ「ユーザーを表示できません」を表示し、存在や所属を区別して漏らさない。
- 選択店舗に所属していない人物も、グループ共通情報は表示する。
- 未所属店舗では追加ボタンを表示し、追加成功後は同じ店舗のLINE連携タブへ移動する。
- 店舗未所属の管理者もユーザー詳細ページを持ち、店舗別操作だけを表示しない。
- 閲覧専用または契約制限中は、サーバーが返す操作可否と理由を表示する。mutationは実行時にも権限、グループ、店舗、対象人物を再検証する。
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
- `src/routes/_auth/users.$personId.tsx`：人物IDと`shop`、`tab`、戻り先、出発元店舗、一覧表示件数を受け取るURL境界。
- `src/pages/user-detail/`：詳細QueryとLoading、Not Found、正常表示の分岐。
- `src/components/features/UserDetail/`：共通情報カード、店舗切り替え、3タブ、スクロールを維持するURL同期、編集と確認操作。
- `src/components/features/StaffNotificationHistory/`：ユーザー詳細と旧スタッフ詳細フォールバックから利用する通知履歴。
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
| `api.organization.mutations.removeManagerRole` | `authenticatedMutation` | 店舗スタッフ所属を維持し、グループの管理者権限だけを外す |
| `api.organization.mutations.removePersonFromShop` | `authenticatedMutation` | 指定店舗のスタッフ所属とアクセスだけを終了する |
| `api.organization.mutations.removePersonFromOrganization` | `authenticatedMutation` | グループ内の全所属とアクセスを終了する |
| `api.staff.mutations.addOrganizationPersonToShop` | `managerMutation` | 同じグループの既存人物を選択店舗へスタッフとして追加する |
| `api.staff.mutations.setShiftExclusion` | `managerMutation` | 選択店舗のスタッフをシフト対象または対象外に切り替える |
| `api.line.mutations.generateLinkToken` | `managerMutation` | 選択店舗のスタッフ向けLINE連携リンクを発行する |
| `api.line.mutations.sendInvite` | `managerMutation` | 選択店舗のスタッフへLINE連携案内を送る |
| `api.staff.mutations.sendOpenRecruitmentNotifications` | `managerMutation` | 選択店舗のスタッフへ現在送れる募集通知を再送する |
| `api.staff.mutations.sendCurrentShiftNotification` | `managerMutation` | 選択店舗のスタッフへ現在の確定シフト通知を再送する |
| `api.notificationOutbox.queries.listStaffNotificationHistory` | `managerQuery` | 選択店舗のスタッフへ送った通知履歴を最小DTOでページングする |
