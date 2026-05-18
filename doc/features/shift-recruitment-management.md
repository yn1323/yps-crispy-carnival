# シフト募集管理

シフト担当者がダッシュボードからシフト募集を作成・確認・削除する機能。削除は募集単位の論理削除で、誤作成や不要になった募集を通常の管理導線とスタッフ向けリンクから失効させる。

## 関連ファイル

| 種別 | パス |
|---|---|
| 画面 | `src/pages/dashboard/index.tsx`, `src/pages/shift-board/index.tsx` |
| UI | `src/components/features/Dashboard/RecruitmentBoard/`, `src/components/features/Dashboard/DashboardContent/index.tsx`, `src/components/features/Shift/ShiftForm/` |
| API | `convex/recruitment/mutations.ts`, `convex/dashboard/queries.ts`, `convex/shiftBoard/queries.ts`, `convex/shiftBoard/mutations.ts` |
| テスト | `convex/recruitment/mutations.test.ts`, `convex/_scenario/recruitmentDeletion.test.ts`, `e2e/scenarios/recruitment-deletion.test.ts` |

## 画面一覧

| 画面 | 概要 |
|---|---|
| `/dashboard` | 募集一覧、募集作成、募集削除の入口 |
| `/shiftboard/$recruitmentId` | 募集期間のシフト表確認・下書き保存・確定 |

## API一覧

| API | 種別 | 概要 |
|---|---|---|
| `api.recruitment.mutations.createRecruitment` | mutation | シフト募集を作成し、募集通知を予約する |
| `api.recruitment.mutations.deleteRecruitment` | mutation | シフト募集を論理削除し、管理画面・スタッフ向け導線から失効させる |
| `api.dashboard.queries.getDashboardRecruitments` | query | ダッシュボード用の募集一覧を取得する。削除済み募集は返さない |
| `api.shiftBoard.queries.getShiftBoardData` | query | シフト表画面のデータを取得する。削除済み募集は `null` を返す |
| `api.shiftBoard.mutations.saveShiftAssignments` | mutation | シフト表の下書き割当を保存する |

## 仕様メモ

- 募集削除は `recruitments.isDeleted` による論理削除。提出・割当・統計・リンク・セッションの関連データは物理削除しない。
- 削除済み募集はダッシュボード一覧に表示しない。
- 削除済み募集のスタッフ向け提出リンク・閲覧リンク・再発行導線・通知用データ取得は失効扱いにする。
- 確定済み募集も削除できる。削除前に確認ダイアログを表示する。
- 勤務区分募集のPCシフト表では、日別ビューに `スタッフ × 勤務区分` の表を表示し、セル押下で勤務させる/勤務させないを切り替える。
- 勤務区分募集の割当は `shiftAssignments.optionId` に募集作成時点の勤務区分IDを保存し、勤務区分の時間と一致する場合だけ保存できる。
