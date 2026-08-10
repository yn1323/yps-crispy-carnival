# 分析KPI蓄積基盤

運用データから内部BI向けのdimension、cycle fact、日次snapshotを作るConvex内の分析基盤です。
業務mutationは後から復元できない事実だけを`analyticsSourceEvents`へ同じtransactionで追記し、JST 03:00の夜間batchが終了済みの前日をまとめて集計します。

現在の実環境での公開状況は[リリース状態](../manual/release-status.md)を参照してください。
リポジトリへの実装と、対象deploymentでの破壊的reset、Narrow、初回日次、cron有効化は別の作業です。

## 分析契約

分析では、導入到達度と運用健全性を別の軸として扱います。

- 導入到達度は、店舗登録、初回募集、初回提出、初回確定、2回目確定の初回到達日時です。
- 運用健全性は、次回未作成、通常周期からの遅れ、通知失敗、提出低下、確定遅れ、長期無活動、判定材料不足など、同時に複数成立できるsignalです。
- North Starは、期間開始前に確定したcycle数を対象cycle数で割る「開始前確定周期率」です。
- 提出率は率だけでなく分子と分母を保存し、店舗別率の単純平均にはしません。
- 過去の対象者集合を証明できないcycleは`unavailable`とし、現在のスタッフ数で補完しません。
- 正確な`0`、分母なし、算出不能、失敗日の欠損を区別し、欠損を`0`へ置き換えません。

KPI名、基準時刻、分子、分母、除外条件は`convex/analytics/registry.ts`を正本とします。

## 更新境界

業務mutationは、PIIを含まない限定payloadを`analyticsSourceEvents`へ同じtransactionで追記します。
payload検証、event key競合、insertのいずれかが失敗した場合は、対応する業務mutationもrollbackします。

`occurredAt`はproviderが任意に指定する時刻ではなく、サービスが業務変更を受理した時刻です。
source eventはstableな`eventKey`で重複を排除し、projectionはbusiness identityとeffective timeをkeyにした絶対値upsertとして適用します。

氏名、email、電話番号、LINE user ID、提出内容、通知本文、provider raw errorはAnalytics tableへ保存しません。
個人に対応するfactには、既存のopaque IDだけを保持します。

## 夜間日次run

通常の日次処理は、一日につき一行の**run manifest**を`analyticsRuns`へ作り、次のstageを直列に進めます。

```text
sourceFacts
  -> notifications
  -> shops
  -> organizations
  -> segmentsAndService
  -> publish
```

各pageは`runId`、`stepVersion`、`stage`、pagination cursorだけをscheduled引数として受け取ります。
page mutationはrun fenceの照合、有界read、絶対値upsert、step進行、次pageの予約を一つのtransactionで行うため、成功済みpageを古いscheduled callが重ねて適用できません。

日次runは、最後に成功した日次runの`cutoffAt`から今回の`cutoffAt`までのsource eventを再適用します。
前日のsnapshotを入力にしないため、失敗日の途中処理を次の日が引き継がず、累積値もcanonical factから再計算します。

reset後の初回日次だけは、Narrow deploy後に既存の`analytics/nightly:startForDate`から即時開始します。
reset完了日のJST日付を`targetDate`、Function実行時刻を`cutoffAt`とするため、一日未満の値になり得ます。
このrunも同じstageとpublish前invariantを通り、専用statusやfieldを持たない通常の`complete`としてDashboardの期間集計と比較へ含まれます。

初回runの翌日03:00は同じ対象日のmanifestがすでにあるためno-opになります。
翌々日03:00にreset rowの`dataStartDate`を対象とする完全な一日分を初めて集計し、以降は終了済みの前日を通常どおり処理します。
初回partialを同日中に開始しなかった場合は、reset rowの`dataStartDate`が終了した後、その日を最初の完全日次として`startForDate`から開始できます。

pageで例外が発生すると、そのtransactionの書込みはrollbackします。
wrapperはrunを`failed`へ変え、安全なerror codeだけをConvex logへ出します。
error message、stack、cursor、attempt、処理件数はDBへ保存しません。

失敗した対象日は永久欠損です。
同じ日の再実行と過去日の補修は行わず、後日のrunは自分の対象日だけを作ります。
最後の成功cutoff以降に再生不能なsource factがある場合は後続runも失敗するため、codeで処理可能にするか、新しい固定境界から破壊的resetを行います。

## 破壊的resetとデータ開始日

初回構築とKPI計算versionの変更には、internal functionの**破壊的reset**を使います。
resetは許可されたAnalytics派生tableを有界削除し、現在の運用tableからdimension、所属、継続cycle候補をseedした後、固定したsource capture区間を再適用します。

resetは次の事実だけを切替前から引き継ぎます。

- `organizations.createdAt`に基づく組織登録日
- `shops._creationTime`に基づく店舗登録日
- 現在の組織、店舗、plan、所属
- reset時点で継続しているcycleの文脈

切替前の初回募集、初回提出、初回・2回目確定、通常周期、health、終了済みcycleの率は復元しません。
reset rowの`dataStartDate`はreset終了後の最初の完全なJST日、`dataStartAt`はその日の00:00です。
初回partialを公開するdaily manifestでは`dataStartDate`をreset完了日へ広げ、後続dailyもこの公開履歴の起点を引き継ぎます。
reset rowと`dataStartAt`は変更しません。

切替前から存在する組織と店舗も、登録日と現在の人数を表示できます。
店舗日次行の`kpiEligible`は、切替後に観測を始めた導入到達度の対象かどうかだけを表します。
既存店舗では`false`になりますが、切替後の現在値、health、完全なcycle rateは日次KPIへ含めます。
切替前の到達を未達として数えないため、milestone到達率の分子と分母からだけ除外します。
Dashboardでは既存店舗の登録日を表示し、切替前には正確に復元できない初回募集以降のmilestoneを「算出対象外」と表示します。

既存店舗の長期無活動は、過去の登録日ではなく`dataStartAt`を観測開始時刻として判定します。
切替直後から過去期間を無活動として扱いません。

`dataStartAt`をまたぐ継続cycleも詳細の文脈として残しますが、切替前の分母を証明できないため率は`unavailable`です。

## table

| table | 役割 |
|---|---|
| `analyticsRuns` | 排他、stale page拒否、日付単位の公開marker |
| `analyticsSourceEvents` | 業務変更と夜間projectionのdurable boundary |
| `analyticsOrganizations` | 組織の現在dimensionとmilestone |
| `analyticsShops` | 店舗の現在dimension、milestone、最新活動、通常周期 |
| `analyticsPeople` | PIIを持たない組織内unique person |
| `analyticsMemberships` | managerとstaffの有効期間、シフト対象、LINE状態 |
| `analyticsShiftCycles` | cycle単位の期間、確定、提出、通知、完全性 |
| `analyticsShiftCycleOpportunities` | cutoff時点の対象者集合と初回提出事実 |
| `analyticsDailyServiceKpis` | サービス全体の日次KPI |
| `analyticsDailyNotificationKpis` | service、shop、recruitment単位の日次通知送信・失敗数 |
| `analyticsDailyOrganizationKpis` | 組織単位の日次KPI |
| `analyticsDailyShopKpis` | 店舗単位の日次KPIとhealth signal |
| `analyticsDailySegmentKpis` | segment別の日次比較 |

日次五tableは`runId`を持ちます。
Dashboardは`status: complete`の日次runと`runId`が一致する行だけを読み、`running`または`failed`のrunが残した行を公開しません。

リポジトリの現行Narrow schemaでは、Widen期間だけ残していた旧tableと互換fieldを削除済みです。対象deploymentへは、破壊的resetとNarrow readiness確認を終えた後だけdeployします。
実行順と証跡は[Analytics rollout](../manual/analytics-rollout.md)を正本とします。

## 時刻と完全性

| 値 | 意味 |
|---|---|
| `occurredAt` | サービスが業務変更を受理した時刻 |
| `effectiveAt` | planや所属の状態が有効になった時刻 |
| `cutoffAt` | 入力半開区間とsnapshotの終端。通常は対象日の翌日00:00、初回partialはFunction実行時刻 |
| `snapshotDate` | 対象JST日。通常は日次終了時点、初回partialはreset完了日 |
| `computedAt` | 集計行を作った時刻 |

通常の日次入力は`[inputFromAt, cutoffAt)`の半開区間です。
対象日の通知はJST 00:00から`cutoffAt`までの`sentAt`とterminal `failedAt`を読み、service、shop、recruitmentの各scopeへ集計します。

cycleまたは指標の`complete`は分母を証明できること、`unavailable`は分母を証明できないことを表します。
workerの進捗を日次行の完全性で表すことはなく、publish前の安いinvariantを満たしたrunだけが`complete`になります。
初回日次の「partial」は対象時間が一日未満であることだけを指し、run statusと日次行の完全性は通常の日次と同じ`complete`です。

shopの日次行には、時点の人員、LINE状態、health signal、期間内KPIに加え、累積cycle数、累積提出率の分子と分母、累積通知送信・失敗数、確定lead timeの中央値とP90を保存します。
organizationとserviceの日次行には、到達度対象店舗数、person未接続staff数、管理者兼スタッフ数を含めます。

店舗、所属、cycle、quantileを正確に一transactionで集計できる上限は、一店舗・一組織・一cycleのscopeごとに500件です。
サービス全体の集計、publish invariant、週次監査はscopeをpageで走査し、サービス集計はorganization pageと同じtransactionで加算するため、全体500件を上限にはしません。
上限を超えた場合は不完全な値を保存せず、その日次runを失敗させます。

## 公開可否と欠損日

Dashboardは、最新のresetまたは日次runが`running`か`failed`、またはcompleteな日次runが一件もない場合に`availability: unavailable`を返します。
後の日次runが成功すると再び`available`になります。

初回partialが`complete`になると`availability: available`になり、その対象日は期間集計と比較へ通常の日次と同じように含まれます。
一日未満の集計であることを示す専用metadataやwarningは返しません。
初回publish後のDashboard metadataは、daily manifestからreset完了日の`dataStartDate`を返します。

cronが起動せず新しいrun自体がない場合は、最後の成功値と`asOf`を返せます。
起動漏れと期限超過は外部監視が検知します。

選択期間に失敗日または未起動日がある場合、期間集計は不完全な部分集合から数値を作らず`unavailable`にします。
trendは欠損日を点なしとして返し、`0`として描画しません。

## 週次maintenanceとRetention

日次publishでは、scopeの一意性、主要countと率の整合、同一`runId`、期限済みcycleの確定だけを検査します。
日次と重ならないJST月曜04:00のweekly maintenanceは、PII redactionとretentionを先に終えてから監査します。
監査errorが起きてもredactionを飛ばさない順序です。

監査は、直近7日分の保存済み日次行についてscope、率、rollup、`runId`の内部整合性をpage単位で確認します。
不整合が確定した日次runだけを`failed`へ変えます。
その後、現在のcanonical factについてtenant参照とcycle、opportunityの整合性を確認します。
現在のdimensionと所属は過去時点の状態を保持しないため、過去日をcanonical factから再計算する監査は行いません。
集計式の正しさはLogic TestとScenario Testで検証します。

opportunityの本人参照は、400日のhard deadlineを越えないよう期限の14日前からcycle単位でredactします。

| data | retention |
|---|---|
| source event | 90日 |
| cycle opportunityのperson・staff link | 400日をhard deadlineとし、14日前からredact |
| shop、organization、segmentの日次detail | 25か月 |
| service日次 | 5年 |
| failed runの途中出力 | 14日 |
| run manifest | 5年 |

組織または店舗を削除した場合、表示名は分析projectionから削除し、集計値はretention契約に従います。

## 負荷上限

- source event追加によるreadはevent key重複確認の最大1件、writeはsource eventの1件です。
- source eventの外側pageは一件ずつ処理し、一つのeventが複数scopeを持つ場合はevent内を有界pageへ分けます。
- reset cleanupは一page最大50件です。
- segment rollupは一page最大5店舗です。
- shop、organization、cycleは一transaction一scopeとし、内部readを500件でfail-closedにします。サービス全体と週次監査はpageで進めます。
- 日次の通常状態は`analyticsRuns`だけに保持し、page cursorやtransaction metricsの履歴は保存しません。

実行時間、document数、bytesは、[Analytics rollout](../manual/analytics-rollout.md)に従って対象deploymentのFunction logsと外部証跡へ記録します。

## 関連ファイル

- `convex/analytics/model.ts`
- `convex/analytics/registry.ts`
- `convex/analytics/config.ts`
- `convex/analytics/sourceEvents.ts`
- `convex/analytics/runs.ts`
- `convex/analytics/nightly.ts`
- `convex/analytics/projection.ts`
- `convex/analytics/aggregation.ts`
- `convex/analytics/invariants.ts`
- `convex/analytics/maintenance.ts`
- `convex/analytics/reset.ts`
- `convex/analytics/observability.ts`
- `convex/analytics/refs.ts`
- `convex/schema.ts`
- `convex/crons.ts`
- [分析KPI可視化アプリ](analytics-dashboard.md)
- [Analytics rollout](../manual/analytics-rollout.md)
- [Analytics夜間バッチ簡素化 実装計画](../plans/2026-08-08_Analytics夜間バッチ簡素化_実装計画.md)
