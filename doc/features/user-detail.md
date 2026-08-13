# スタッフ詳細

## 機能説明

組織内の人物を表す`organizationPeople`を正本として、共通プロフィールとLINE連携状態はスタッフ詳細ページ、管理者の変更操作は管理者設定ページ、店舗ごとのシフト設定と通知は店舗別設定ページで扱う。
Dashboardのスタッフ一覧と組織設定のユーザー一覧は、同じスタッフ詳細ページへ遷移する。

## 情報のスコープ

| 情報 | スコープ | 保存先 |
|---|---|---|
| 氏名 | 組織共通 | `organizationPeople` |
| シフト連絡先メールアドレス | 組織共通 | `organizationPeople`と、同じ人物に紐づく未削除`staffs` |
| ログイン方法 | 利用者全体 | Clerk UserのEmailAddress、パスワード、ExternalAccount。この画面では変更しない |
| 管理者権限 | 組織共通 | `organizationMembers` |
| シフト対象設定 | 店舗別 | `staffs` |
| LINE連携 | 組織人物共通 | `organizationPersonLineLinks`と`lineProviderUsers`。段階切替中だけ`staffLineAccounts`を互換投影として使う |
| 通知操作と通知履歴 | 店舗別 | 対象`staffId`に紐づく募集、Outbox、通知履歴 |

氏名とシフト連絡先の更新は、アカウント連携の有無にかかわらず、同じ人物に紐づく同じ組織の有効な全店舗スタッフ行へ同期する。  権限を持つ管理者は本人と他者のどちらも編集できる。

シフト連絡先の変更は、Clerkのログイン方法、`users.email`の初期snapshot、別組織の人物、組織の請求先を変更しない。
ページ本文は、スタッフ情報を開くコンパクトな行、所属店舗一覧、ユーザー削除カードで構成する。
所属店舗一覧には有効な`staffs`がある店舗だけを表示し、未所属店舗は表示しない。
スタッフ情報の行から共通プロフィールを扱うレスポンシブDialogを開き、管理者状態の表示からは専用の管理者設定へ進む。
Dialog下部には「キャンセル」と主操作の「変更を保存」を表示し、変更可否と処理状態に応じて主操作を制御する。
管理者設定への導線と招待中Badgeは常時公開し、実際の操作可否は組織のプラン、役割、上限、招待状態をサーバー側で再確認して決める。
組織からの削除は、所属店舗一覧の下にあるユーザー削除カードから確認Dialogを開く。
「所属店舗を変更」から、シフトスタッフとして所属する店舗をdesired-setで選ぶ変更Dialogを開く。
稼働中の店舗はチェックを変更でき、`archived`または`planSuspended`の既存所属はチェック済みの変更不可項目として保持する。
所属店舗の行から、対象店舗をパスの`targetShopId`で表す店舗別設定ページへ遷移する。
店舗別設定ページは`<店舗名>：<スタッフ名>さん`を見出しとし、その店舗でのLINE送信可否、通知、シフト対象設定をタブに分けず縦に並べる。

## URLと遷移

```text
/users/<personId>?shop=<sourceShopId>&panel=<basic|line|addShop>&returnTo=<dashboard|settings|shopDetail>&returnShop=<shopId>&returnShopTo=dashboard&users=<count>
/users/<personId>/shops/<targetShopId>?shop=<sourceShopId>&returnTo=<dashboard|settings|shopDetail>&returnShop=<shopId>&returnShopTo=dashboard&users=<count>
```

スタッフ詳細の`panel`は開いているDialogを表し、`basic`はスタッフ情報、`line`は組織共通のLINE連携、`addShop`は所属店舗変更を開く。  `addShop`という値は既存URLとの互換のため維持し、画面上では「店舗追加」と表示しない。
`panel`を省略したスタッフ詳細URLはDialogを開かないページ本体を表す。
Dialogを閉じると`panel`をURLから外し、人物ID、店舗、戻り先、一覧表示件数は維持する。
直接URLを開いた場合も、`panel`にスタッフ情報、LINE連携、所属店舗変更Dialogの状態を追従させる。  旧URLの`panel=email`は通常のスタッフ詳細へ静かに収束させ、自動的なメール同期や削除を再開しない。
ブラウザバックまたは画面内の閉じる操作でDialogを閉じた後は、履歴上の`panel`も除去し、別画面から戻ってもDialogを再表示しない。
旧`tab`検索パラメータは受け付けず、スタッフ詳細の状態管理には使わない。

検索パラメータの`shop`はスタッフ詳細へ来たときの選択店舗を表し、`AuthGuard`、`selectedShopAtom`、ヘッダーの店舗選択と同期する。
所属店舗を押しても`shop`は変更せず、店舗別設定の取得・更新対象はパスの`targetShopId`として各APIへ明示的に渡す。
ブラウザ上で指定された`personId`、`targetShopId`、`staffId`は認可情報として扱わない。

Dashboardと組織設定のユーザー一覧は、初期表示を10件とし、「もっと見る」で増やした表示件数を`users`へ10件単位で保持する。
スタッフ詳細へ遷移するときも`users`を引き継ぐ。
店舗別設定への遷移は通常の履歴を追加し、ブラウザバックで元のスタッフ詳細へ戻れるようにする。
店舗別設定の見出しにある戻る操作も、`shop`、`returnTo`、`returnShop`、`returnShopTo`、`users`を維持して元のスタッフ詳細へ戻る。
スタッフ詳細からの戻る操作は遷移元を`returnTo`で判定する。
Dashboardまたは組織設定へは現在の`shop`と表示件数を引き継ぎ、`focus`に指定した直前のユーザー付近へスクロールする。
店舗詳細から遷移した場合は、別店舗の店舗別設定を開いても`returnShop`に保持した出発元店舗へ戻る。
Dashboard起点の場合は`returnShopTo=dashboard`も引き継ぎ、店舗詳細からDashboardへ戻れる状態を維持する。

Dashboardの移行済みスタッフは、`getDashboardStaffs`が返す`organizationPersonId`を`personId`に使う。
Widen期間中に`organizationPersonId`が未設定のスタッフだけは、操作不能にせず旧スタッフ詳細モーダルを暫定表示する。
組織設定は一覧の人物IDをそのまま`personId`に使う。

## 画面一覧

| 画面 | 役割 |
|---|---|
| `/dashboard?shop=<shopId>&users=<count>&focus=<personId>` | 店舗スタッフ一覧から、移行済みスタッフのスタッフ詳細ページへ遷移する。表示件数と復帰位置を保持する |
| `/settings?shop=<shopId>&tab=people&users=<count>&focus=<personId>` | 店舗未所属者を含む組織人物一覧から、スタッフ詳細ページへ遷移する。表示件数と復帰位置を保持する |
| `/users/<personId>?shop=<shopId>` | スタッフ情報の入口、所属店舗、ユーザー削除カードを表示する |
| `/users/<personId>?shop=<shopId>&panel=basic` | 氏名とシフト連絡先をDialogで扱い、管理者状態は専用の管理者設定への導線として表示する |
| `/users/<personId>?shop=<shopId>&panel=line` | 組織共通のLINE連携状態、連携URL、案内メール、明示解除をDialogで扱う |
| `/users/<personId>?shop=<shopId>&panel=addShop` | 既存URLとの互換を維持しながら所属店舗変更Dialogを開き、シフトスタッフとして所属する稼働中店舗をチェックリストで変更する |
| `/users/<personId>/shops/<targetShopId>?shop=<sourceShopId>` | 対象店舗でのLINE送信可否、通知、シフト対象設定を専用ページで扱う。`shop`は出発元店舗として維持する |

## 表示状態

- 読み込み中はページ見出しと本文のSkeletonを表示する。
- 存在しない人物、削除済み人物、別組織の人物には同じ「ユーザーを表示できません」を表示し、存在や所属を区別して漏らさない。
- 対象店舗への管理アクセスがない、人物と店舗所属が一致しない、所属または店舗が削除済みの場合も、存在を区別しない最小情報のEmpty状態へ寄せる。
- スタッフ情報Dialogと所属店舗変更Dialogは、PCではモーダル、SPではフルスクリーンで表示する。
- アカウント連携済み・未連携、本人・他者を分けず、同じプロフィールフォームでシフト連絡先を編集する。
- 本人が管理者の場合だけ、シフト連絡先メールアドレスの下に「シフト通知用先のメールアドレスです。」と「ログインで利用するメールはアカウント設定から設定してください。」を改行して表示し、「アカウント設定」をリンクにする。
- 店舗別設定はPCとSPのどちらも通常のページとして表示し、Dialog用の固定高、入れ子スクロール、全画面モーダル用レイアウトを使わない。
- 所属店舗一覧には未所属店舗を表示しない。
- 「所属店舗を変更」のボタンとDialogは、複数店舗のserver-side rollout gateが開いている場合に表示し、店舗未所属の管理者にも同じ導線を表示する。gateが閉じている間は古い画面からの要求もserverで拒否する。
- 所属店舗変更Dialogは、シフトスタッフとして所属する店舗のdesired-setチェックリストを表示する。冒頭では「シフトスタッフとして所属する店舗を選択してください。」に続けて、「店舗から外す場合、チェックを外してください。」を改行して表示する。`active`の店舗は所属中・未所属を問わず編集でき、`archived`または`planSuspended`の既存所属はチェック済みのまま変更不可として理由を表示する。非activeの未所属店舗と削除済み店舗は表示しない。
- Dialog下部には「キャンセル」と主操作の「変更する」を表示する。初期状態との差分がない間、処理中、閲覧専用、契約制限中は「変更する」を無効にする。
- 追加と解除のどちらも「変更する」を1回押すと確定処理へ進み、二重確認Dialogは開かない。初期状態で所属していた店舗のチェックを外した場合だけ、その店舗の行に「店舗から外す」と「今日以降のシフト割り当てから削除します。」「この店舗からの通知を停止します。LINE連携は組織に残ります。」の2項目を赤字の箇条書きで表示し、再びチェックすると解除表示を消す。解除対象ごとの件数と合計は表示せず、取得済みの解除previewを同じmutationへ渡す。
- 解除対象ごとの将来シフト割当previewが`tooMany`の場合、または解除対象全体の割当件数がtransaction上限を超える場合は一部だけ処理せず、対象が多いため変更できないことを表示して確定を無効にする。previewが取得後に変わった場合は選択全体を未反映として最新状態を再取得する。
- 全店舗のチェックを外すことは許可する。この場合は「全店舗から外した場合でも、無所属としてスタッフは残り続けます。」と変更Dialog内で示す。最後の店舗所属を解除しても組織の人物情報、管理者権限、請求上の利用人数は維持され、店舗スタッフとしてのアクセスだけが終了する。人数枠を空ける操作はユーザー削除として分ける。
- 変更成功後は詳細Queryの更新に従って所属店舗一覧とチェックリストを更新し、Dialogを閉じる。通常の失敗では選択を維持し、membershipまたはpreviewが古い場合は最新状態を再取得して選択し直すよう求める。
- スタッフ詳細では「LINE連携」の行に未連携、連携済み、友だち解除の状態を表示する。Dialogから人物専用URLの表示、案内メール、再連携、明示解除を行い、同じ組織の所属店舗で共通利用することを説明する。
- 店舗別設定ページでは、その店舗でのLINE送信可否、通知送信と履歴、シフト対象設定を縦に表示する。LINE連携と店舗所属の変更はスタッフ詳細で行う。
- 停止中の店舗、閲覧専用または契約制限中は、サーバーが返す操作可否と理由を表示し、通常の更新操作を無効にする。契約制限中でもactiveな管理者には、安全停止のためのLINE明示解除だけを許可する。閲覧専用の管理者には許可しない。
- API取得に失敗した場合はページのエラー状態へ寄せ、直前の別店舗データを表示しない。
- 通知、LINE案内、シフト対象設定は個別に処理中状態を表示し、同じ操作の重複送信を防ぐ。シフト対象設定は画面を先に切り替え、失敗時に元へ戻し、操作直後から最低1000msは再操作を無効にする。
- LINE連携URLの発行中はSkeletonを表示し、成功後は対象ユーザー専用のURLとQRコードをDialog内へ表示する。失敗時は既存のエラー通知を表示する。
- 明示解除は確認表示を経て、その組織の全所属店舗だけを停止する。別組織の連携には影響せず、再利用には本人による新しい連携を必要とする。
- 通知対象の募集と確定シフトは、Dashboardと同じ色・状態表現で期間、締切または確定日、提出人数を表示する。確定シフトは終了日が今日以降の現在分と将来分を表示して再送でき、過去分は表示しない。
- 確定シフトの個別再送は1回につき40件までを対象とする。対象が40件を超える場合は一部だけ送らず、再送を開始できないことを表示する。
- 管理者の招待・交代・権限解除は`/settings/managers?shop=<shopId>`へ集約する。スタッフ詳細は状態と「管理者設定で変更」の導線だけを表示し、管理者変更mutationを直接実行しない。
- 現行backendは`managerInvitationState`をプラン、役割、上限、招待状態から投影し、公開設定による`hidden`は返さない。旧DTOの`hidden`はrolling deploy互換のため表示型にだけ残す。
- `active`または`readOnly`の管理者は、人物削除と個別店舗所属解除を先に実行できない。画面は「先に管理者権限を外してください」と管理者設定への導線を示し、serverも人物削除・店舗側と人物側の各所属変更mutationで同じguardを再確認する。
- 個別通知の再送は、募集通知と終了日が今日以降の確定シフト通知の両方でactor単位と組織単位の短時間・日次quotaを適用する。client request IDはquota keyに使わず、別managerへ切り替えても組織quotaを共有する。
- 自分自身の管理者権限解除または組織削除後は、失効した店舗をURLに残さずダッシュボードへ戻る。

## 店舗所属変更の状態契約

所属店舗変更は、`getUserDetail`が返した`membershipFingerprint`、解除対象ごとのstaffと将来シフト割当preview、Dialogを開いている間維持する`requestId`を使い、一つのmutationで確定する。  mutationは追加と解除の全差分を同じDB transactionで適用し、一部店舗だけを成功させない。

同じ組織、人物、操作主体、`requestId`と同じ変更意図の再実行は、最初に確定した結果を返し、staff、通知予約、監査記録を重複させない。  同じscopeの`requestId`を異なる所属集合、fingerprintまたはpreviewへ再利用した要求は拒否する。membershipまたは解除previewが取得後に変わった場合も変更全体を拒否し、最新状態を再取得して選択し直す。

解除する店舗では、本日以降の`shiftAssignments`を削除し、対象staffを論理削除してstaff用session、magic link、LINE token、互換用の店舗LINE投影、未送信のstaff向け通知を失効させる。  組織人物の共通LINE連携は保持する。通知履歴は画面から対象外にした後、予約したcleanupで非同期に物理削除する。過去のシフト割当と提出、組織の人物、管理者権限、ほかの店舗所属は保持する。

解除後に同じ店舗へ再追加した場合は、論理削除したstaffを復活させず、新しいstaff IDで開始する。  旧staffのcredential、本日以降のシフト割当を復元せず、旧staffの提出は履歴として保持して新しいstaffへ継承しない。  組織人物がLINE連携済みなら、共通連携は新しい店舗所属でも利用する。新しいstaffは各募集に未提出の状態から開始する。  所属の解除または追加で影響するopen募集では、回答数を変更後のactiveかつシフト対象のstaffによる提出だけから再計算し、旧staffの提出を履歴に残したまま現在の回答数から除外する。

mutationの成功は、DB transactionと必要な通知・cleanupの予約が確定したことを表す。  外部サービスへの通知到達、予約処理の実行、通知履歴の物理削除完了までは保証しない。

## 認可と安全性

- Convexは認証identityから有効な管理アクセスを解決し、店舗別設定のQueryでは人物に対象店舗の有効な所属があることを応答前に検証し、更新時は対象店舗への書込権限を検証する。
- 店舗別APIは、対象スタッフと`targetShopId`の所属関係、人物との対応、削除状態、店舗状態をサーバー側で再検証する。
- 権限のない店舗、不正な人物・店舗・スタッフの組み合わせ、削除済み対象は拒否するか、存在を区別できない最小情報のEmpty状態へ寄せる。
- 所属店舗一覧から選ばれたことや、フロントエンドが保持する`selectedShopAtom`は認可根拠にしない。
- プロフィール更新APIは、actorの組織権限、personの所属、各staffの組織・店舗・personの対応、組織内の重複をサーバーで確認し、同じ組織のpersonと未削除staffだけを一transactionで更新する。不整合な所属が1件でもあれば全体をfail-closedにし、`users.email`、Clerk、別組織、請求先は更新しない。
- 所属店舗変更APIは、actorの組織権限と書込可否、personの同一組織・有効状態、指定した全店舗の同一組織・削除状態・店舗状態、active staffの一意性をサーバー側で再検証する。clientが渡すperson、店舗集合、staff、fingerprint、previewを認可根拠にせず、非active所属をdesired-setから脱落させたり、別組織へ所属を作ったりしない。
- 所属店舗変更APIは`membershipFingerprint`と解除対象ごとのpreviewを再計算し、stale、権限不足、契約制限、不正な組合せ、件数超過のいずれでもDB、scheduler、Outbox、監査記録を増やさない。
- Clerkのメール、`users.email`、シフト連絡先が異なる状態を正常として扱い、認証後アプリをブロックしたり自動上書きしたりしない。
- 通知とLINE案内は既存のrate limit、再送quota、Outboxの冪等性と配送直前の再検証を維持する。確定シフトの個別再送は対象募集を受付時に固定したdurable fanoutとして処理し、中断後も同じoperationとdedupe keyで再開する。Outboxへの投入後は現在の割当を通知snapshotへ記録し、後続の差分再通知で同じ内容を重複送信しない。
- メールアドレス、LINE token、連携URL、通知本文を新しいログへ出力しない。

## 関連ファイル

### バックエンド

- `convex/schema.ts`：`organizationPeople`、`organizationMembers`、`staffs`、`lineProviderUsers`、`organizationPersonLineLinks`の定義。
- `convex/organization/userDetailQueries.ts`：人物、管理者権限、操作可否、組織内店舗、店舗別所属を返す詳細Query。
- `convex/organization/shopMembershipChange.ts`：店舗所属snapshotの正規化、`membershipFingerprint`、stale時の共通契約。
- `convex/organization/personProfile.ts`：組織共通プロフィールと有効な店舗スタッフ行の同期。
- `convex/organization/personRemoval.ts`：解除preview、本日以降のシフト割当削除、staff用accessとLINE連携の失効。
- `convex/organization/mutations.ts`：プロフィール更新、管理者権限解除、店舗所属解除、組織からの人物削除。
- `convex/recruitment/stats.ts`：所属の解除または追加で影響を受けるopen募集について、現在のシフト対象staffから回答数を再計算する。
- `convex/staff/mutations.ts`：既存人物の所属店舗desired-set変更、店舗追加、店舗別のシフト対象設定と通知再送。
- `convex/line/`：組織人物単位のLINE連携、LINE利用者単位の友だち状態、連携リンク、個別連携依頼、明示解除。
- `convex/notificationOutbox/queries.ts`：店舗スタッフ単位の通知履歴。
- `convex/dashboard/queries.ts`：DashboardスタッフDTOへの`organizationPersonId`の付与。

### フロントエンド

- `src/routes/_auth/dashboard.tsx`と`settings.tsx`：ユーザー一覧の`users`と`focus`を受け取るURL境界。
- `src/routes/_auth/users.$personId.tsx`：人物IDと`shop`、スタッフ情報・LINE連携・所属店舗変更の`panel`、戻り先、出発元店舗、一覧表示件数を受け取るURL境界。所属店舗変更は互換値`panel=addShop`を使い、旧`panel=email`は破棄する。
- `src/routes/_auth/users.$personId_.shops.$targetShopId.tsx`：対象店舗IDと、出発元店舗・戻り先情報を受け取る店舗別設定のURL境界。
- `src/pages/user-detail/`：詳細QueryとLoading、Not Found、正常表示の分岐。
- `src/pages/user-shop-detail/`：`targetShopId`を明示した詳細QueryとLoading、Empty、正常表示の分岐。
- `src/components/features/UserDetail/`：スタッフ情報の入口、所属店舗一覧、所属店舗変更チェックリスト、スタッフ情報Dialog、URL同期、編集と確認操作。
- `src/components/features/UserShopDetail/`：対象店舗のAPI接続と状態を所有し、LINE送信可否、通知、シフト対象設定をViewへ渡す。
- `src/components/features/StaffNotificationHistory/`：店舗別設定ページと旧スタッフ詳細フォールバックから利用する通知履歴。
- `src/components/features/Dashboard/StaffManagement/`と`StaffRoster/`：店舗スタッフ一覧からの遷移と未移行スタッフの暫定フォールバック。
- `src/components/features/OrganizationSettings/`：組織人物一覧からの遷移。
- `src/hooks/useScrollToListItem.ts`：一覧へ戻ったときに直前のユーザー行へスクロールする。
- `src/lib/userListSearch.ts`：一覧表示件数と復帰対象のQueryStringを正規化する。

## API一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.organization.userDetailQueries.getUserDetail` | `managerQuery` | URLの人物が対象店舗と同じ組織に属することを確認する。店舗別設定では対象店舗への有効な所属も必須とし、共通プロフィール、LINE連携状態、管理者権限、操作可否、組織内店舗、店舗別所属、行ごとの変更可否と解除preview、`membershipFingerprint`を返す |
| `api.dashboard.queries.getDashboardStaffs` | `managerQuery` | 店舗スタッフと対応する`organizationPersonId`をページングして返す |
| `api.dashboard.queries.getDashboardRecruitments` | `managerQuery` | `targetShopId`で指定した対象店舗の募集中シフトを取得する |
| `api.dashboard.queries.getDashboardCurrentRecruitments` | `managerQuery` | `targetShopId`で指定した対象店舗の終了日が今日以降の確定シフトを取得する |
| `api.organization.mutations.updatePersonProfile` | `authenticatedMutation` | アカウント連携の有無にかかわらず、名前とシフト連絡先を組織共通personと同じ組織の未削除staffへ同期する |
| `api.organization.mutations.removeManagerRole` | `authenticatedMutation` | 人物とシフト記録を維持し、組織の管理者権限だけを外す。店舗所属がなければ管理アクセスを終了する |
| `api.organization.mutations.removePersonFromShop` | `authenticatedMutation` | `targetShopId`で指定した店舗のスタッフ所属とアクセスだけを終了する。対象がactive/readOnly managerなら先に権限解除を要求する |
| `api.organization.mutations.removePersonFromOrganization` | `authenticatedMutation` | 組織内の全所属とアクセスを終了する。対象がactive/readOnly managerなら先に権限解除を要求する |
| `api.staff.mutations.changeOrganizationPersonShopMemberships` | `managerMutation` | 同じ組織の既存人物について、active店舗のdesired-set、`membershipFingerprint`、解除preview、安定した`requestId`を再検証し、店舗所属の追加と解除を一transactionで反映する。active/readOnly managerの解除を含む場合は変更全体を拒否する |
| `api.staff.mutations.setShiftExclusion` | `managerMutation` | `targetShopId`で指定した店舗のスタッフをシフト対象または対象外に切り替える |
| `api.line.mutations.generateLinkToken` | `managerMutation` | 発行元staffを再検証し、同じ組織人物の全店舗で使うLINE連携リンクを発行する |
| `api.line.mutations.sendInvite` | `managerMutation` | 発行元staffを再検証し、同じ組織人物へLINE連携案内を送る |
| `api.line.mutations.disconnectOrganizationPersonLine` | `authenticatedMutation` | 組織人物の共通LINE連携を明示解除し、その組織の全所属店舗で停止する |
| `api.staff.mutations.sendOpenRecruitmentNotifications` | `managerMutation` | `targetShopId`で指定した店舗のスタッフへ現在送れる募集通知を、actor・組織単位の再送quota内で予約する |
| `api.staff.mutations.sendCurrentShiftNotification` | `managerMutation` | `targetShopId`で指定した店舗のスタッフへ終了日が今日以降の確定シフト通知を、actor・組織単位の再送quota内かつ最大40件でdurable fanoutとして予約する。超過時は何も予約しない |
| `api.notificationOutbox.queries.listStaffNotificationHistory` | `managerQuery` | `targetShopId`で指定した店舗のスタッフへ送った通知履歴を最小DTOでページングする |

## テスト契約

| 契約 | 主担当層 | 参照先 |
|---|---|---|
| 詳細Queryがactive・非active所属、行ごとの変更可否、解除preview、`membershipFingerprint`を完全なDTOで返す | Convex Function Test | `convex/organization/userDetailQueries.test.ts` |
| desired-setの追加だけ、解除だけ、混在、全解除を一transactionで反映し、非active所属を保持する。解除後の再追加を新しいstaffとして扱い、認可、店舗境界、件数上限、stale、request replay、異なるintentでのrequest ID再利用、open募集の回答数再計算をfail-closedにする | Convex Function Test | `convex/staff/mutations.test.ts` |
| active/readOnly managerの人物削除と個別店舗所属解除を4つのcanonical mutationで拒否し、先に権限解除した後の別操作は許可する。店舗・組織全体の削除cleanupは維持する | Convex Function Test、Convex Scenario Test | `convex/organization/mutations.test.ts`、`convex/staff/mutations.test.ts`、`convex/organization/userDetailQueries.test.ts`、`convex/_scenario/organizationPersonRemoval.test.ts` |
| 共通の店舗所属解除処理が旧credential・LINE・通知・将来シフトを失効させ、過去履歴を保持し、削除済みstaffから提出・閲覧・通知へ進めない状態遷移を守る | Convex Scenario Test | `convex/_scenario/staffManagement.test.ts`、`convex/_scenario/securityBoundaries.test.ts`、`convex/_scenario/organizationPersonRemoval.test.ts`、`convex/_scenario/notificationHistory.test.ts` |
| チェック操作だけでは送信せず、差分なしを無効にし、解除を含む変更を正しい店舗のpreview付きで1回の確定操作から送信し、二重確認Dialogを開かず、`tooMany`、stale、二重送信を安全に扱う | Frontend Unit Test、Behavior Test | `src/components/features/UserDetail/useUserMembershipActions.test.ts`、`src/components/features/UserDetail/index.stories.tsx` |
