# スタッフ参加QR・承認導線

シフト担当者がスタッフの名前とシフト通知先メールアドレスを集めて入力する負担を減らすため、店舗専用QR/URLからスタッフ本人が参加申請できる機能。スタッフ本人がメールに届いた確認コードを入力した時点で申請になり、シフト担当者の承認後に正式スタッフとして登録され、法務同意と通知導線へ接続する。

## 関連ファイル

- `convex/staffRegistration/httpActions.ts` / `convex/http.ts` — 確認コードの送信・照合・再送のOrigin、body、Turnstile、送信頻度を検証するHTTP入口
- `convex/staffRegistration/emailVerification.ts` / `convex/staffRegistration/verificationCode.ts` — メール確認待ちの作成、確認コードの照合と再送、期限切れの削除、確認コードとdigestの生成
- `convex/staffRegistration/queries.ts` / `convex/staffRegistration/mutations.ts` / `convex/staffRegistration/schemas.ts` — 登録リンク、内部申請作成、承認/却下、確認コードの入力値の正規化
- `convex/organization/audit.ts` — 登録リンク再発行の組織監査action。tokenとURLは記録しない
- `convex/staffRegistration/service.ts` — DashboardとAction Inboxで共有する承認可否判定
- `convex/staffRegistration/notificationQueries.ts` / `convex/staffRegistration/actions.ts` / `convex/crons.ts` — 承認待ち申請のシフト担当者向け日次通知、確認コードメールの送信、期限切れの確認待ちの削除
- `convex/schema.ts` — `shopRegistrationLinks` / `staffRegistrationEmailVerifications` / `staffRegistrationRequests` と dashboard onboarding dismissal、通知用index
- `convex/legal/service.ts` — 登録時同意の正式スタッフへのコピー
- `convex/line/actions.ts` / `convex/notification/templates.ts` — 承認後LINE連携メール文脈、承認待ち通知文面、確認コードメールの文面
- `src/pages/staff-registration/` — スタッフ登録ページ
- `src/components/features/StaffRegistration/` / `src/components/shared/TurnstileWidget/` — 登録フォーム、HTTP送信、bot確認、メールtypo警告、確認表示、確認コードの入力と再送、再読み込み後の入力待ちの復元
- `convex/staff/queries.ts` / `convex/staff/mutations.ts` — 同じ組織で対象店舗に所属していない人物の取得と、人物IDを固定した店舗スタッフ追加
- `convex/organization/personProfile.ts` — 組織人物と同じ人物に紐づく有効なスタッフの氏名・シフト連絡先を更新する
- `convex/_lib/shopManagerRecipients.ts` — 店舗の有効管理者について、組織人物を正本に通知先とLINE連携を解決する
- `src/components/features/Dashboard/StaffManagement/StaffInvitationDialog.tsx` / `OrganizationPeopleCandidateList.tsx` / `useStaffInvitation.ts` / `StaffRegistrationLinkPanel/` — 追加方法のカード選択と詳細表示、同じ組織の登録済みスタッフ候補、店舗専用登録リンクの取得、QR/URL表示
- `src/components/features/Dashboard/StaffRegistrationRequestManagement/` — スタッフ参加申請の取得、Dashboardの要対応カード、承認/却下、利用人数上限案内
- `src/components/features/ActionInbox/` — Dashboardと`/actions`で共有する申請カードと確認Dialog
- `convex/appOrganization/actionInboxQueries.ts` / `src/pages/app-actions/useActionInboxController.ts` — Action Inboxの承認待ち申請とDashboard共通の承認可否
- `src/components/features/UserDetail/UserInformationTab.tsx` / `UserInformationDialog.tsx` / `useUserProfileUpdate.ts` — 氏名・シフト連絡先の編集とログイン方法との境界説明

## 画面一覧

| 画面 | 役割 |
|---|---|
| ダッシュボード | 「スタッフを追加する」から追加方法を選ぶダイアログを開く。届いた参加申請は「要対応」の件数行を開き、共通カードから承認または確認後に却下する |
| `/actions` | Dashboardと同じカード・承認可否で、組織または店舗scopeの承認待ち申請を承認/却下する |
| `/staff/register` | スタッフが名前・シフト通知先メールアドレス・利用規約/プライバシーポリシー同意を入力し、そのメールアドレスに届いた6桁の確認コードを入力して申請する。同じページの中で、入力、確認、確認コードの入力、完了の順に表示が切り替わる |
| 「スタッフを追加」ダイアログ | 最初に表示されるカードから「スタッフ本人に登録してもらう」「管理者が情報を入力して追加する」「組織から探して追加する」を選ぶ。登録済みスタッフのカードは店舗数にかかわらず表示し、選択後に同じ組織で対象店舗に未所属の候補を取得する。候補には別店舗に所属するスタッフと所属店舗のないスタッフを含み、候補がなければ空状態を表示する。各方法の詳細から追加方法へ戻ることができ、同じ開閉セッション中は手入力の下書きを保持し、閉じて開き直したときは初期状態へ戻す。本人登録では現在のQR/URLを表示し、明示確認後に登録リンクを再発行できる。表示・コピーするURLには、LINEで共有されても端末の既定ブラウザで開くよう`openExternalBrowser=1`を付け、カメラで読むQRには付けない。再発行すると旧QR、送付済みURL、開いている旧登録画面から新しい申請はできなくなるが、申請済みのスタッフには影響しない。手入力が削除済み人物と同じ正規化メールアドレスに一致しても削除履歴の確認へ分岐せず、通常のスタッフ追加として完了する。本人登録は申請後の管理者承認で完了し、削除済み人物に一致する申請も同じ承認操作で通常追加する。登録済みスタッフは対象店舗へ直接追加する |

## API一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.staffRegistration.queries.getRegistrationPageData` | query | 登録ページの店舗名と法務文書情報を取得 |
| `POST /staff-registration/verification/start` | Convex HTTP Action | Origin、JSON body、Turnstile、送信頻度を検証して入力内容を確認待ちとして受け付け、確認コードのメールを送る。ブラウザへ引換tokenを返す |
| `POST /staff-registration/verification/confirm` | Convex HTTP Action | 引換tokenと確認コードを照合し、合えば参加申請を受け付ける |
| `POST /staff-registration/verification/resend` | Convex HTTP Action | 引換tokenの確認待ちへ、新しい確認コードを送り直す |
| `internal.staffRegistration.mutations.checkSubmissionIngressRateLimit` | internalMutation | Siteverify前にglobalと設定済みの信頼できるIPのhash単位で受付頻度を制限する |
| `internal.staffRegistration.mutations.checkSubmissionRateLimit` | internalMutation | Turnstile通過後、有効な登録linkと正規化メールのhash単位で受付頻度を制限する |
| `internal.staffRegistration.emailVerification.start` | internalMutation | 確認待ちを作り、確認コードの送信先を返す。利用不能なlink・店舗・契約状態と、同じ宛先への60秒以内の送信を結果で区別する |
| `internal.staffRegistration.emailVerification.confirm` | internalMutation | 確認コードのdigestを照合し、合えばメール確認済みの参加申請を作って確認待ちを削除する。違えば失敗回数を数える |
| `internal.staffRegistration.emailVerification.resend` | internalMutation | 送信間隔、1回の申請あたりの送信数、メールアドレス別の1日の上限を確認し、確認コードのdigestを差し替える |
| `internal.staffRegistration.emailVerification.releaseFailedSend` | internalMutation | メールを送れなかったとき、初回の送信なら確認待ちを削除し、再送なら送信間隔の制限を解除する。失敗した送信より後に再送が済んでいれば何も変えない |
| `internal.staffRegistration.emailVerification.checkIngressRateLimit` | internalMutation | 照合と再送の受付頻度を、globalと設定済みの信頼できるIPのhash単位で制限する |
| `internal.staffRegistration.emailVerification.pruneExpired` | internalMutation | 確認コードの期限切れから1時間を過ぎた確認待ちを、1時間ごとに削除する |
| `internal.staffRegistration.actions.sendVerificationCodeEmail` | internalAction | 確認コードのメールをメールproviderへ直接送る |
| `internal.staffRegistration.mutations.submitRegistrationRequest` | internalMutation | メール確認済みの参加申請を作る内部入口。E2Eの代替とテストの前提作成だけが呼ぶ |
| `api.staffRegistration.queries.getPendingRequests` | query | シフト担当者向けに自店舗の承認待ち申請と承認可否を取得する。通常削除人物は再利用、アカウント削除履歴だけなら新規人物として承認可能にし、安全でない人物不整合は汎用的な承認不可状態へ寄せる。利用人数上限は承認mutationで再検証する |
| `api.appOrganization.actionInboxQueries.getActionInbox` | query | Action Inboxへ承認待ち申請を投影し、Dashboardと同じ承認可否を返す |
| `api.staffRegistration.mutations.approveRequest` | mutation | 申請を承認し、正式スタッフ作成・同意コピー・通知予約を行う。同じ正規化メールアドレスの通常削除人物はactiveへ戻し、アカウント削除履歴だけなら新しい組織人物を作成して、新しいstaff IDで通常追加する |
| `api.staffRegistration.mutations.rejectRequest` | mutation | 申請を却下する |
| `api.staffRegistration.queries.getActiveRegistrationLink` | query | 店舗の現在有効な登録リンクIDとURLを取得する |
| `api.staffRegistration.mutations.ensureShopRegistrationLink` | mutation | 有効な登録リンクがなければ作成し、現在のリンクIDとURLを返す |
| `api.staffRegistration.mutations.rotateShopRegistrationLink` | mutation | 画面が確認したリンクIDを再検証し、旧リンクの失効と新リンクの発行を同じtransactionで行う。同じ再発行要求のretryでは新しいリンクを増やさず現在値を返す |
| `api.staff.mutations.addStaffs` | mutation | 管理者手入力でスタッフを追加する。同じ正規化メールアドレスの通常削除人物はactiveへ戻し、アカウント削除履歴だけなら新しい組織人物を作成して、新しいstaff IDで通常追加する |
| `api.staff.queries.listOrganizationPeopleAvailableForShop` | query | 同じ組織の有効人物から、対象店舗に所属していない候補を取得 |
| `api.staff.mutations.addOrganizationPersonToShop` | mutation | 選択した組織人物を人物IDで再検証し、対象店舗のスタッフとして追加 |
| `api.organization.mutations.updatePersonProfile` | mutation | 組織人物と同じ組織で紐づく有効なスタッフの氏名・シフト連絡先を更新 |
| `api.dashboard.mutations.dismissOnboarding` | mutation | ダッシュボードチュートリアル終了をDB保存 |
| `internal.staffRegistration.actions.sendOwnerDailyDigest` | internalAction | 毎日17:00 JSTに承認待ち申請がある店舗で、対象店舗にスタッフとして所属するactive管理者へ通知 |
| `internal.staffRegistration.notificationQueries.listPendingRequestShopIdsPage` | internalQuery | 直近24時間以内に作成された承認待ち申請がある店舗IDをページング取得 |
| `internal.staffRegistration.notificationQueries.getOwnerDigestTargetForShop` | internalQuery | 店舗名、ダッシュボードURL、有効管理者のシフト連絡先、同一人物の店舗スタッフに紐づくLINE連携状態を取得 |

## 補足

- メールアドレスの到達は、確認コードで確かめる。  入力内容を送ると、そのメールアドレスに6桁の数字の確認コードが届き、登録画面へ入力して合った時点で初めて承認待ちの申請になる。  それまでの入力内容は確認待ちとして別のテーブルに持ち、シフト担当者の画面には出さない。
- 確認コードの有効期限は10分で、入力を5回間違えたコードは使えなくなる。  再送すると新しいコードに差し替わり、古いコードはその場で使えなくなる。  形式が違う入力（桁数の不足や数字以外）は照合せず、失敗回数に数えない。
- HTTP Actionは確認コードを全角、半角、その混在のどれでも受け付け、空白とハイフンを取り除いてから照合する。  そろえる処理は`convex/staffRegistration/schemas.ts`に置き、画面とHTTP Actionで同じものを使う。
- 登録画面の確認コードの入力欄は数値入力（`type="number"`）にし、6桁そろった時点で「申請する」を押さなくても照合へ進む。  数値入力に何を打てるかはブラウザに任せ、画面では厳密に制限しない。
- 確認コードの入力画面には、メールの送信元アドレス（`noreply@shiftori.app`）を表示する。  送信元アドレスを変える場合は、この画面の表示も合わせて変える。
- 確認コードのメールは待たずに送る。  同じ店舗の同じメールアドレスへの送信は60秒に1通までとし、1回の申請で送れるのは初回を含めて5通までである。  再送も、受付と同じメールアドレス別の1日の上限を消費する。
- 確認コードのメールは通知Outboxを通さず、HTTP Actionからメールproviderへ直接送る。  宛先はまだスタッフではなく、届かなければ本人が登録画面から再送するため、通知履歴と要対応Inboxには記録しない。  配信停止に登録されたメールアドレスには送らず、応答は送れた場合と同じにする。  メールを送れなかった場合はエラーを返す。  初回の送信なら確認待ちを削除し、再送なら送信間隔の制限を解除して、60秒を待たずに送り直せるようにする。
- 確認コードと、ブラウザへ返す引換tokenは、SHA-256のdigestだけを保存する。  引換tokenは確認コードを送ったブラウザだけが持ち、照合と再送の両方で必須にする。  メールアドレスを知っているだけの第三者は、他人の確認待ちの失敗回数や送信回数を消費できない。
- 確認コードのメールには、店舗名、確認コード、有効期限、心当たりがない場合の案内だけを書く。  申請者が入力した名前は載せず、第三者の宛先へ任意の文面を送る手段にしない。
- 登録画面は、確認コードの入力待ちを同じタブのsessionStorageに持つ。  メールアプリへ切り替えて戻ったときに再読み込みされても、確認コードの入力から続けられる。  入力画面へ戻って同じ名前とメールアドレスのまま進んだ場合は送り直さず、届いている確認コードの入力へ戻る。  再送の上限に達した後は、同じ内容のまま進んでも新しい確認コードを送り直す。
- 利用規約とプライバシーポリシーへの同意は入力画面のチェックで受け、同意した文書の版を確認待ちへ保存する。  同意の時刻は、確認コードが合って申請になった時刻を記録する。
- 確認が済まなかった名前とメールアドレスは、確認コードの期限切れから1時間後に削除する。  確認が済んだ場合は、申請を作ると同時に確認待ちを削除する。
- `staffRegistrationRequests.emailVerifiedAt`は確認コードが合った時刻で、確認コードの導入前に作られた申請は持たない。  導入前の承認待ち申請は、そのまま承認または却下できる。
- メール誤入力対策として、形式チェック、よくあるtypo警告、送信前の大きな確認表示も引き続き行う。
- QR登録で同意済みのスタッフには、承認後に法務同意メールを送らない。
- 手入力追加は従来通り、法務同意メール・LINE連携メール・募集中シフト通知を送る。Dashboardでは追加完了時に案内通知を送ったことを明示する。
- 管理者手入力とQR申請の承認は、同じ正規化メールアドレスの削除済み人物に一致しても削除履歴の特別確認を表示せず、通常のスタッフ追加として完了する。
- 通常削除後の再追加では同じ`organizationPeople`をactiveへ戻し、今回の手入力または承認済み申請の氏名・正規化メールアドレスを現在の人物情報へ反映して、新しいstaff IDを作る。アカウント削除済みuserに紐づく人物はactiveへ戻さず、新しい`organizationPeople`とstaffを作る。どちらも旧staffの表示情報、シフト提出と割当、管理者権限、ほかの店舗所属、session、magic link、LINE token、canonical LINE linkを復元しない。
- 店舗所属だけを解除し、組織人物がactiveのままであれば、組織人物のcanonical LINE連携は保持され得る。組織から人物を削除した後の再追加ではcanonical LINE連携を復元せず、本人による新しいLINE連携を必要とする。
- 人物とstaffの対応が安全に一意解決できない不整合、同一メールの人物履歴が走査上限を超える場合、利用人数上限では、削除履歴や存在状態を示さない汎用的な追加・承認不可結果へ寄せ、person、staff、通知予約を部分的に変更しない。
- 再追加は既存の人物状態、staff ID、正規化メールアドレスindexで表現できるため、schema変更とbackfillを必要としない。
- rolling deployでは、まずbackendを通常追加の直接成功へ切り替え、旧画面の`confirmReactivationPersonIds`入力を一時的に受理する。次にfrontendの特別確認を削除し、旧画面が残らないことを確認した後で互換引数を削除する。
- 登録済みスタッフの追加では、組織に登録済みの氏名、メールアドレス、組織共通のLINE連携状態を正として同じ人物を再利用する。管理者権限と既存店舗のセッションは変更しない。LINE連携済みなら追加先でも同じ連携を利用して連携案内を送らず、未連携なら追加先スタッフへ連携案内を送る。
- スタッフ登録とユーザー詳細で扱うメールアドレスは、その組織におけるシフト連絡先であり、Clerkのログイン用メールアドレスではない。
- ユーザー詳細で連絡先を変更すると、対象の`organizationPeople`と、同じ組織で同じ人物に紐づく削除前の`staffs`へ反映する。
- 本人が自分の情報を変更した場合も、`users`へ同期するのは表示名だけであり、`users.email`、Clerkのログイン方法、組織の請求先メールアドレスは変更しない。
- 参加申請を承認すると、同じ組織人物がLINE未連携の場合だけ承認済みスタッフへLINE連携案内を送り、募集中シフトがある場合は提出リンクも送る。Dashboardの完了表示は、個別の通知手段を断定せず、必要な案内通知の送信を受け付けたことを示す。
- 公開HTTP APIは、新規申請、登録済み、申請済み、承認待ち上限到達のすべてで同じように確認コードを送り、照合に成功したときも同じ受付結果を返す。登録済みメールアドレスの有無は公開しない。
- 登録リンクは再発行されるまで再利用できる。再発行では店舗ごとの有効リンクを1件に保ち、旧リンクを即時に利用不能にする。再発行前に保存された承認待ち申請は維持し、通常どおり承認または却下できる。
- 登録リンク再発行の監査では、リンク情報として店舗IDと旧・新link IDを記録し、tokenと登録URLを含めない。別店舗link、重複active link、古い権限状態では副作用を作らない。
- 確認画面のセキュリティ確認（Turnstile）は、操作が必要な場合だけ確認欄を表示する。  確認中、確認欄の操作待ち、完了を確認欄の上に表示し、15秒以内に終わらない場合や失敗した場合は、通信環境の切替と管理者による手入力登録を案内して「もう一度確認する」を表示する。  15秒を過ぎても確認は止めず、遅れて完了すればそのまま申請できる。  確認の前に申請するを押した場合は、確認後にもう一度押すよう案内する。  時間切れと失敗の理由は`security_check_issue`として計測する。
- 公開HTTP APIは3つのrouteとも、許可Origin、`application/json`、8 KiB以下のbody、server-side schemaを検証してから内部mutationを呼ぶ。確認コードの送信では、Turnstileの`staff_registration` actionとhostnameも検証する。照合と再送ではTurnstileを使わず、引換tokenを必須にすることと頻度制限で、総当たりと連続送信を防ぐ。旧public mutationと、確認コードを使わずに申請を受け付けていた旧routeは公開しない。
- 受付頻度は、生値を保存せずSHA-256化した登録link scope、登録linkと正規化メールの組み合わせ、globalで制限する。`STAFF_REGISTRATION_TRUSTED_IP_HEADER=cf-connecting-ip`を設定し、ingressが同headerを上書きする環境ではIP hashも併用する。未設定時や不正なheaderでは、クライアント指定の`X-Forwarded-For`を信頼せずIP制限を省略する。
- 1店舗の承認待ち申請は最大20件とし、上限到達後は受付結果だけを返して新しい申請を保存しない。Turnstileと頻度制限は自動・大量投入を抑える境界であり、登録linkを知る人による少数の手動虚偽申請はシフト担当者の承認で終端させる。
- 追加Originは`STAFF_REGISTRATION_ALLOWED_ORIGINS`へカンマ区切りで設定する。Turnstileは問い合わせフォームと同じ`VITE_TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY`を使う。
- deploy時は、先にTurnstileとOriginの環境変数を設定し、Convex HTTP routeを含むbackendを反映してからfrontendを反映する。旧画面を開いたままの利用者には再読み込みを案内し、HTTP失敗時に旧public mutationへfallbackしない。確認コードの導入では旧routeを削除するため、backendの反映からfrontendの反映までの間に旧画面から送った申請は失敗し、再読み込み後に送り直す必要がある。
- 承認待ち申請が残っている店舗には、毎日17:00 JSTに、その店舗にスタッフとして所属するactive管理者へ短い確認通知を送る。
- activeな`organizationMembers`と、同じ組織人物に紐づく対象店舗のactiveな正規`staffs`を両方一意に解決できる人物だけを通知対象にする。
  該当者が0人なら通知を送らない。
- `organizationPeople.name`と`organizationPeople.email`を通知先の正本にする。
  組織共通のLINE連携が有効かつ友だち状態ならLINEを優先し、未連携・友だち解除・Quota超過時は現在のシフト連絡先へメールで送る。
  外部送信直前にも管理者権限、店舗所属、宛先を再確認する。
- 承認待ち通知のメール / LINE CTAは申請元店舗を `shop` クエリで指定したDashboard URLを使う。
- 通知コストを抑えるため、最新の承認待ち申請から24時間（`STAFF_REGISTRATION_DIGEST_WINDOW_MS`）だけ通知する。日次cronでは通常1回だけ送られ、24時間を過ぎた申請だけが残っている場合は送らない。
- 承認待ち通知には申請者名・メールアドレス・件数は載せず、ダッシュボードリンクだけを案内する。
