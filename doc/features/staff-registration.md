# スタッフ参加QR・承認導線

シフト担当者がスタッフの名前とメールアドレスを集めて入力する負担を減らすため、店舗専用QR/URLからスタッフ本人が参加申請できる機能。申請はシフト担当者の承認後に正式スタッフとして登録され、法務同意と通知導線へ接続する。

## 関連ファイル

- `convex/staffRegistration/queries.ts` / `convex/staffRegistration/mutations.ts` / `convex/staffRegistration/schemas.ts` — 登録リンク、参加申請、承認/却下
- `convex/staffRegistration/notificationQueries.ts` / `convex/staffRegistration/actions.ts` / `convex/crons.ts` — 承認待ち申請のシフト担当者向け日次通知
- `convex/schema.ts` — `shopRegistrationLinks` / `staffRegistrationRequests` と dashboard onboarding dismissal、通知用index
- `convex/legal/service.ts` — 登録時同意の正式スタッフへのコピー
- `convex/line/actions.ts` / `convex/notification/templates.ts` — 承認後LINE連携メール文脈、承認待ち通知文面
- `src/pages/staff-registration/` — スタッフ登録ページ
- `src/components/features/StaffRegistration/` — 登録フォーム、メールtypo警告、確認表示
- `src/components/features/Dashboard/StaffRegistrationLinkPanel/` — シフト担当者向けQR/URL表示
- `src/components/features/Dashboard/StaffRegistrationRequests/` — スタッフ参加申請カード、モーダル、承認/却下リスト

## 画面一覧

| 画面 | 役割 |
|---|---|
| ダッシュボード | 「スタッフを追加」から店舗専用QR/URLを表示し、参加申請カードからモーダルを開いて承認/却下する |
| `/staff/register` | スタッフが名前・メール・利用規約/プライバシーポリシー同意を入力して申請する |
| スタッフ追加モーダル | 既定はQR/URL表示、補助導線として従来の手入力フォームへ切替 |

## API一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.staffRegistration.queries.getRegistrationPageData` | query | 登録ページの店舗名と法務文書情報を取得 |
| `api.staffRegistration.mutations.submitRegistrationRequest` | mutation | スタッフ本人の参加申請を作成 |
| `api.staffRegistration.queries.getPendingRequests` | query | シフト担当者向けに自店舗の承認待ち申請を取得 |
| `api.staffRegistration.mutations.approveRequest` | mutation | 申請を承認し、正式スタッフ作成・同意コピー・通知予約を行う |
| `api.staffRegistration.mutations.rejectRequest` | mutation | 申請を却下する |
| `api.staffRegistration.mutations.ensureShopRegistrationLink` | mutation | 店舗固定の登録リンクを作成/取得 |
| `api.dashboard.mutations.dismissOnboarding` | mutation | ダッシュボードチュートリアル終了をDB保存 |
| `internal.staffRegistration.actions.sendOwnerDailyDigest` | internalAction | 毎日17:00 JSTに承認待ち申請がある店舗のmanager usersへ通知 |
| `internal.staffRegistration.notificationQueries.listPendingRequestShopIdsPage` | internalQuery | 承認待ち申請がある店舗IDをページング取得 |
| `internal.staffRegistration.notificationQueries.getOwnerDigestTargetForShop` | internalQuery | 店舗名、ダッシュボードURL、通知対象manager users、manager staffのLINE連携状態を取得 |

## 補足

- v1ではメール到達確認、確認コード、メールアドレス2回入力は行わない。
- メール誤入力対策は、形式チェック、よくあるtypo警告、送信前の大きな確認表示で行う。
- QR登録で同意済みのスタッフには、承認後に法務同意メールを送らない。
- 手入力追加は従来通り、法務同意メール・LINE連携メール・募集中シフト通知を送る。
- 承認待ち申請が残っている店舗には、毎日17:00 JSTに店舗のmanager usersへ短い確認通知を送る。manager userに紐づくstaffがLINE連携済みならLINE、未連携・Quota超過・LINE送信失敗時はusers.emailへメールで送る。
- 承認待ち通知には申請者名・メールアドレス・件数は載せず、ダッシュボードリンクだけを案内する。
