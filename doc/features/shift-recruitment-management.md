# シフト募集管理

> 文書種別: feature
>
> 最終コード照合: 2026-07-23
>
> 基準commit: `b61100a680e80d154a74f576d03c53712846e062`

シフト担当者が募集を作り、進行中と過去の募集を確認し、不要な募集を削除する機能である。
募集後の割当編集と確定は[シフト表](shift-board.md)、スタッフの提出は[希望シフト提出](shift-submission.md)が所有する。

## 機能の範囲

募集管理は、募集の作成、Dashboardでの状態別表示、論理削除を扱う。
割当の下書き、確定validation、確定通知の差分判定は扱わない。

募集削除では`recruitments.isDeleted`を設定する。
提出、割当、集計、link、sessionの関連データは物理削除せず、管理画面とスタッフ向け導線から利用できない状態にする。

## 画面と状態

| 画面 | 利用者ができること |
|---|---|
| `/dashboard?shop=<shopId>` | 募集を作成し、状態別の募集一覧を確認し、募集を削除する |
| `/shiftboard/<recruitmentId>?shop=<shopId>` | 対象募集のシフト表へ進む。詳しい挙動は[シフト表](shift-board.md)を参照する |

Dashboardは募集を次の順で表示し、空の分類は表示しない。

1. 現在のシフト
2. 要シフト調整
3. 募集中
4. 確定済み
5. 過去のシフト

現在、調整待ち、募集中、未来の確定済み募集は初期表示する。
過去の募集は存在だけを先に確認し、利用者が「過去のシフトを見る」を選んだ後にページングして取得する。

シフト終了日当日は過去に含めず、翌日から過去として扱う。
確定済み募集も削除できるが、削除前に確認する。

## 通知との境界

募集作成時は、対象スタッフへの募集通知を予約する。
提出締切日前日17:00の自動催促は、その予定時刻が募集作成時点より未来の場合だけ予約する。
提出締切翌日17:00の管理者向け確定催促も、予定時刻が未来の場合だけ予約する。詳細は[シフト確定リマインダー](shift-confirmation-reminder.md)を参照する。
募集作成の完了画面では「スタッフに通知しました」と案内するが、外部送信はNotification Outboxが非同期で行う。

募集を削除すると、進行中の通知fanoutを同じtransactionで停止する。
すでにOutboxへ入った通知も、provider呼出し直前に募集の有効性を再確認する。

lease、cursor、dedupe、再開、保持期限は[Notification Outbox](notification-outbox.md)を正本とする。

## Public API

| API | 用途 |
|---|---|
| `api.recruitment.mutations.createRecruitment` | 募集を作成し、募集通知と、予定時刻が未来にある提出催促・確定催促を予約する |
| `api.recruitment.mutations.deleteRecruitment` | 募集を論理削除し、スタッフ向け導線と未完了fanoutを失効させる |
| `api.dashboard.queries.getDashboardRecruitments` | 初期表示する現在、調整待ち、募集中、未来確定の候補を返す |
| `api.dashboard.queries.hasDashboardPastRecruitments` | 過去の募集が存在するかを返す |
| `api.dashboard.queries.getDashboardPastRecruitments` | 過去の募集を終了日の新しい順でページングして返す |
| `api.dashboard.queries.getDashboardCurrentRecruitments` | 現在日付が期間内にある確定済みシフトを返す |

管理者APIは選択店舗と所属をサーバー側で確認する。
削除済み募集は一覧とスタッフ向けデータ取得から除外する。

## コードの入口

| 責務 | 主な入口 |
|---|---|
| RouteとPage | `src/routes/_auth/dashboard.tsx`, `src/pages/dashboard/` |
| 募集の作成 | `src/components/features/Dashboard/RecruitmentManagement/` |
| 募集の一覧 | `src/components/features/Dashboard/RecruitmentBoard/` |
| 募集API | `convex/recruitment/mutations.ts`, `convex/recruitment/service.ts` |
| Dashboard query | `convex/dashboard/queries.ts` |
| 通知fanout | `convex/notification/fanout.ts` |

## 関連文書

- [シフト表](shift-board.md)
- [希望シフト提出](shift-submission.md)
- [Notification Outbox](notification-outbox.md)
- [シフト確定リマインダー](shift-confirmation-reminder.md)
