# 希望シフト提出

スタッフがメール/LINEのリンクから希望シフトを提出する機能。店舗設定に応じて、時間指定・日ごと・勤務区分のいずれかで入力できる。過去にシフトあり週を提出している場合は、直近の曜日・時間パターンを今回の募集期間へワンクリックで反映できる。

## 関連ファイル

| 種別 | パス |
|---|---|
| 画面 | `src/pages/staff-shift-submit/index.tsx` |
| UI | `src/components/features/StaffSubmit/` |
| API | `convex/shiftSubmission/queries.ts`, `convex/shiftSubmission/mutations.ts` |
| 提出方法 | `convex/_lib/submissionPattern.ts`, `convex/shop/schemas.ts` |
| 履歴パターン | `convex/_lib/previousWeeklyPattern.ts`, `src/components/features/StaffSubmit/utils/previousWeeklyPattern.ts` |

## 画面一覧

| 画面 | 概要 |
|---|---|
| `/shifts/submit?token=...` | 希望シフト提出フォーム |
| `/shifts/submit/completed` | 提出完了画面 |

## API一覧

| API | 種別 | 概要 |
|---|---|---|
| `api.shiftSubmission.queries.getSubmissionPageData` | query | 提出画面データ、提出方法、既存提出、前回シフトあり週パターンを取得 |
| `api.shiftSubmission.mutations.submitShiftRequests` | mutation | 提出方法別の入力を保存形式へ変換し、希望シフトを提出・再提出する |

## 仕様メモ

- 前回パターンは提出明細から取得し、新しいテンプレート用テーブルは持たない。時間指定・勤務区分は `shiftSubmissionSlots`、日ごと提出は `shiftSubmissionDates` を参照する。
- 募集作成時点の提出方法を `recruitments.submissionPattern` に保存し、店舗設定を後から変えても既存募集の提出画面とバリデーションは変えない。
- `time` は提出方法内の開始/終了時間を入力範囲として使い、`shiftType` は選択された区分時間を `shiftSubmissionSlots` に保存する。
- `dateOnly` は出勤可能日だけを `shiftSubmissionDates` に保存し、時間スロットは作らない。シフト表での本格表示・配置は次フェーズで設計する。
- 今回募集より前の日付だけを対象に、月曜始まりで「シフトが1件以上ある最新週」を参照する。
- 全休み提出しか履歴がない、または提出経験がないスタッフには「前回と同じシフトを適用」を表示しない。
- 適用はフォーム入力だけを更新し、提出はスタッフが明示的に押す。
- 提出リンクは募集が確定するまで開ける。提出・再提出は締切までに制限し、締切後は提出済みなら閲覧のみ、未提出なら締切後案内を表示する。
