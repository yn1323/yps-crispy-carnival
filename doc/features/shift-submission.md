# 希望シフト提出

スタッフがメール/LINEのリンクから希望シフトを提出する機能。店舗設定に応じて、時間指定・日ごと・勤務区分のいずれかで入力できる。過去にシフトあり週を提出している場合は、直近の曜日・時間パターンを今回の募集期間へワンクリックで反映できる。

## 関連ファイル

| 種別 | パス |
|---|---|
| 希望シフト提出画面 | `src/pages/staff-shift-submit/index.tsx` |
| 提出完了画面 | `src/pages/staff-shift-submit-completed/index.tsx` |
| 確定シフト閲覧画面 | `src/pages/staff-shift-view/index.tsx`, `src/components/features/StaffView/ShiftViewPage/` |
| 閲覧リンク再発行画面 | `src/pages/staff-shift-reissue/index.tsx`, `src/components/features/StaffShiftReissue/` |
| 提出完了・再発行ルート | `src/routes/_unregistered/shifts.submit_.completed.tsx`, `src/routes/_unregistered/shifts.reissue.tsx` |
| UI | `src/components/features/StaffSubmit/`, `src/components/features/StaffSubmit/SubmitForm/` |
| リンク認証 | `convex/staffAuth/queries.ts`, `convex/staffAuth/mutations.ts`, `src/components/features/StaffAccess/` |
| API | `convex/shiftSubmission/queries.ts`, `convex/shiftSubmission/mutations.ts`, `convex/shiftView/queries.ts` |
| 通知 | `convex/notification/queries.ts`, `convex/notification/templates.ts` |
| 提出方法 | `convex/_lib/submissionPattern.ts`, `convex/shop/schemas.ts` |
| 履歴パターン | `convex/_lib/previousWeeklyPattern.ts`, `src/components/features/StaffSubmit/previousWeeklyPattern.ts` |

## 画面一覧

| 画面 | 概要 |
|---|---|
| `/shifts/submit?token=...` | 希望シフト提出フォーム |
| `/shifts/submit/completed?recruitmentId=...` | 保存済みsubmit sessionと提出recordを照合する提出完了画面 |
| `/shifts/view?token=...` | 確定シフト閲覧画面 |
| `/shifts/reissue?recruitmentId=...` | 確定シフト閲覧リンクの再発行画面 |

## API一覧

| API | 種別 | 概要 |
|---|---|---|
| `api.staffAuth.mutations.verifyToken` | mutation | 提出/閲覧リンクを検証し、利用できない場合は失効理由を返す |
| `api.staffAuth.queries.getRecruitmentInfo` | query | 再発行可能な確定済み募集に、canonicalな募集ID、店舗名、募集期間の最小情報を返す |
| `api.staffAuth.mutations.requestReissue` | mutation | 登録メールと確定済み募集の対象スタッフが一致する場合に、新しい閲覧リンクの通知を予約する |
| `api.shiftSubmission.queries.getSubmissionPageData` | query | 提出画面データ、提出方法、既存提出、前回シフトあり週パターンを取得 |
| `api.shiftSubmission.queries.getSubmissionResult` | query | 保存済みsubmit session、募集、店舗、スタッフ、提出recordを照合し、提出完了画面用の最小結果を返す |
| `api.shiftSubmission.mutations.submitShiftRequests` | mutation | 提出方法別の入力を保存形式へ変換し、希望シフトを提出・再提出する |
| `api.shiftView.queries.getShiftViewData` | query | 確定シフト閲覧用に提出方法スナップショット、確定割当、定休日を取得 |

## 仕様メモ

- 前回パターンは提出明細から取得し、新しいテンプレート用テーブルは持たない。時間指定・勤務区分は `shiftSubmissionSlots`、日ごと提出は `shiftSubmissionDates` を参照する。
- `shiftSubmissions`は提出状態と提出時刻のheader、`shiftSubmissionSlots`はスタッフが提出した時間希望の原本、`shiftAssignments`は管理者が保存した確定対象の勤務時間を担う。  管理者の割当編集で希望原本を書き換えない。
- 募集作成時点の提出方法を `recruitments.submissionPattern` に保存し、店舗設定を後から変えても既存募集の提出画面とバリデーションは変えない。
- `time` は提出方法内の開始/終了時間を入力範囲として使い、`shiftType` は選択された区分時間を `shiftSubmissionSlots` に保存する。勤務区分は同じ日に複数選べるが、同じ日の同じ区分は重複登録しない。
- `dateOnly` は出勤可能日だけを `shiftSubmissionDates` に保存し、時間スロットは作らない。管理側PCシフト表では日付ごとの○×テーブルで割当し、保存時は既存の `shiftAssignments` に募集時間帯全体の割当として保存する。
- 確定通知メール/LINEと確定シフト閲覧画面は募集作成時点の提出方法スナップショットを使う。`dateOnly` は通知上 `出勤` として表示し、`shiftType` は `遅番（15:00-22:00）` のように勤務区分名と時間を表示する。  時間入力方式の確定閲覧は`shiftAssignments`をread-timeで正規化し、同一スタッフ・同一日・同一ポジションの完全隣接区間を一つの時間帯として返す。  読み込みだけで既存DBの行は書き換えない。
- 今回募集より前の日付だけを対象に、月曜始まりで「シフトが1件以上ある最新週」を参照する。
- 全休み提出しか履歴がない、または提出経験がないスタッフには「前回と同じシフトを適用」を表示しない。
- 適用はフォーム入力だけを更新し、提出はスタッフが明示的に押す。
- 提出リンクは募集が open で、シフト開始日 0:00 JST より前まで開ける。提出・再提出は提出期限当日 23:59 JST まで可能。提出期限後は提出済みなら閲覧のみ、未提出なら確認ダイアログ後に初回提出だけ許可する。
- 提出済みで再提出できる画面では、募集期間と提出期限の右側に「提出済み」を表示し、保存済みの状態を示す。
- リンク無効、募集削除済み、提出受付終了は提出画面の unavailable 状態として返し、それぞれ専用の Empty 表示に分ける。存在しない token、用途違い、使用済み view link、スタッフ削除済みなどは詳細を出さずリンク無効として扱う。
- スタッフsessionは発行時に`expiresAt`での削除を同じtransaction内に予約し、期限到来をDB状態の変更として購読中の画面へ反映する。期限処理は`expectedExpiresAt`が一致するsessionだけを冪等に削除する。導入前sessionや予約漏れはcron `staff-session-expiry-recover`が`by_expiresAt` indexを使うbounded batchで回収し、期限切れsession tokenを保持し続けない。
- 提出完了画面は、URLの募集IDや直前のclient遷移だけを提出済みの根拠にしない。同じ募集の保存済み`submit` sessionがあり、server側でsession、店舗、スタッフ、募集、本人の`shiftSubmissions`を照合できた場合だけ「提出が完了しました」と表示する。直接URLを開いた場合、sessionが無効な場合、提出recordがない場合は成功を表示しない。query失敗時は利用不可と混同せず、画面内から再試行できる。
- 確定シフト閲覧リンクを利用できず募集IDを復元できる場合は、閲覧画面から再発行画面へ案内する。
- 閲覧リンクから募集IDを復元できない場合は、存在しない再発行ボタンを案内せず、元のLINE・メールを開くかシフト作成担当者へ連絡するよう示す。
- 再発行画面は募集IDが欠落・不正な場合にqueryを開始しない。serverが返したcanonicalな募集IDだけを再発行mutationへ渡し、対象なしとquery失敗を別の状態で表示する。
- 再発行要求はメールアドレスと募集の一致有無にかかわらず同じ応答を返し、短時間の重複要求と連続試行を制限する。
