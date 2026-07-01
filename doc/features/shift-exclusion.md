# シフト対象外スタッフ

実際にはシフトを出さないスタッフ（店舗初回登録時の店舗共通アドレス等）を、シフト表示と「シフト関連通知」の対象から外す機能。スタッフ一覧の「…」メニューから個別に切り替える。LINE連携依頼・規約同意などシフト以外の通知は従来どおり送る。

## 切り替え方法・挙動

- スタッフ一覧の各行の「…」メニューから「シフト対象外にする」/「シフト対象に戻す」で切り替える（管理者本人も対象外にできる）
- 対象外スタッフは行に「シフト対象外」バッジが付き、「現在募集中のシフトを送る」「現在の確定シフトを送る」が無効になる
- 対象外スタッフは以下から除外される:
  - シフトボード（ShiftForm）・スタッフ向け確定シフト表示
  - 募集開始 / 提出催促リマインダー / 確定シフト の各通知（一括・個別手動再送・追加/メール変更/LINE follow 追送すべて）
  - ダッシュボードの提出率の母数（総スタッフ数）
- 対象外にすると発行済みのシフト用セッション・マジックリンクを失効させ、以降は古いリンク/セッションでもシフト閲覧・希望提出・確定シフト再発行ができない（スタッフ認証境界で `excludedFromShift` を弾く）。LINE連携トークンは他通知で使うため残す
- 提出率の分子（提出数）は母数を上限にクランプし、対象外スタッフの過去提出が残っても「3/2人」のような不可能な比率を表示しない
- 確定済みのシフト割当（`shiftAssignments`）は削除しない。対象に戻せば再び表示・通知される

## 関連ファイル

### バックエンド（`convex/`）

- `convex/schema.ts` — `staffs.excludedFromShift`（`v.optional(v.boolean())`）
- `convex/staff/service.ts` — `isShiftTargetStaff`（対象判定の純粋関数）
- `convex/staff/mutations.ts` — `setShiftExclusion`（フラグ切り替え＋対象外時にセッション/マジックリンク失効）
- `convex/_lib/functions.ts` — `staffSessionQuery` / `staffSessionMutation` で対象外を弾く
- `convex/staffAuth/mutations.ts` — `verifyToken`（マジックリンク→セッション発行）/ `requestReissue` で対象外を弾く
- `convex/shiftBoard/queries.ts` / `convex/shiftView/queries.ts` — シフト表示から除外
- `convex/notification/queries.ts` / `convex/notification/reminderQueries.ts` — 各シフト関連通知の対象から除外
- `convex/dashboard/queries.ts` — `getTotalStaffCount`（提出率の母数から除外）/ `responseCount` クランプ / `getDashboardStaffs`（フラグ露出）

### フロントエンド（`src/`）

- `src/components/features/Dashboard/types.ts` — `Staff.excludedFromShift`
- `src/components/features/Dashboard/StaffRoster/StaffRow.tsx` — バッジ・切り替えメニュー・通知項目の無効化
- `src/components/features/Dashboard/StaffRoster/index.tsx` — コールバック中継
- `src/components/features/Dashboard/DashboardContent/index.tsx` — `setShiftExclusion` 接続・トースト

## API 一覧

| API | 種別 | 用途 |
|---|---|---|
| `api.staff.mutations.setShiftExclusion` | mutation | 指定スタッフのシフト対象外フラグを切り替える |
