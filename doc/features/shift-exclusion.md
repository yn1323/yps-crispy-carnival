# シフト対象外スタッフ

実際にはシフトを出さないスタッフ（店舗初回登録時の店舗共通アドレス等）を、シフト表示と「シフト関連通知」の対象から外す機能。
スタッフ詳細ページで対象店舗を選び、店舗別設定ページから店舗ごとに切り替える。
LINE連携依頼や規約同意など、シフト以外の通知は従来どおり送る。

## 切り替え方法・挙動

- Dashboardまたは組織設定のユーザー一覧からスタッフ詳細ページを開き、対象店舗を選んで「このユーザーをシフト対象とする」トグルで切り替える（管理者本人も対象外にできる）
- トグルは先に表示を切り替え、更新に失敗した場合は元へ戻す。切り替え直後から最低1000msは再操作を無効にする
- 対象外スタッフは行に「シフト対象外」バッジが付き、「募集中のシフトを再送する」「確定シフトを再送する」が無効になる
- 対象外スタッフは以下から除外される:
  - シフトボード（ShiftForm）・スタッフ向け確定シフト表示
  - 募集開始 / 提出催促リマインダー / 確定シフト の各通知（一括・個別手動再送・追加/メール変更/LINE follow 追送すべて）
  - ダッシュボードの提出率の母数（総スタッフ数）
- 対象外にすると発行済みのシフト用セッション・マジックリンクを失効させ、以降は古いリンク/セッションでもシフト閲覧・希望シフト提出・確定シフト再発行ができない（スタッフ認証境界で `excludedFromShift` を弾く）。LINE連携トークンは他通知で使うため残す
- 提出率の分子（提出数）は母数を上限にクランプし、対象外スタッフの過去提出が残っても「3/2人」のような不可能な比率を表示しない
- 確定シフトの割当（`shiftAssignments`）は削除しない。対象に戻せば再び表示・通知される

## 関連ファイル

### バックエンド（`convex/`）

- `convex/schema.ts` — `staffs.excludedFromShift`（`v.boolean()`）
- `convex/staff/service.ts` — `isShiftTargetStaff`（対象判定の純粋関数）
- `convex/staff/mutations.ts` — `setShiftExclusion`（フラグ切り替え＋対象外時にセッション/マジックリンク失効）
- `convex/_lib/functions.ts` — `staffSessionQuery` / `staffSessionMutation` で対象外を弾く
- `convex/staffAuth/mutations.ts` — `verifyToken`（マジックリンク→セッション発行）/ `requestReissue` で対象外を弾く
- `convex/shiftBoard/queries.ts` / `convex/shiftView/queries.ts` — シフト表示から除外
- `convex/notification/queries.ts` / `convex/notification/reminderQueries.ts` — 各シフト関連通知の対象から除外
- `convex/dashboard/queries.ts` — `getTotalStaffCount`（提出率の母数から除外）/ `responseCount` クランプ / `getDashboardStaffs`（フラグ露出）

### フロントエンド（`src/`）

- `src/components/features/Dashboard/types.ts` — `Staff.excludedFromShift`
- `src/components/shared/StaffListRow/` — Dashboard、組織設定、店舗詳細で共有するスタッフ行と状態バッジ
- `src/components/features/UserShopDetail/` — シフト対象トグル、楽観更新、通知操作の無効化
- `src/components/features/Dashboard/StaffManagement/` — スタッフ詳細ページへの遷移

## API 一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.staff.mutations.setShiftExclusion` | mutation | 指定スタッフのシフト対象外フラグを切り替える |
