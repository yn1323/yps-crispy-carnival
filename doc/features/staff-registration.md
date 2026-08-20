# スタッフ参加QR・承認導線

シフト担当者がスタッフの名前とシフト通知先メールアドレスを集めて入力する負担を減らすため、店舗専用QR/URLからスタッフ本人が参加申請できる機能。申請はシフト担当者の承認後に正式スタッフとして登録され、法務同意と通知導線へ接続する。

## 関連ファイル

- `convex/staffRegistration/httpActions.ts` / `convex/http.ts` — 公開申請のOrigin、body、Turnstile、送信頻度を検証するHTTP入口
- `convex/staffRegistration/queries.ts` / `convex/staffRegistration/mutations.ts` / `convex/staffRegistration/schemas.ts` — 登録リンク、内部申請作成、承認/却下
- `convex/staffRegistration/service.ts` — DashboardとAction Inboxで共有する承認可否判定
- `convex/staffRegistration/notificationQueries.ts` / `convex/staffRegistration/actions.ts` / `convex/crons.ts` — 承認待ち申請のシフト担当者向け日次通知
- `convex/schema.ts` — `shopRegistrationLinks` / `staffRegistrationRequests` と dashboard onboarding dismissal、通知用index
- `convex/legal/service.ts` — 登録時同意の正式スタッフへのコピー
- `convex/line/actions.ts` / `convex/notification/templates.ts` — 承認後LINE連携メール文脈、承認待ち通知文面
- `src/pages/staff-registration/` — スタッフ登録ページ
- `src/components/features/StaffRegistration/` / `src/components/shared/TurnstileWidget/` — 登録フォーム、HTTP送信、bot確認、メールtypo警告、確認表示
- `convex/staff/queries.ts` / `convex/staff/mutations.ts` — 同じ組織で対象店舗に所属していない人物の取得と、人物IDを固定した店舗スタッフ追加
- `convex/organization/personProfile.ts` — 組織人物と同じ人物に紐づく有効なスタッフの氏名・シフト連絡先を更新する
- `convex/_lib/shopManagerRecipients.ts` — 店舗の有効管理者について、組織人物を正本に通知先とLINE連携を解決する
- `src/components/features/Dashboard/StaffManagement/StaffInvitationDialog.tsx` / `OrganizationPeopleCandidateList.tsx` / `useStaffInvitation.ts` / `StaffRegistrationLinkPanel/` — 追加方法のカード選択と詳細表示、別店舗スタッフ候補、店舗専用登録リンクの取得、QR/URL表示
- `src/components/features/Dashboard/StaffRegistrationRequestManagement/` — スタッフ参加申請の取得、Dashboardの要対応カード、承認/却下、利用人数上限案内
- `src/components/features/ActionInbox/` — Dashboardと`/app/actions`で共有する申請カードと確認Dialog
- `convex/appOrganization/actionInboxQueries.ts` / `src/pages/app-actions/useActionInboxController.ts` — Action Inboxの承認待ち申請とDashboard共通の承認可否
- `src/components/features/UserDetail/UserInformationTab.tsx` / `UserInformationDialog.tsx` / `useUserProfileUpdate.ts` — 氏名・シフト連絡先の編集とログイン方法との境界説明

## 画面一覧

| 画面 | 役割 |
|---|---|
| ダッシュボード | 「スタッフを追加する」から追加方法を選ぶダイアログを開く。届いた参加申請は「要対応」の件数行を開き、共通カードから承認または確認後に却下する |
| `/app/actions` | Dashboardと同じカード・承認可否で、組織または店舗scopeの承認待ち申請を承認/却下する |
| `/staff/register` | スタッフが名前・シフト通知先メールアドレス・利用規約/プライバシーポリシー同意を入力して申請する |
| 「スタッフを追加」ダイアログ | 最初に表示されるカードから「スタッフ本人に登録してもらう」「管理者が情報を入力して追加する」「別店舗のスタッフを追加する」を選ぶ。別店舗スタッフのカードは利用可能な場合だけ表示する。各方法の詳細から追加方法へ戻ることができ、同じ開閉セッション中は手入力の下書きを保持し、閉じて開き直したときは初期状態へ戻す。手入力が削除済み人物と同じ正規化メールアドレスに一致しても削除履歴の確認へ分岐せず、通常のスタッフ追加として完了する。本人登録は申請後の管理者承認で完了し、削除済み人物に一致する申請も同じ承認操作で通常追加する。別店舗スタッフは対象店舗へ直接追加する |

## API一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.staffRegistration.queries.getRegistrationPageData` | query | 登録ページの店舗名と法務文書情報を取得 |
| `POST /staff-registration/submit` | Convex HTTP Action | Origin、JSON body、Turnstile、送信頻度を検証して参加申請を受け付ける |
| `internal.staffRegistration.mutations.checkSubmissionIngressRateLimit` | internalMutation | Siteverify前にglobalと設定済みの信頼できるIPのhash単位で受付頻度を制限する |
| `internal.staffRegistration.mutations.checkSubmissionRateLimit` | internalMutation | Turnstile通過後、有効な登録linkと正規化メールのhash単位で受付頻度を制限する |
| `internal.staffRegistration.mutations.submitRegistrationRequestFromHttp` | internalMutation | HTTP入口の検証後に参加申請を作成し、利用不能なlink・店舗・契約状態を同じ結果へ変換する |
| `api.staffRegistration.queries.getPendingRequests` | query | シフト担当者向けに自店舗の承認待ち申請と承認可否を取得する。安全でない人物不整合、account deletion受付済みでは、削除履歴を示さない汎用的な承認不可状態を返す。利用人数上限は承認mutationで再検証する |
| `api.appOrganization.actionInboxQueries.getActionInbox` | query | Action Inboxへ承認待ち申請を投影し、Dashboardと同じ承認可否を返す |
| `api.staffRegistration.mutations.approveRequest` | mutation | 申請を承認し、正式スタッフ作成・同意コピー・通知予約を行う。同じ正規化メールアドレスの削除済み人物は同じ組織人物をactiveへ戻し、新しいstaff IDで通常追加する |
| `api.staffRegistration.mutations.rejectRequest` | mutation | 申請を却下する |
| `api.staffRegistration.mutations.ensureShopRegistrationLink` | mutation | 店舗固定の登録リンクを作成/取得 |
| `api.staff.mutations.addStaffs` | mutation | 管理者手入力でスタッフを追加する。同じ正規化メールアドレスの削除済み人物は同じ組織人物をactiveへ戻し、新しいstaff IDで通常追加する |
| `api.staff.queries.listOrganizationPeopleAvailableForShop` | query | 同じ組織の有効人物から、対象店舗に所属していない候補を取得 |
| `api.staff.mutations.addOrganizationPersonToShop` | mutation | 選択した組織人物を人物IDで再検証し、対象店舗のスタッフとして追加 |
| `api.organization.mutations.updatePersonProfile` | mutation | 組織人物と同じ組織で紐づく有効なスタッフの氏名・シフト連絡先を更新 |
| `api.dashboard.mutations.dismissOnboarding` | mutation | ダッシュボードチュートリアル終了をDB保存 |
| `internal.staffRegistration.actions.sendOwnerDailyDigest` | internalAction | 毎日17:00 JSTに承認待ち申請がある店舗で、対象店舗にスタッフとして所属するactive管理者へ通知 |
| `internal.staffRegistration.notificationQueries.listPendingRequestShopIdsPage` | internalQuery | 直近24時間以内に作成された承認待ち申請がある店舗IDをページング取得 |
| `internal.staffRegistration.notificationQueries.getOwnerDigestTargetForShop` | internalQuery | 店舗名、ダッシュボードURL、有効管理者のシフト連絡先、同一人物の店舗スタッフに紐づくLINE連携状態を取得 |

## 補足

- v1ではメール到達確認、確認コード、メールアドレス2回入力は行わない。
- メール誤入力対策は、形式チェック、よくあるtypo警告、送信前の大きな確認表示で行う。
- QR登録で同意済みのスタッフには、承認後に法務同意メールを送らない。
- 手入力追加は従来通り、法務同意メール・LINE連携メール・募集中シフト通知を送る。Dashboardでは追加完了時に案内通知を送ったことを明示する。
- 管理者手入力とQR申請の承認は、同じ正規化メールアドレスの削除済み人物に一致しても削除履歴の特別確認を表示せず、通常のスタッフ追加として完了する。
- 再追加では同じ`organizationPeople`をactiveへ戻し、今回の手入力または承認済み申請の氏名・正規化メールアドレスを現在の人物情報へ反映して、新しいstaff IDを作る。旧staffの表示情報は変更せず、旧staff、旧staffのシフト提出と割当、管理者権限、ほかの店舗所属、session、magic link、LINE token、canonical LINE linkは復元しない。
- 店舗所属だけを解除し、組織人物がactiveのままであれば、組織人物のcanonical LINE連携は保持され得る。組織から人物を削除した後の再追加ではcanonical LINE連携を復元せず、本人による新しいLINE連携を必要とする。
- 人物とstaffの対応が安全に一意解決できない不整合、account deletion受付済み、利用人数上限では、削除履歴や存在状態を示さない汎用的な追加・承認不可結果へ寄せ、person、staff、通知予約を部分的に変更しない。
- 再追加は既存の人物状態、staff ID、正規化メールアドレスindexで表現できるため、schema変更とbackfillを必要としない。
- rolling deployでは、まずbackendを通常追加の直接成功へ切り替え、旧画面の`confirmReactivationPersonIds`入力を一時的に受理する。次にfrontendの特別確認を削除し、旧画面が残らないことを確認した後で互換引数を削除する。
- 他店舗スタッフの追加では、組織に登録済みの氏名、メールアドレス、組織共通のLINE連携状態を正として同じ人物を再利用する。管理者権限と既存店舗のセッションは変更しない。LINE連携済みなら追加先でも同じ連携を利用して連携案内を送らず、未連携なら追加先スタッフへ連携案内を送る。
- スタッフ登録とユーザー詳細で扱うメールアドレスは、その組織におけるシフト連絡先であり、Clerkのログイン用メールアドレスではない。
- ユーザー詳細で連絡先を変更すると、対象の`organizationPeople`と、同じ組織で同じ人物に紐づく削除前の`staffs`へ反映する。
- 本人が自分の情報を変更した場合も、`users`へ同期するのは表示名だけであり、`users.email`、Clerkのログイン方法、組織の請求先メールアドレスは変更しない。
- 参加申請を承認すると、同じ組織人物がLINE未連携の場合だけ承認済みスタッフへLINE連携案内を送り、募集中シフトがある場合は提出リンクも送る。Dashboardの完了表示は、個別の通知手段を断定せず、必要な案内通知の送信を受け付けたことを示す。
- 公開HTTP APIは、新規申請、登録済み、申請済み、承認待ち上限到達のすべてで同じ受付結果を返す。登録済みメールアドレスの有無は公開しない。
- 公開HTTP APIは、許可Origin、`application/json`、8 KiB以下のbody、server-side schema、Turnstileの`staff_registration` actionとhostnameを検証してから内部mutationを呼ぶ。旧public mutationは公開しない。
- 受付頻度は、生値を保存せずSHA-256化した登録link scope、登録linkと正規化メールの組み合わせ、globalで制限する。`STAFF_REGISTRATION_TRUSTED_IP_HEADER=cf-connecting-ip`を設定し、ingressが同headerを上書きする環境ではIP hashも併用する。未設定時や不正なheaderでは、クライアント指定の`X-Forwarded-For`を信頼せずIP制限を省略する。
- 1店舗の承認待ち申請は最大20件とし、上限到達後は受付結果だけを返して新しい申請を保存しない。Turnstileと頻度制限は自動・大量投入を抑える境界であり、登録linkを知る人による少数の手動虚偽申請はシフト担当者の承認で終端させる。
- 追加Originは`STAFF_REGISTRATION_ALLOWED_ORIGINS`へカンマ区切りで設定する。Turnstileは問い合わせフォームと同じ`VITE_TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY`を使う。
- deploy時は、先にTurnstileとOriginの環境変数を設定し、Convex HTTP routeを含むbackendを反映してからfrontendを反映する。旧画面を開いたままの利用者には再読み込みを案内し、HTTP失敗時に旧public mutationへfallbackしない。
- 承認待ち申請が残っている店舗には、毎日17:00 JSTに、その店舗にスタッフとして所属するactive管理者へ短い確認通知を送る。
- activeな`organizationMembers`と、同じ組織人物に紐づく対象店舗のactiveな正規`staffs`を両方一意に解決できる人物だけを通知対象にする。
  該当者が0人なら通知を送らない。
- `organizationPeople.name`と`organizationPeople.email`を通知先の正本にする。
  組織共通のLINE連携が有効かつ友だち状態ならLINEを優先し、未連携・友だち解除・Quota超過時は現在のシフト連絡先へメールで送る。
  外部送信直前にも管理者権限、店舗所属、宛先を再確認する。
- 承認待ち通知のメール / LINE CTAは申請元店舗を `shop` クエリで指定したDashboard URLを使う。
- 通知コストを抑えるため、最新の承認待ち申請から24時間（`STAFF_REGISTRATION_DIGEST_WINDOW_MS`）だけ通知する。日次cronでは通常1回だけ送られ、24時間を過ぎた申請だけが残っている場合は送らない。
- 承認待ち通知には申請者名・メールアドレス・件数は載せず、ダッシュボードリンクだけを案内する。
