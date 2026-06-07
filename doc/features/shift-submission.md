# 希望シフト提出

スタッフがメール/LINEのリンクから希望シフトを提出する機能。店舗設定に応じて、時間指定・日ごと・勤務区分のいずれかで入力できる。過去にシフトあり週を提出している場合は、直近の曜日・時間パターンを今回の募集期間へワンクリックで反映できる。

## 関連ファイル

| 種別 | パス |
|---|---|
| 画面 | `src/pages/staff-shift-submit/index.tsx` |
| 確定シフト閲覧画面 | `src/pages/staff-shift-view/index.tsx`, `src/components/features/StaffView/ShiftViewPage/` |
| UI | `src/components/features/StaffSubmit/` |
| リンク認証 | `convex/staffAuth/mutations.ts`, `src/hooks/useStaffSession.ts`, `src/utils/staffSession.ts` |
| API | `convex/shiftSubmission/queries.ts`, `convex/shiftSubmission/mutations.ts`, `convex/shiftView/queries.ts` |
| 通知 | `convex/notification/queries.ts`, `convex/notification/templates.ts` |
| 提出方法 | `convex/_lib/submissionPattern.ts`, `convex/shop/schemas.ts` |
| 履歴パターン | `convex/_lib/previousWeeklyPattern.ts`, `src/components/features/StaffSubmit/utils/previousWeeklyPattern.ts` |

## 画面一覧

| 画面 | 概要 |
|---|---|
| `/shifts/submit?token=...` | 希望シフト提出フォーム |
| `/shifts/submit/completed` | 提出完了画面 |
| `/shifts/view?token=...` | 確定シフト閲覧画面 |

## API一覧

| API | 種別 | 概要 |
|---|---|---|
| `api.staffAuth.mutations.verifyToken` | mutation | 提出/閲覧リンクを検証し、利用できない場合は失効理由を返す |
| `api.shiftSubmission.queries.getSubmissionPageData` | query | 提出画面データ、提出方法、既存提出、前回シフトあり週パターンを取得 |
| `api.shiftSubmission.mutations.submitShiftRequests` | mutation | 提出方法別の入力を保存形式へ変換し、希望シフトを提出・再提出する |
| `api.shiftView.queries.getShiftViewData` | query | 確定シフト閲覧用に提出方法スナップショット、確定割当、定休日を取得 |

## 仕様メモ

- 前回パターンは提出明細から取得し、新しいテンプレート用テーブルは持たない。時間指定・勤務区分は `shiftSubmissionSlots`、日ごと提出は `shiftSubmissionDates` を参照する。
- 募集作成時点の提出方法を `recruitments.submissionPattern` に保存し、店舗設定を後から変えても既存募集の提出画面とバリデーションは変えない。
- `time` は提出方法内の開始/終了時間を入力範囲として使い、`shiftType` は選択された区分時間を `shiftSubmissionSlots` に保存する。勤務区分は同じ日に複数選べるが、同じ日の同じ区分は重複登録しない。
- `dateOnly` は出勤可能日だけを `shiftSubmissionDates` に保存し、時間スロットは作らない。管理側PCシフト表では日付ごとの○×テーブルで割当し、保存時は既存の `shiftAssignments` に募集時間帯全体の割当として保存する。
- 確定通知メール/LINEと確定シフト閲覧画面は募集作成時点の提出方法スナップショットを使う。`dateOnly` は通知上 `出勤` として表示し、`shiftType` は `遅番（15:00-22:00）` のように勤務区分名と時間を表示する。
- 今回募集より前の日付だけを対象に、月曜始まりで「シフトが1件以上ある最新週」を参照する。
- 全休み提出しか履歴がない、または提出経験がないスタッフには「前回と同じシフトを適用」を表示しない。
- 適用はフォーム入力だけを更新し、提出はスタッフが明示的に押す。
- 提出リンクは募集が open で、シフト開始日 0:00 JST より前まで開ける。提出・再提出は提出締切日 23:59 JST まで可能。締切後は提出済みなら閲覧のみ、未提出なら確認ダイアログ後に初回提出だけ許可する。
- リンク無効、募集削除済み、提出受付終了は提出画面の unavailable 状態として返し、それぞれ専用の Empty 表示に分ける。存在しない token、用途違い、使用済み view link、スタッフ削除済みなどは詳細を出さずリンク無効として扱う。
