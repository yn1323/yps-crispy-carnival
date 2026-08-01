# シフト表

> 文書種別: feature
>
> 最終コード照合: 2026-07-23
>
> 基準commit: `b61100a680e80d154a74f576d03c53712846e062`

シフト担当者がスタッフの希望を見ながら割当を編集し、下書きを保存して、対象期間のシフトを確定する機能である。
募集の作成、一覧、削除は[シフト募集管理](shift-recruitment-management.md)が所有する。

## 保証する範囲

シフト表は、募集方式に対応した割当編集、未保存変更の確認、確定前validation、希望との食い違いの表示、保存と確定を扱う。
通知の配送完了は保証せず、確定時に永続的な通知処理を予約するところまでを扱う。

シフト終了日を過ぎた募集は、下書き保存、確定、再通知を受け付けない。
画面だけでなく、mutationも同じ日付条件と募集状態を再確認する。

## 画面と編集方式

| 画面 | 利用者ができること |
|---|---|
| `/shiftboard/<recruitmentId>?shop=<shopId>` | 希望と割当を確認し、下書きを保存し、シフトを確定する |

日ごとの募集では、PCは週単位の`ユーザー × 日付`表、SPは日別と一覧の切替を使う。
勤務区分の募集では、スタッフと勤務区分の組合せを選び、募集作成時点の勤務区分IDと時間に一致する割当だけを保存する。
時間入力の募集では、希望時間と割当時間を同じ日別画面で比較する。

募集期間外の日付は確認できても編集できない。
画面幅による操作方法の違いはあるが、保存する割当とserver-side validationは共通である。

## 未保存変更

利用者が編集後にアプリ内の戻る操作またはブラウザバックを行うと、「保存して戻る」「保存せず戻る」を選ぶ確認Dialogを表示する。
Dialogを閉じた場合は画面に留まる。

serverから届いた提出内容の更新だけでは、未保存変更として扱わない。
タブを閉じる操作とreloadでは、ブラウザ標準の離脱確認を使う。

## validationと確認事項

割当の下書き保存を拒否する違反は、`convex/shiftBoard/validation.ts`の`validateShiftAssignments`で収集する。
フロントエンドは確定Dialogを開く前に同じ純粋関数を実行し、確定操作では検証済みの内容を`saveShiftAssignments`で保存してから`confirmRecruitment`を呼ぶ。

`confirmRecruitment`自身は、募集の存在、終了日、確定または再送の状態と、保存済み割当の休業日だけを再確認する。
共通validation全体を単独で再実行するAPIではないため、直接呼び出した場合の保証を強めるかは[現行コードとの差分調査](../plans/2026-07-23_doc現行コード差分調査.md#4-コードと文書のどちらを直すか決める差分)に残す。

違反がある場合は、一覧、日付の件数badge、該当スタッフの強調を連動させる。
編集で違反を直すと表示も更新する。

希望と割当の食い違いは、確定を拒否しない「確認事項」として表示する。
未提出スタッフへの割当、休み希望の日、希望時間外、希望していない勤務区分を対象とし、同じセルに違反がある場合は拒否理由を優先する。

## 保存、確定、再通知

下書き保存は現在の割当を永続化する。
確定時は、前回の確定通知snapshotと現在の割当を比較し、変更があるスタッフだけを通知対象にする。
既存募集にsnapshotがない場合は、導入後の初回再通知だけ全員を対象にする。

同じ内容の確定または再通知は、対象店舗、募集、用途、スタッフ、文面に影響する値から作るsemantic keyへ収束する。
fanoutのcursor、lease、対象上限、再開、provider呼出し前の再確認は[Notification Outbox](notification-outbox.md)を参照する。

## Public API

| API | 用途 |
|---|---|
| `api.shiftBoard.queries.getShiftBoardData` | 募集、スタッフ、提出、割当をシフト表向けに返す。削除済み募集は`null`を返す |
| `api.shiftBoard.mutations.saveShiftAssignments` | 割当を検証して下書き保存する |
| `api.shiftBoard.mutations.confirmRecruitment` | 保存済み割当の休業日を再確認して確定し、必要な確定通知を予約する |

## コードの入口

| 責務 | 主な入口 |
|---|---|
| RouteとPage | `src/routes/_auth/shiftboard.$recruitmentId.tsx`, `src/pages/shift-board/` |
| 画面の状態遷移 | `src/components/features/ShiftBoard/` |
| 割当UI | `src/components/features/Shift/ShiftForm/` |
| 画面非依存の割当処理 | `src/domains/shift/` |
| queryとmutation | `convex/shiftBoard/queries.ts`, `convex/shiftBoard/mutations.ts` |
| 共通validation | `convex/shiftBoard/validation.ts` |
| 通知fanout | `convex/notification/fanout.ts`, `convex/notification/actions.ts` |

## 関連文書

- [シフト募集管理](shift-recruitment-management.md)
- [希望シフト提出](shift-submission.md)
- [Notification Outbox](notification-outbox.md)
