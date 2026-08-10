# スタッフ参加QR・承認導線

シフト担当者がスタッフの名前とシフト連絡先メールアドレスを集めて入力する負担を減らすため、店舗専用QR/URLからスタッフ本人が参加申請できる機能。申請はシフト担当者の承認後に正式スタッフとして登録され、法務同意と通知導線へ接続する。

## 関連ファイル

- `convex/staffRegistration/httpActions.ts` / `convex/http.ts` — 公開申請のOrigin、body、Turnstile、送信頻度を検証するHTTP入口
- `convex/staffRegistration/queries.ts` / `convex/staffRegistration/mutations.ts` / `convex/staffRegistration/schemas.ts` — 登録リンク、内部申請作成、承認/却下
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
- `src/components/features/Dashboard/StaffRegistrationRequestManagement/` — スタッフ参加申請の取得、モーダル、承認/却下
- `src/components/features/UserDetail/UserInformationTab.tsx` / `UserInformationDialog.tsx` / `useUserProfileUpdate.ts` — 氏名・シフト連絡先の編集とログイン方法との境界説明

## 画面一覧

| 画面 | 役割 |
|---|---|
| ダッシュボード | 「スタッフを追加する」から追加方法を選ぶダイアログを開く。届いた参加申請は、別の「申請を確認」から申請確認ダイアログを開いて承認/却下する |
| `/staff/register` | スタッフが名前・シフト連絡先メールアドレス・利用規約/プライバシーポリシー同意を入力して申請する |
| 「スタッフを追加」ダイアログ | 最初に表示されるカードから「スタッフ本人に登録してもらう」「管理者が情報を入力して追加する」「別店舗のスタッフを追加する」を選ぶ。別店舗スタッフのカードは利用可能な場合だけ表示する。本人登録は申請後の管理者承認で完了し、管理者入力と別店舗スタッフは対象店舗へ直接追加する |

## API一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.staffRegistration.queries.getRegistrationPageData` | query | 登録ページの店舗名と法務文書情報を取得 |
| `POST /staff-registration/submit` | Convex HTTP Action | Origin、JSON body、Turnstile、送信頻度を検証して参加申請を受け付ける |
| `internal.staffRegistration.mutations.checkSubmissionIngressRateLimit` | internalMutation | Siteverify前にglobalと設定済みの信頼できるIPのhash単位で受付頻度を制限する |
| `internal.staffRegistration.mutations.checkSubmissionRateLimit` | internalMutation | Turnstile通過後、有効な登録linkと正規化メールのhash単位で受付頻度を制限する |
| `internal.staffRegistration.mutations.submitRegistrationRequestFromHttp` | internalMutation | HTTP入口の検証後に参加申請を作成し、利用不能なlink・店舗・契約状態を同じ結果へ変換する |
| `api.staffRegistration.queries.getPendingRequests` | query | シフト担当者向けに自店舗の承認待ち申請を取得 |
| `api.staffRegistration.mutations.approveRequest` | mutation | 申請を承認し、正式スタッフ作成・同意コピー・通知予約を行う |
| `api.staffRegistration.mutations.rejectRequest` | mutation | 申請を却下する |
| `api.staffRegistration.mutations.ensureShopRegistrationLink` | mutation | 店舗固定の登録リンクを作成/取得 |
| `api.staff.queries.listOrganizationPeopleAvailableForShop` | query | 同じ組織の有効人物から、対象店舗に所属していない候補を取得 |
| `api.staff.mutations.addOrganizationPersonToShop` | mutation | 選択した組織人物を人物IDで再検証し、対象店舗のスタッフとして追加 |
| `api.organization.mutations.updatePersonProfile` | mutation | 組織人物と同じ組織で紐づく有効なスタッフの氏名・シフト連絡先を更新 |
| `api.dashboard.mutations.dismissOnboarding` | mutation | ダッシュボードチュートリアル終了をDB保存 |
| `internal.staffRegistration.actions.sendOwnerDailyDigest` | internalAction | 毎日17:00 JSTに承認待ち申請がある店舗の有効管理者へ通知 |
| `internal.staffRegistration.notificationQueries.listPendingRequestShopIdsPage` | internalQuery | 直近24時間以内に作成された承認待ち申請がある店舗IDをページング取得 |
| `internal.staffRegistration.notificationQueries.getOwnerDigestTargetForShop` | internalQuery | 店舗名、ダッシュボードURL、有効管理者のシフト連絡先、同一人物の店舗スタッフに紐づくLINE連携状態を取得 |

## 補足

- v1ではメール到達確認、確認コード、メールアドレス2回入力は行わない。
- メール誤入力対策は、形式チェック、よくあるtypo警告、送信前の大きな確認表示で行う。
- QR登録で同意済みのスタッフには、承認後に法務同意メールを送らない。
- 手入力追加は従来通り、法務同意メール・LINE連携メール・募集中シフト通知を送る。Dashboardでは追加完了時に案内通知を送ったことを明示する。
- 他店舗スタッフの追加では、組織に登録済みの氏名とメールアドレスを正として同じ人物を再利用する。他店舗のスタッフ所属、管理者権限、セッション、LINE連携情報は変更せず、追加先店舗のスタッフ向け案内だけを新しく送る。
- スタッフ登録とユーザー詳細で扱うメールアドレスは、その組織におけるシフト連絡先であり、Clerkのログイン用メールアドレスではない。
- ユーザー詳細で連絡先を変更すると、対象の`organizationPeople`と、同じ組織で同じ人物に紐づく削除前の`staffs`へ反映する。
- 本人が自分の情報を変更した場合も、`users`へ同期するのは表示名だけであり、`users.email`、Clerkのログイン方法、組織の請求先メールアドレスは変更しない。
- 参加申請を承認すると、承認済みスタッフへLINE連携案内を送り、募集中シフトがある場合は提出リンクも送る。Dashboardでは承認完了時に案内通知を送ったことを明示する。
- 公開HTTP APIは、新規申請、登録済み、申請済み、承認待ち上限到達のすべてで同じ受付結果を返す。登録済みメールアドレスの有無は公開しない。
- 公開HTTP APIは、許可Origin、`application/json`、8 KiB以下のbody、server-side schema、Turnstileの`staff_registration` actionとhostnameを検証してから内部mutationを呼ぶ。旧public mutationは公開しない。
- 受付頻度は、生値を保存せずSHA-256化した登録link scope、登録linkと正規化メールの組み合わせ、globalで制限する。`STAFF_REGISTRATION_TRUSTED_IP_HEADER=cf-connecting-ip`を設定し、ingressが同headerを上書きする環境ではIP hashも併用する。未設定時や不正なheaderでは、クライアント指定の`X-Forwarded-For`を信頼せずIP制限を省略する。
- 1店舗の承認待ち申請は最大20件とし、上限到達後は受付結果だけを返して新しい申請を保存しない。Turnstileと頻度制限は自動・大量投入を抑える境界であり、登録linkを知る人による少数の手動虚偽申請はシフト担当者の承認で終端させる。
- 追加Originは`STAFF_REGISTRATION_ALLOWED_ORIGINS`へカンマ区切りで設定する。Turnstileは問い合わせフォームと同じ`VITE_TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY`を使う。
- deploy時は、先にTurnstileとOriginの環境変数を設定し、Convex HTTP routeを含むbackendを反映してからfrontendを反映する。旧画面を開いたままの利用者には再読み込みを案内し、HTTP失敗時に旧public mutationへfallbackしない。
- 承認待ち申請が残っている店舗には、毎日17:00 JSTに店舗の有効管理者へ短い確認通知を送る。
- `organizationPeople.name`と`organizationPeople.email`を管理者通知の正本とし、移行途中でpersonだけ作成済みの場合も同じuserと組織のpersonを一意に確認して使う。person自体が存在しない旧`shopMembers`だけ`users.name`と`users.email`へfallbackする。
- 管理者本人を同じ店舗のスタッフとして一意に解決でき、LINEアカウントが有効かつ友だち状態である場合だけLINEへ送り、それ以外とQuota超過時は現在のシフト連絡先へメールで送る。
- 承認待ち通知のメール / LINE CTAは申請元店舗を `shop` クエリで指定したDashboard URLを使う。
- 通知コストを抑えるため、最新の承認待ち申請から24時間（`STAFF_REGISTRATION_DIGEST_WINDOW_MS`）だけ通知する。日次cronでは通常1回だけ送られ、24時間を過ぎた申請だけが残っている場合は送らない。
- 承認待ち通知には申請者名・メールアドレス・件数は載せず、ダッシュボードリンクだけを案内する。
