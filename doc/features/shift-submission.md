# 希望シフト提出

スタッフがメール/LINEのリンクから希望シフトを提出する機能。過去にシフトあり週を提出している場合は、直近の曜日・時間パターンを今回の募集期間へワンクリックで反映できる。

## 関連ファイル

| 種別 | パス |
|---|---|
| 画面 | `src/pages/staff-shift-submit/index.tsx` |
| UI | `src/components/features/StaffSubmit/` |
| API | `convex/shiftSubmission/queries.ts`, `convex/shiftSubmission/mutations.ts` |
| 履歴パターン | `convex/_lib/previousWeeklyPattern.ts`, `src/components/features/StaffSubmit/utils/previousWeeklyPattern.ts` |

## 画面一覧

| 画面 | 概要 |
|---|---|
| `/shifts/submit?token=...` | 希望シフト提出フォーム |
| `/shifts/submit/completed` | 提出完了画面 |

## API一覧

| API | 種別 | 概要 |
|---|---|---|
| `api.shiftSubmission.queries.getSubmissionPageData` | query | 提出画面データ、既存提出、前回シフトあり週パターンを取得 |
| `api.shiftSubmission.mutations.submitShiftRequests` | mutation | 希望シフトを提出・再提出する |

## 仕様メモ

- 前回パターンは `shiftSubmissionSlots` の既存提出明細から取得し、新しいテンプレート用テーブルは持たない。
- 今回募集より前の日付だけを対象に、月曜始まりで「シフトが1件以上ある最新週」を参照する。
- 全休み提出しか履歴がない、または提出経験がないスタッフには「前回と同じシフトを適用」を表示しない。
- 適用はフォーム入力だけを更新し、提出はスタッフが明示的に押す。
