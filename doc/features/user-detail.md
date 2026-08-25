# スタッフ詳細

## 機能説明

組織内の人物を表す`organizationPeople`を正本として、共通プロフィールとLINE連携状態はスタッフ詳細ページ、管理者の変更操作は管理者設定ページ、店舗ごとのシフト設定と通知は店舗別設定ページで扱う。
Dashboardのスタッフ一覧、組織設定のユーザー一覧、`/staff`の組織人物一覧は、同じスタッフ詳細ページへ遷移する。

`/staff`で店舗filterが「すべて」のときは、各行の左側にあるドラッグハンドルで組織の全人物を並べ替える。
保存済みの組織共通順はスタッフ管理、Dashboard、店舗詳細の所属スタッフ一覧へ適用し、店舗別一覧ではその部分列を表示する。
シフト表と希望シフト入力の勤務開始時刻順は変更しない。
詳細は[スタッフの並び順](staff-order.md)を参照する。

## 情報のスコープ

| 情報 | スコープ | 保存先 |
|---|---|---|
| 氏名 | 組織共通 | `organizationPeople` |
| シフト通知先メールアドレス | 組織共通 | `organizationPeople`と、同じ人物に紐づく未削除`staffs` |
| ログイン方法 | 利用者全体 | Clerk UserのEmailAddress、パスワード、ExternalAccount。この画面では変更しない |
| 管理者権限 | 組織共通 | `organizationMembers` |
| シフト対象設定 | 店舗別 | `staffs` |
| LINE連携 | 組織人物共通 | `organizationPersonLineLinks`と`lineProviderUsers`。段階切替中だけ`staffLineAccounts`を互換投影として使う |
| 通知操作と通知履歴 | 店舗別 | 対象`staffId`に紐づく募集、Outbox、通知履歴 |

氏名とシフト連絡先の更新は、アカウント連携の有無にかかわらず、同じ人物に紐づく同じ組織の有効な全店舗スタッフ行へ同期する。  権限を持つ管理者は本人と他者のどちらも編集できる。

シフト連絡先の変更は、Clerkのログイン方法、`users.email`の初期snapshot、別組織の人物、組織の請求先を変更しない。
ページ本文は、スタッフ情報を開くコンパクトな行、所属店舗一覧、ユーザー削除カードで構成する。
所属店舗一覧には有効な`staffs`がある店舗だけを表示し、未所属店舗は表示しない。
スタッフ情報の行から共通プロフィールを扱うレスポンシブDialogを開く。  管理者権限と招待中のBadgeはスタッフ詳細ページ側で表示し、スタッフ情報Dialogには管理者設定への導線や権限の説明を表示しない。
Dialog下部には「キャンセル」と主操作の「変更を保存」を表示し、変更可否と処理状態に応じて主操作を制御する。
組織からの削除は、所属店舗一覧の下にあるユーザー削除カードから確認Dialogを開く。
「所属店舗を変更」から、シフトスタッフとして所属する店舗をdesired-setで選ぶ変更Dialogを開く。
稼働中の店舗はチェックを変更でき、`archived`または`planSuspended`の既存所属はチェック済みの変更不可項目として保持する。
所属店舗の行から、対象店舗をpathの`shopId`で表す店舗別設定ページへ遷移する。
店舗別設定ページは`<店舗名>：<スタッフ名>さん`を見出しとし、通知、通知履歴、シフト対象設定をタブに分けず縦に並べる。通知履歴の見出しには、組織共通のLINE連携の有無を補助バッジとして表示する。

## URLと遷移

```text
/staff?org=<organizationId>&shopFilter=<shopId>
/staff/<personId>?org=<organizationId>
/staff/<personId>/shops/<shopId>?org=<organizationId>
```

詳細URLは`org`だけを検索パラメータとして受け取り、Dialogの開閉はページ内の状態として管理する。
戻る操作、所属店舗へのdrilldown、公開時の管理者設定への遷移は同じ`org`を維持する。
自分自身を組織から削除した場合はsearchを外した`/dashboard`へ戻り、残っているcanonicalな組織を再解決する。

店舗別設定の取得・更新対象はpathの`shopId`として各APIへ明示的に渡す。
ブラウザ上で指定された`org`、`personId`、`shopId`、`staffId`は認可情報として扱わない。

旧`/users/*` routeと、その`panel`、`returnTo`、`returnShop`、`returnShopTo`、`users`、`focus` searchは削除済みであり、互換redirectを設けない。
一覧と詳細間の復帰は通常のbrowser historyを使う。

Dashboardの移行済みスタッフは、`getDashboardStaffs`が返す`organizationPersonId`を`personId`に使う。
Widen期間中に`organizationPersonId`が未設定のスタッフだけは、操作不能にせず旧スタッフ詳細モーダルを暫定表示する。  旧モーダルの募集、確定シフト、LINE連携案内メールにもcanonical画面と同じ再送クールダウンを表示する。
組織設定は一覧の人物IDをそのまま`personId`に使う。

## 画面一覧

| 画面 | 役割 |
|---|---|
| `/staff?org=<organizationId>&shopFilter=<shopId>` | canonicalな組織の全人物をページングし、任意の同一組織店舗でserver-sideに絞り込む。店舗filterが「すべて」のときだけ組織共通の人物順を一覧内で変更できる。人物詳細、管理者設定、既存スタッフ追加Dialogへの入口を表示する |
| `/staff/<personId>?org=<organizationId>` | スタッフタブから組織人物の共通プロフィール、所属店舗、削除操作を表示する |
| `/staff/<personId>/shops/<shopId>?org=<organizationId>` | 同じ組織の対象店舗における通知、通知履歴、シフト対象設定を表示する |

## 表示状態

- 読み込み中はページ見出しと本文のSkeletonを表示する。
- `/staff`は`getSettings`を一覧データ源にせず、組織人物をcursor paginationで取得する。店舗filterはpagination前にserver-sideで適用し、filter変更時は旧cursorと旧pageを破棄する。プラン上限をread上限にせず、追加pageから上限超過人物にも到達できる。
- `/staff`の取得失敗は空一覧と区別したQueryErrorを表示し、同じ組織とfilterで再試行できる。
  閲覧専用、上限超過・利用数評価不能、旧`restricted`互換の契約復旧中も一覧を維持し、スタッフ追加をサーバー由来の理由とともに無効にする。
- `/staff`を全店舗表示している状態からスタッフを追加する場合は、店舗一覧と同じdrilldown listで対象店舗を1店舗選び、既存のスタッフ追加Dialogへ進む。対象店舗選択DialogはSPで全画面表示する。店舗filterで1店舗に絞り込み済みの場合は選択を省略する。
- 存在しない人物、削除済み人物、別組織の人物には同じ「ユーザーを表示できません」を表示し、存在や所属を区別して漏らさない。
- 対象店舗への管理アクセスがない、人物と店舗所属が一致しない、所属または店舗が削除済みの場合も、存在を区別しない最小情報のEmpty状態へ寄せる。
- スタッフ情報Dialogと所属店舗変更Dialogは、PCではモーダル、SPではフルスクリーンで表示する。
- アカウント連携済み・未連携、本人・他者を分けず、同じプロフィールフォームでシフト連絡先を編集する。
- 本人が管理者の場合だけ、シフト通知先メールアドレスの下に「シフト通知先のメールアドレスです。」と「ログインで利用するメールはアカウント設定から設定してください。」を改行して表示し、「アカウント設定」をリンクにする。
- 店舗別設定はPCとSPのどちらも通常のページとして表示し、Dialog用の固定高、入れ子スクロール、全画面モーダル用レイアウトを使わない。
- 所属店舗一覧には未所属店舗を表示しない。
- 所属店舗変更Dialogは、シフトスタッフとして所属する店舗のdesired-setチェックリストを表示する。冒頭では「シフトスタッフとして所属する店舗を選択してください。」に続けて、「店舗から外す場合、チェックを外してください。」を改行して表示する。`active`の店舗は所属中・未所属を問わず編集でき、`archived`または`planSuspended`の既存所属はチェック済みのまま変更不可として理由を表示する。非activeの未所属店舗と削除済み店舗は表示しない。
- Dialog下部には「キャンセル」と主操作の「変更する」を表示する。
  初期状態との差分がない間、処理中、閲覧専用、上限超過・利用数評価不能、旧`restricted`互換の契約復旧中は「変更する」を無効にする。
- 追加と解除のどちらも「変更する」を1回押すと確定処理へ進み、二重確認Dialogは開かない。初期状態で所属していた店舗のチェックを外した場合だけ、その店舗の行に「店舗から外す」と「今日以降のシフト割り当てから削除します。」「この店舗からの通知を停止します。LINE連携は組織に残ります。」の2項目を赤字の箇条書きで表示し、再びチェックすると解除表示を消す。解除対象ごとの件数と合計は表示せず、取得済みの解除previewを同じmutationへ渡す。
- active管理者の店舗所属を外す場合は、店舗通知を受け取る管理者を各店舗に1名以上所属させる推奨と、別の所属管理者がいなければスタッフ参加申請、シフト確定催促、通知エラーなどが送信されないことをDialog内に表示する。
- 解除対象ごとの将来シフト割当previewが`tooMany`の場合、または解除対象全体の割当件数がtransaction上限を超える場合は一部だけ処理せず、対象が多いため変更できないことを表示して確定を無効にする。previewが取得後に変わった場合は選択全体を未反映として最新状態を再取得する。
- 全店舗のチェックを外すことは許可する。この場合は「全店舗から外した場合でも、無所属としてスタッフは残り続けます。」と変更Dialog内で示す。最後の店舗所属を解除しても組織の人物情報、管理者権限、請求上の利用人数は維持され、店舗スタッフとしてのアクセスだけが終了する。人数枠を空ける操作はユーザー削除として分ける。
- 変更成功後は詳細Queryの更新に従って所属店舗一覧とチェックリストを更新し、Dialogを閉じる。通常の失敗では選択を維持し、membershipまたはpreviewが古い場合は最新状態を再取得して選択し直すよう求める。
- 組織設定のスタッフ一覧では、組織人物共通のLINE連携状態を「LINE連携済み」「LINE通知不可」「LINE未連携」のバッジで表示する。
- スタッフ詳細では「LINE連携」の行に未連携、連携済み、友だち解除の状態を表示する。Dialogから人物専用URLの表示、案内メール、再連携、明示解除を行い、同じ組織の所属店舗で共通利用することを説明する。
- 店舗別設定ページでは、通知送信と履歴、シフト対象設定を縦に表示する。通知履歴の見出しには組織共通のLINE連携状態を補助バッジで表示し、LINE連携と店舗所属の変更はスタッフ詳細で行う。
- 停止中の店舗、閲覧専用、上限超過・利用数評価不能、旧`restricted`互換の契約復旧中は、サーバーが返す操作可否と理由を表示し、通常の更新操作を無効にする。
  有効管理者には利用アクセスを問わず安全停止のためのLINE明示解除を許可し、閲覧専用の管理者には許可しない。
- API取得に失敗した場合はページのエラー状態へ寄せ、直前の別店舗データを表示しない。
- 通知、LINE案内、シフト対象設定は個別に処理中状態を表示し、同じ操作の重複送信を防ぐ。募集、確定シフト、LINE連携案内メールは、同種の送信受付から10分間はoutlineの再送操作を無効にし、「送信済みです。」と「送信から10分後に再送できるようになります。」を操作の近くに表示する。正確な解除時刻、最終送信日時、チャネル、自動／手動は表示しない。シフト対象設定は画面を先に切り替え、失敗時に元へ戻し、操作直後から最低1000msは再操作を無効にする。
- LINE連携URLの発行中はSkeletonを表示し、成功後は対象ユーザー専用のURLとQRコードをDialog内へ表示する。失敗時は既存のエラー通知を表示する。
- 明示解除は確認表示を経て、その組織の全所属店舗だけを停止する。別組織の連携には影響せず、再利用には本人による新しい連携を必要とする。
- 通知対象の募集と確定シフトは、Dashboardと同じ色・状態表現で期間、締切または確定日、提出人数を表示する。確定シフトは終了日が今日以降の現在分と将来分を表示して再送でき、過去分は表示しない。
- 確定シフトの個別再送は1回につき40件までを対象とする。対象が40件を超える場合は一部だけ送らず、再送を開始できないことを表示する。
- 管理者の招待・交代・権限解除は`/manage/managers?org=<organizationId>`へ集約する。  スタッフ詳細は管理者設定への導線を表示しない。
- backendは招待、再送、受諾、権限追加の各public APIで、認証、組織境界、管理者状態、招待token lifecycleをserver-sideでも確認する。
- 通常利用中の`active`管理者は、人物側または店舗側の所属変更から個別店舗・全店舗のスタッフ所属を解除できる。
  個別解除ではほかの店舗所属を維持し、全店舗解除でも管理者権限と組織人物を維持する。
- 上限超過・利用数評価不能では店舗所属だけを外しても利用人数が減らないため、所属変更は許可しない。
  組織からの人物削除、管理者権限解除、招待取消、店舗アーカイブは別の上限整理操作として許可する。
- 管理者人物を組織から削除する操作は、先に管理者権限を外すまで拒否する。
  最後のactive管理者の権限解除も拒否し、人物削除mutationでserver-side guardを再確認する。
- 個別通知の再送は、募集通知と終了日が今日以降の確定シフト通知の両方でactor単位と組織単位の短時間・日次quotaを適用する。client request IDはquota keyに使わず、別managerへ切り替えても組織quotaを共有する。
- 自分自身の管理者権限解除または組織削除後は、失効した店舗をURLに残さずダッシュボードへ戻る。

## 店舗所属変更の状態契約

所属店舗変更は、`getUserDetail`が返した`membershipFingerprint`、解除対象ごとのstaffと将来シフト割当preview、Dialogを開いている間維持する`requestId`を使い、一つのmutationで確定する。  mutationは追加と解除の全差分を同じDB transactionで適用し、一部店舗だけを成功させない。

同じ組織、人物、操作主体、`requestId`と同じ変更意図の再実行は、最初に確定した結果を返し、staff、通知予約、監査記録を重複させない。  同じscopeの`requestId`を異なる所属集合、fingerprintまたはpreviewへ再利用した要求は拒否する。membershipまたは解除previewが取得後に変わった場合も変更全体を拒否し、最新状態を再取得して選択し直す。

組織人物をactiveのまま店舗所属だけ解除する場合は、本日以降の`shiftAssignments`を削除し、対象staffを論理削除してstaff用session、magic link、LINE token、互換用の店舗LINE投影、未送信のstaff向け通知を失効させる。  組織人物のcanonical LINE連携は保持され得る。通知履歴は画面から対象外にした後、予約したcleanupで非同期に物理削除する。過去のシフト割当と提出、組織の人物、管理者権限、ほかの店舗所属は保持する。

解除後に同じ店舗へ再追加した場合は、論理削除したstaffを復活させず、新しいstaff IDで開始する。  旧staffのcredential、本日以降のシフト割当を復元せず、旧staffの提出は履歴として保持して新しいstaffへ継承しない。  組織人物がLINE連携済みなら、共通連携は新しい店舗所属でも利用する。新しいstaffは各募集に未提出の状態から開始する。  所属の解除または追加で影響するopen募集では、回答数を変更後のactiveかつシフト対象のstaffによる提出だけから再計算し、旧staffの提出を履歴に残したまま現在の回答数から除外する。

組織から人物を通常削除した後に同じ正規化メールアドレスを管理者が手入力する場合と、本人のQR申請を管理者が承認する場合は、どちらも削除履歴の特別確認を表示せず、通常のスタッフ追加として完了する。  内部では同じ`organizationPeople`をactiveへ戻して新しいstaff IDを作る。アカウント削除済みuserに紐づく旧人物だけが一致する場合は旧人物をactiveへ戻さず、新しい`organizationPeople`とstaffを作る。どちらも旧staff、旧staffのシフト提出と割当、管理者権限、ほかの店舗所属、session、magic link、LINE token、canonical LINE linkを復元しない。

人物とstaffの対応が安全に一意解決できない不整合、同一メールの人物履歴が走査上限を超える場合、利用人数上限では、削除履歴や存在状態を示さない汎用的な追加・承認不可結果を返し、person、staff、scheduler、Outboxを部分的に変更しない。  この再追加は既存の人物状態、staff ID、正規化メールアドレスindexで表現できるため、schema変更とbackfillを必要としない。

mutationの成功は、DB transactionと必要な通知・cleanupの予約が確定したことを表す。  外部サービスへの通知到達、予約処理の実行、通知履歴の物理削除完了までは保証しない。

## 認可と安全性

- Convexは認証identityから有効な管理アクセスを解決し、店舗別設定のQueryでは人物に対象店舗の有効な所属があることを応答前に検証し、更新時は対象店舗への書込権限を検証する。
- 店舗別APIは、対象スタッフと`targetShopId`の所属関係、人物との対応、削除状態、店舗状態をサーバー側で再検証する。
- 権限のない店舗、不正な人物・店舗・スタッフの組み合わせ、削除済み対象は拒否するか、存在を区別できない最小情報のEmpty状態へ寄せる。
- 所属店舗一覧から選ばれたことや、フロントエンドが保持する`selectedShopAtom`は認可根拠にしない。
- スタッフ詳細QueryはURLの`org`に対するcanonicalな`organizationMembers`を必須とし、人物と対象店舗が同じ組織に属することをサーバーで再検証する。新しい詳細画面では先頭店舗や旧`shopMembers` fallbackを組織authorityに使わない。画面上で有効にする更新操作も同じ`expectedOrganizationId`を渡し、不一致なら存在を区別せずfail closedにする。
- プロフィール更新APIは、actorの組織権限、personの所属、各staffの組織・店舗・personの対応、組織内の重複をサーバーで確認し、同じ組織のpersonと未削除staffだけを一transactionで更新する。不整合な所属が1件でもあれば全体をfail-closedにし、`users.email`、Clerk、別組織、請求先は更新しない。
- 所属店舗変更APIは、actorの組織権限と書込可否、personの同一組織・有効状態、指定した全店舗の同一組織・削除状態・店舗状態、active staffの一意性をサーバー側で再検証する。clientが渡すperson、店舗集合、staff、fingerprint、previewを認可根拠にせず、非active所属をdesired-setから脱落させたり、別組織へ所属を作ったりしない。
- 所属店舗変更APIは`membershipFingerprint`と解除対象ごとのpreviewを再計算し、stale、権限不足、通常利用不可、不正な組合せ、件数超過のいずれでもDB、scheduler、Outbox、監査記録を増やさない。
- 管理者手入力とQR承認による再追加は、actorの管理権限、対象店舗と組織、正規化メールアドレス、人物とstaffの一意性、旧userのaccount deletion状態、利用人数上限をserver-sideで再検証する。旧userが削除済みなら旧人物を履歴として維持し、それ以外を安全に満たせない場合は汎用的に拒否して削除履歴を応答へ出さない。
- Clerkのメール、`users.email`、シフト連絡先が異なる状態を正常として扱い、認証後アプリをブロックしたり自動上書きしたりしない。
- 通知とLINE案内は既存のrate limit、再送quota、Outboxの冪等性と配送直前の再検証を維持する。確定シフトの個別再送は対象募集を受付時に固定したdurable fanoutとして処理し、中断後も同じoperationとdedupe keyで再開する。Outboxへの投入後は現在の割当を通知snapshotへ記録し、後続の差分再通知で同じ内容を重複送信しない。
- メールアドレス、LINE token、連携URL、通知本文を新しいログへ出力しない。

## 関連ファイル

### バックエンド

- `convex/schema.ts`：`organizationPeople`、`organizationMembers`、`staffs`、`lineProviderUsers`、`organizationPersonLineLinks`の定義。
- `convex/organization/userDetailQueries.ts`：人物、管理者権限、操作可否、組織内店舗、店舗別所属を返す詳細Query。
- `convex/appOrganization/detailQueries.ts`：URLの組織scopeをcanonical membershipで検証してから、人物詳細DTOを返すQuery。
- `convex/appOrganization/queries.ts`：`/staff`向けに組織人物一覧、店舗filter、boundedな利用人数とスタッフ追加可否を返すQuery。
- `convex/organization/shopMembershipChange.ts`：店舗所属snapshotの正規化、`membershipFingerprint`、stale時の共通契約。
- `convex/organization/personProfile.ts`：組織共通プロフィールと有効な店舗スタッフ行の同期。
- `convex/organization/personRemoval.ts`：解除preview、本日以降のシフト割当削除、staff用accessとLINE連携の失効。
- `convex/organization/mutations.ts`：プロフィール更新、管理者権限解除、店舗所属解除、組織からの人物削除。
- `convex/staffRegistration/queries.ts`と`convex/staffRegistration/mutations.ts`：QR申請の承認可否、削除済み人物の通常承認、正式スタッフ作成。
- `convex/recruitment/stats.ts`：所属の解除または追加で影響を受けるopen募集について、現在のシフト対象staffから回答数を再計算する。
- `convex/staff/mutations.ts`：既存人物の所属店舗desired-set変更、店舗追加、店舗別のシフト対象設定と通知再送。
- `convex/line/`：組織人物単位のLINE連携、LINE利用者単位の友だち状態、連携リンク、個別連携依頼、明示解除。
- `convex/notificationOutbox/queries.ts`：店舗スタッフ単位の通知履歴。
- `convex/dashboard/queries.ts`：DashboardスタッフDTOへの`organizationPersonId`の付与。

### フロントエンド

- `src/routes/_auth/staff_.$personId.tsx`と`src/routes/_auth/staff_.$personId_.shops.$shopId.tsx`：`org`、人物ID、対象店舗IDを受け取るスタッフタブのURL境界。
- `src/routes/_auth/staff.tsx`と`src/pages/app-staff/`：組織人物のcursor一覧、店舗filter、Loading・QueryError、スタッフ追加店舗の明示選択を扱うスタッフトップの境界。
- `src/pages/user-detail/`：詳細QueryとLoading、Not Found、正常表示の分岐。
- `src/pages/user-shop-detail/`：pathの`shopId`を明示した詳細QueryとLoading、Empty、正常表示の分岐。
- `src/components/features/UserDetail/`：スタッフ情報の入口、所属店舗一覧、所属店舗変更チェックリスト、スタッフ情報Dialog、URL同期、編集と確認操作。
- `src/components/features/UserShopDetail/`：対象店舗のAPI接続と状態を所有し、LINE送信可否、通知、シフト対象設定をViewへ渡す。
- `src/components/features/StaffNotificationHistory/`：店舗別設定ページと未移行スタッフ向け暫定詳細から利用する通知履歴。
- `src/components/features/Dashboard/StaffManagement/`と`StaffRoster/`：店舗スタッフ一覧からの遷移と未移行スタッフの暫定フォールバック。
- `src/components/features/OrganizationSettings/`：組織人物一覧からの遷移。

## API一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.organization.userDetailQueries.getUserDetail` | `managerQuery` | URLの人物が対象店舗と同じ組織に属することを確認する。店舗別設定では対象店舗への有効な所属も必須とし、共通プロフィール、LINE連携状態、管理者権限、操作可否、組織内店舗、店舗別所属、行ごとの変更可否と解除preview、`membershipFingerprint`を返す |
| `api.appOrganization.detailQueries.getUserDetail` | `organizationQuery` | URLの`org`をcanonical membershipで検証し、その組織に属する人物だけについて既存の詳細DTOを返す |
| `api.appOrganization.queries.listOrganizationPeople` | `organizationQuery` | 組織人物をページングし、指定店舗が同じ組織に属することを検証してからfilterをpagination前に適用する |
| `api.appOrganization.queries.getOrganizationPeopleSummary` | `organizationQuery` | boundedな全体・filter件数、プラン表示上限、閲覧・契約状態を含むスタッフ追加可否を返す |
| `api.dashboard.queries.getDashboardStaffs` | `managerQuery` | 店舗スタッフと対応する`organizationPersonId`をページングして返す |
| `api.dashboard.queries.getDashboardRecruitments` | `managerQuery` | `targetShopId`で指定した対象店舗の募集中シフトを取得する |
| `api.dashboard.queries.getDashboardCurrentRecruitments` | `managerQuery` | `targetShopId`で指定した対象店舗の終了日が今日以降の確定シフトを取得する |
| `api.organization.mutations.updatePersonProfile` | `authenticatedMutation` | アカウント連携の有無にかかわらず、名前とシフト連絡先を組織共通personと同じ組織の未削除staffへ同期する |
| `api.organization.mutations.removeManagerRole` | `authenticatedMutation` | 人物とシフト記録を維持し、組織の管理者権限だけを外す。店舗所属がなければ管理アクセスを終了する |
| `api.organization.mutations.removePersonFromShop` | `authenticatedMutation` | `targetShopId`で指定した店舗のスタッフ所属とスタッフアクセスだけを終了する。active/readOnly managerも実行でき、管理者権限と組織人物は維持する |
| `api.organization.mutations.removePersonFromOrganization` | `authenticatedMutation` | 組織内の全所属とアクセスを終了する。対象がactive/readOnly managerなら先に権限解除を要求する |
| `api.staff.mutations.addStaffs` | `managerMutation` | 管理者手入力でスタッフを追加する。通常削除人物はactiveへ戻し、アカウント削除履歴だけなら新しい人物として、削除履歴の特別確認なしで新しいstaff IDを作る |
| `api.staffRegistration.queries.getPendingRequests` | `managerQuery` | QR申請と承認可否を取得する。通常削除人物は再利用、アカウント削除履歴だけなら新規人物として承認可能にし、安全でない人物不整合と利用人数上限は汎用的な承認不可状態へ寄せる |
| `api.staffRegistration.mutations.approveRequest` | `managerMutation` | QR申請を承認する。通常削除人物はactiveへ戻し、アカウント削除履歴だけなら新しい人物として、削除履歴の特別確認なしで新しいstaff IDを作る |
| `api.staff.mutations.changeOrganizationPersonShopMemberships` | `managerMutation` | 同じ組織の既存人物について、active店舗のdesired-set、`membershipFingerprint`、解除preview、安定した`requestId`を再検証し、店舗所属の追加と解除を一transactionで反映する。active/readOnly managerのスタッフ所属も同じ契約で解除できる |
| `api.staff.mutations.setShiftExclusion` | `managerMutation` | `targetShopId`で指定した店舗のスタッフをシフト対象または対象外に切り替える |
| `api.line.mutations.generateLinkToken` | `managerMutation` | 発行元staffを再検証し、同じ組織人物の全店舗で使うLINE連携リンクを発行する |
| `api.line.mutations.sendInvite` | `managerMutation` | 発行元staffを再検証し、同じ組織人物へLINE連携案内を送る |
| `api.line.mutations.disconnectOrganizationPersonLine` | `authenticatedMutation` | 組織人物の共通LINE連携を明示解除し、その組織の全所属店舗で停止する |
| `api.staff.mutations.sendOpenRecruitmentNotifications` | `managerMutation` | `targetShopId`で指定した店舗のスタッフへ現在送れる募集通知を、actor・組織単位の再送quota内で予約する |
| `api.staff.mutations.sendCurrentShiftNotification` | `managerMutation` | `targetShopId`で指定した店舗のスタッフへ終了日が今日以降の確定シフト通知を、actor・組織単位の再送quota内かつ最大50件でdurable fanoutとして予約する。超過時は何も予約しない |
| `api.notificationOutbox.queries.listStaffNotificationHistory` | `managerQuery` | `targetShopId`で指定した店舗のスタッフへ送った通知履歴を最小DTOでページングする |

## テスト契約

| 契約 | 主担当層 | 参照先 |
|---|---|---|
| 組織人物をプラン上限より多くても全page取得でき、同一組織店舗のfilterをpagination前に適用し、別組織filterを拒否する | Convex Function Test | `convex/appOrganization/queries.test.ts` |
| filter変更でquery identityを切り替え、追加page、全店舗表示時の対象店舗選択、明示店舗とexpected orgの既存スタッフ追加Dialogへ接続する | Frontend Unit Test | `src/pages/app-staff/index.test.tsx` |
| Loading・QueryError、組織人物一覧、追加page操作を表示する | Storybook Behavior / VRT | `src/pages/app-staff/index.stories.tsx` |
| 全店舗表示から対象店舗を選び、実frontendとConvexを通してスタッフを削除した後、同じメールアドレスを管理者手入力で削除履歴の特別確認なしに再追加し、再読込後も新しいスタッフを表示する | E2E | `e2e/pages/AppStaffPage.ts`、`e2e/pages/StaffLifecyclePage.ts`、`e2e/scenarios/staff-lifecycle.test.ts`（`E2E-STAFF-01`） |
| 詳細Queryがactive・非active所属、行ごとの変更可否、解除preview、`membershipFingerprint`を完全なDTOで返す | Convex Function Test | `convex/organization/userDetailQueries.test.ts` |
| desired-setの追加だけ、解除だけ、混在、全解除を一transactionで反映し、非active所属を保持する。解除後の再追加を新しいstaffとして扱い、認可、店舗境界、件数上限、stale、request replay、異なるintentでのrequest ID再利用、open募集の回答数再計算をfail-closedにする | Convex Function Test | `convex/staff/mutations.test.ts` |
| 管理者手入力とQR承認で通常削除人物を再利用し、アカウント削除履歴だけなら新しい人物とstaffを作る。安全でない人物不整合と利用人数上限は汎用的に拒否し、旧staff、権限、credential、LINE連携を復元しない | Convex Function Test | `convex/staff/mutations.test.ts`、`convex/staffRegistration/queries.test.ts`、`convex/staffRegistration/mutations.test.ts` |
| active/readOnly managerの個別・全店舗のスタッフ所属を解除しても、管理者権限と組織人物を維持し、個別解除ではほかの店舗所属も維持する。管理者人物の組織削除と最後のactive管理者の権限解除は拒否する | Convex Function Test、Convex Scenario Test | `convex/organization/mutations.test.ts`、`convex/staff/mutations.test.ts`、`convex/organization/userDetailQueries.test.ts`、`convex/_scenario/organizationPersonRemoval.test.ts` |
| 共通の店舗所属解除処理が旧credential・LINE・通知・将来シフトを失効させ、過去履歴を保持し、削除済みstaffから提出・閲覧・通知へ進めない状態遷移を守る | Convex Scenario Test | `convex/_scenario/staffManagement.test.ts`、`convex/_scenario/securityBoundaries.test.ts`、`convex/_scenario/organizationPersonRemoval.test.ts`、`convex/_scenario/notificationHistory.test.ts` |
| 通常の組織人物削除後は同じ人物をactiveへ戻し、アカウント削除後は旧人物を維持して新しい人物を作る。どちらも新しいstaffだけを作り、旧staff、シフト提出と割当、管理者権限、ほかの店舗所属、session、magic link、LINE token、canonical LINE linkを復元しない | Convex Function / Scenario Test | `convex/staff/mutations.test.ts`、`convex/staffRegistration/mutations.test.ts`、`convex/_scenario/organizationPersonRemoval.test.ts`、`convex/_scenario/staffRegistration.test.ts` |
| チェック操作だけでは送信せず、差分なしを無効にし、解除を含む変更を正しい店舗のpreview付きで1回の確定操作から送信し、二重確認Dialogを開かず、`tooMany`、stale、二重送信を安全に扱う | Frontend Unit Test、Behavior Test | `src/components/features/UserDetail/useUserMembershipActions.test.ts`、`src/components/features/UserDetail/index.stories.tsx` |
