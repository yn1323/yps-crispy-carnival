# シフト募集管理

シフト担当者がダッシュボードからシフト募集を作成・確認・削除する機能。削除は募集単位の論理削除で、誤作成や不要になった募集を通常の管理導線とスタッフ向けリンクから失効させる。

## 関連ファイル

| 種別 | パス |
|---|---|
| 画面 | `src/pages/dashboard/index.tsx`, `src/pages/shift-board/index.tsx` |
| UI | `src/components/features/Dashboard/RecruitmentBoard/`, `src/components/features/Dashboard/DashboardContent/index.tsx`, `src/components/features/Shift/ShiftForm/`, `src/components/features/Shift/ShiftForm/ValidationErrorPanel/` |
| API | `convex/recruitment/mutations.ts`, `convex/dashboard/queries.ts`, `convex/shiftBoard/queries.ts`, `convex/shiftBoard/mutations.ts` |
| バリデーション | `convex/shiftBoard/validation.ts`（サーバー/フロント共有の純粋関数）, `src/domains/shift/buildAssignments.ts`, `src/domains/shift/assignmentIssues.ts`, `src/domains/shift/assignmentWarnings.ts`（確認事項＝クライアントのみの助言） |
| テスト | `convex/recruitment/mutations.test.ts`, `convex/shiftBoard/validation.test.ts`, `convex/shiftBoard/mutations.test.ts`, `convex/_scenario/recruitmentDeletion.test.ts`, `e2e/scenarios/recruitment-deletion.test.ts` |

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
- シフト表で未保存のユーザー編集がある状態で離脱（アプリ内の戻る・ブラウザバック）しようとすると、確認ダイアログで「保存して離脱」「保存せず離脱」を選ばせる。ダイアログを閉じるとその場に留まる（`useBlocker` + `src/domains/shift/isAssignmentsEqual.ts`）。シフト申請の到着などサーバー由来のデータ変化はdirty扱いにしない。タブを閉じる/リロード時はブラウザ標準の離脱確認のみ表示する。
- 日ごと募集のPCシフト表では、日別/一覧タブを出さず、左サイドバーで週を選び、`ユーザー × 日付` のテーブルでセル押下により勤務させる/勤務させないを切り替える。週は月曜始まりの7日固定で表示し、募集期間外の日は薄く表示して入力できない。
- 日ごと募集のSPシフト表では、日別/一覧タブを表示する。日別は募集期間内の日付チップで日付を選び、スタッフ行の `○/×` でその日の割当を切り替える。一覧は週ごとのカードで日付別に勤務するスタッフだけを表示し、期間外の日も一覧上で確認できる。
- 勤務区分募集のPCシフト表では、日別ビューに `スタッフ × 勤務区分` の表を表示し、セル押下で勤務させる/勤務させないを切り替える。
- 勤務区分募集の割当は `shiftAssignments.optionId` に募集作成時点の勤務区分IDを保存し、勤務区分の時間と一致する場合だけ保存できる。
- シフト確定時のバリデーションは二重防御。確定ボタン押下時にフロントで `validateShiftAssignments`（`convex/shiftBoard/validation.ts`、全件収集型の純粋関数）を実行し、エラーがあれば確認ダイアログを開かずシフト表上部にエラー一覧パネルを表示する。サーバー（`saveShiftAssignments` / `confirmRecruitment`）も同じ関数で全違反を収集し、構造化 `ConvexError`（`{ code: "SHIFT_ASSIGNMENT_VALIDATION", issues }`）で返す。構造化エラー以外は従来どおりtoast表示。
- エラー一覧の行クリックで該当日付の日別ビューへジャンプし、該当スタッフ行を赤くハイライトする。DateRailの該当日には件数バッジを表示する。エラー検出後はシフト編集のたびに再検証し、修正するとエラー一覧・ハイライトがライブに減っていく。
- 確定をブロックしない「確認事項」（ワーニング、オレンジ）も同じ仕組みで表示する。`computeAssignmentWarnings`（`src/domains/shift/assignmentWarnings.ts`、クライアントのみの純粋関数）が希望と割当の食い違いを検出する: 未提出スタッフが勤務（`NOT_SUBMITTED`）/ 休み希望の日に勤務（`OFF_REQUEST`）/ 希望時間の枠外にはみ出した勤務（`OUTSIDE_REQUESTED_TIME`・時間募集）/ 希望していない勤務区分（`UNREQUESTED_SHIFT_TYPE`・勤務区分募集）。1セルあたり最大1件。
- 確認事項は確定をブロックせず、確認ダイアログ内のサマリーと盤面のオレンジパネル・バッジ・行ハイライトで知らせる（同セルにエラーがあれば赤を優先）。希望可能枠の判定は「枠をはみ出したときだけ」警告し、枠内で短く割り当てるのは正常扱い。
