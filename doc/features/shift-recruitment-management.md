# シフト募集管理

> 文書種別: feature
>
> 最終コード照合: 2026-08-14
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
| `/dashboard?org=<organizationId>&shop=<shopId>` | 明示した組織と店舗を再検証し、募集作成、状態別一覧、削除確認を扱う |
| `/shifts?org=<organizationId>` | canonicalな組織にあるactive店舗の募集を状態別にまとめ、店舗filter、募集作成、削除確認、シフト表への遷移を扱う |
| `/shifts/<recruitmentId>/board?org=<organizationId>` | 組織と募集の店舗関係を再検証し、共通アプリヘッダー配下で割当編集と確定を扱う |

Dashboardは募集を次の順で表示し、空の分類は表示しない。

1. 現在のシフト
2. 要シフト調整
3. 募集中
4. 確定済み
5. 過去のシフト

現在、調整待ち、募集中、未来の確定済み募集は初期表示する。
過去の募集は存在だけを先に確認し、利用者が「過去のシフトを見る」を選んだ後にページングして取得する。

`/shifts`は店舗数分のqueryを購読せず、組織内のactive店舗を一つのcursor familyで最後までページングしてから、募集を全店舗横断で状態別にまとめる。
店舗filterの初期値は「すべて」であり、特定店舗へ絞っても募集作成時の候補には利用可能な全店舗を残す。
一覧カードでは店舗名を表示するが、対象店舗が固定されているDashboardでは表示しない。

過去の募集は特定店舗へ絞ったときだけ、既存の店舗単位queryで遅延取得する。
「すべて」の表示で過去募集が存在する場合は、店舗へ絞ると確認できることを案内する。
全店舗の過去募集を一度に読み込まないため、初期表示の購読数とread量を増やさない。

プランの店舗上限は新規作成可否に使い、既存の上限超過店舗をread上限として隠さない。
提出率のスタッフscanが安全上限へ達した場合は分母を確定値として表示せず、下限件数とoverflowを明示する。
`recruitmentStats`が未作成の募集は提出記録の読取件数を制限し、上限へ達した提出数を下限件数として表示する。

`/shifts`から募集を作る場合は、フォームの最初に対象店舗を1店舗だけ選択する。
選んだ店舗は確認Stepにも表示し、店舗IDとURLの組織IDを募集mutationへ明示してサーバーで再検証する。
`/dashboard`では対象店舗がすでに決まっているため店舗選択Stepを省略するが、確認Stepには店舗名を表示する。

シフト終了日当日は過去に含めず、翌日から過去として扱う。
確定済み募集も削除できるが、削除前に確認する。

## 通知との境界

募集作成時は、対象スタッフへの募集通知を予約する。
提出期限の前日17:00の自動催促は、その予定時刻が募集作成時点より未来の場合だけ予約する。
提出期限の翌日17:00の管理者向け確定催促も、予定時刻が未来の場合だけ予約する。詳細は[シフト確定リマインダー](shift-confirmation-reminder.md)を参照する。
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
| `api.dashboard.queries.getDashboardCurrentRecruitments` | 現在日付が期間内にある確定シフトを返す |
| `api.appOrganization.queries.listOrganizationRecruitments` | canonicalな組織所属を検証し、active店舗と現在募集を店舗単位でページングして返す |

管理者APIは選択店舗と所属をサーバー側で確認する。
削除済み募集は一覧とスタッフ向けデータ取得から除外する。

## コードの入口

| 責務 | 主な入口 |
|---|---|
| RouteとPage | `src/routes/_auth/dashboard.tsx`, `src/pages/dashboard/`, `src/routes/_auth/shifts.tsx`, `src/pages/app-shifts/`, `src/routes/_auth/shifts_.$recruitmentId_.board.tsx`, `src/pages/app-shift-board/` |
| 募集の作成 | `src/components/features/CreateRecruitmentForm/`, `src/components/features/Dashboard/RecruitmentManagement/`, `src/components/features/OrganizationRecruitmentManagement/` |
| 募集の一覧 | `src/components/features/Dashboard/RecruitmentBoard/` |
| 募集API | `convex/recruitment/mutations.ts`, `convex/recruitment/service.ts` |
| Dashboardと組織一覧query | `convex/dashboard/queries.ts`, `convex/appOrganization/queries.ts` |
| 通知fanout | `convex/notification/fanout.ts` |

## テスト契約

| 契約 | 主担当層 | 参照先 |
|---|---|---|
| 未認証、他組織、removed所属、削除済み組織を拒否し、active店舗を固定page上限のcursorで取得でき、legacy集計とスタッフscanの上限到達を黙って正確な値にしない | Convex Function Test | `convex/appOrganization/queries.test.ts` |
| 一つの組織query familyを最後まで取得し、全店舗の募集を状態別に統合し、filterとシフト表遷移を接続する | Frontend Unit Test | `src/pages/app-shifts/index.test.tsx` |
| 選択した店舗IDと組織IDを作成・削除mutationへ渡し、店舗filter時だけ過去募集を遅延取得し、組織またはfilter変更前の完了結果を現在のDialogへ反映しない | Frontend Unit Test | `src/components/features/OrganizationRecruitmentManagement/index.test.tsx` |
| `/shifts`では店舗選択Stepを表示し、Dashboardでは省略する一方、どちらの確認Stepにも店舗名を表示する | Storybook Behavior / VRT | `src/components/features/CreateRecruitmentForm/index.stories.tsx` |
| 全店舗カードのPC・SP配置、店舗filter、Loading・Empty・QueryErrorを表示する | Storybook Behavior / VRT | `src/pages/app-shifts/index.stories.tsx`, `src/components/features/Dashboard/RecruitmentBoard/index.stories.tsx` |
| `/shifts`の初期filterが「すべて」で、対象店舗の選択から実募集作成、店舗名付きカード、共通ヘッダー付きシフト表まで実frontendとConvexを接続する | E2E | `e2e/pages/AppShiftsPage.ts`, `e2e/scenarios/first-shift-delivery.test.ts`（`E2E-SHIFT-01`） |

## 関連文書

- [シフト表](shift-board.md)
- [希望シフト提出](shift-submission.md)
- [Notification Outbox](notification-outbox.md)
- [シフト確定リマインダー](shift-confirmation-reminder.md)
