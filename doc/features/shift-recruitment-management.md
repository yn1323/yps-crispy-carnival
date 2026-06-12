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
| `api.recruitment.mutations.createRecruitment` | mutation | シフト募集を作成し、募集通知と提出締切日前日17:00の自動催促を予約する |
| `api.recruitment.mutations.deleteRecruitment` | mutation | シフト募集を論理削除し、管理画面・スタッフ向け導線から失効させる |
| `api.dashboard.queries.getDashboardRecruitments` | query | ダッシュボード用の募集一覧と提出人数/現在の有効スタッフ数を取得する。削除済み募集は返さない |
| `api.shiftBoard.queries.getShiftBoardData` | query | シフト表画面のデータを取得する。削除済み募集は `null` を返す |
| `api.shiftBoard.mutations.saveShiftAssignments` | mutation | シフト表の下書き割当を保存する |

## 仕様メモ

- 募集削除は `recruitments.isDeleted` による論理削除。提出・割当・統計・リンク・セッションの関連データは物理削除しない。
- 削除済み募集はダッシュボード一覧に表示しない。
- 削除済み募集のスタッフ向け提出リンク・閲覧リンク・再発行導線・通知用データ取得は失効扱いにする。
- 募集開始通知、スタッフ追加通知、LINE連携時通知、自動催促は同じ submit マジックリンクを再利用する。自動催促は作成時に未来の予定時刻だけ予約し、既存 open 募集へのバックフィルはしない。
- 未提出者バーは open 募集かつ未提出者がいる場合だけ表示し、手動送信は置かない。予約済み、送信済み、予約なしの状態文言のみ表示する。
- 確定済み募集も削除できる。削除前に確認ダイアログを表示する。
- シフト表（未確定）で未保存のユーザー編集がある状態で離脱（アプリ内の戻る・ブラウザバック）すると、確認なしで自動的に下書き保存してから遷移する（`useBlocker` + `src/domains/shift/isAssignmentsEqual.ts`）。シフト申請の到着などサーバー由来のデータ変化はdirty扱いにしない。確定済み募集とタブを閉じる/リロードは対象外。
- 日ごと募集のPCシフト表では、日別/一覧タブを出さず、左サイドバーで週を選び、`ユーザー × 日付` のテーブルでセル押下により勤務させる/勤務させないを切り替える。週は月曜始まりの7日固定で表示し、募集期間外の日は薄く表示して入力できない。
- 日ごと募集のSPシフト表では、日別/一覧タブを表示する。日別は募集期間内の日付チップで日付を選び、スタッフ行の `○/×` でその日の割当を切り替える。一覧は週ごとのカードで日付別に勤務するスタッフだけを表示し、期間外の日も一覧上で確認できる。
- 勤務区分募集のPCシフト表では、日別ビューに `スタッフ × 勤務区分` の表を表示し、セル押下で勤務させる/勤務させないを切り替える。
- 勤務区分募集の割当は `shiftAssignments.optionId` に募集作成時点の勤務区分IDを保存し、勤務区分の時間と一致する場合だけ保存できる。
