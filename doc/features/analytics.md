# 分析KPI蓄積基盤

運用データから内部BI向けのdimension、cycle fact、日次snapshotを作るConvex内の分析基盤です。  
運用mutationは後から復元しにくい事実だけを`analyticsSourceEvents`へ同じtransactionで追記し、重い集計はboundedな非同期jobで行います。

現在の公開状況は[リリース状態](../manual/release-status.md)を参照してください。  
新基盤のdeploy、bootstrap、generation切替、旧データ削除は、リポジトリ実装とは別のProduction作業です。

## 分析契約

分析では、導入到達度と運用健全性を別の軸として扱います。

- 導入到達度は、店舗登録、初回募集、初回提出、初回確定、2回目確定の初回到達日時です。
- 運用健全性は、次回未作成、通常周期からの遅れ、通知失敗、提出低下、確定遅れ、長期無活動、判定材料不足など、同時に複数成立できるsignalです。
- North Starは、期間開始前に確定したcycle数を対象cycle数で割る「開始前確定周期率」です。
- 提出率は率だけでなく分子と分母を保存し、店舗別率の単純平均にはしません。
- 過去の対象者集合を証明できないcycleは`unavailable`とし、現在のスタッフ数で補完しません。
- `0`、集計待ち、`partial`、`unavailable`、対象外を区別します。

KPI名、基準時刻、分子、分母、除外条件は`convex/analytics/registry.ts`を正本とします。

## データフロー

1. 運用mutationが、PIIを含まない限定payloadのsource eventを追記します。
2. projection主jobがeventを一件ずつ読み、organization、shop、person、membership、cycleへ反映します。
3. 一つのeventが複数行の更新を必要とする場合は、最大50件ずつのcursor付き子jobへ分割します。子jobが完了するまで後続eventの適用を止め、membershipやLINE状態より後のcycle eventが先行しないようにします。
4. cycle finalization jobが、deadlineまたはclose時点の対象者と初回提出を最大50件ずつ凍結します。
5. 日次jobが通知、cycle、shop、organization、segment、serviceの順に集計します。
6. invariantを満たした日だけをcompleteにし、`latestCompleteSnapshotDate`を進めます。
7. Dashboardは`activeGeneration`だけを読み、`buildingGeneration`の途中結果を公開しません。

jobはcursor、lease、attempt、statusを保存し、同じjob keyの重複起動を防ぎます。失敗jobは原因を解消した後、保存済みphaseとcursorから明示的に再開できます。  
同日snapshotは絶対値upsertで再実行でき、途中pageを完成値として公開しません。

source eventは業務mutationと同じtransactionで追記します。  
payload検証、event key競合、insertに失敗した場合は業務mutationもrollbackしますが、追記後のprojectionや集計の失敗は業務transactionへ波及しません。

### Generationの状態遷移

`startBootstrap`は新しいgenerationを`building`にし、開始時のsource event cursorと`buildingDataStartDate`を固定して運用tableを有界走査します。  
bootstrap固有のcatch-upが完了すると`ready`へ進み、その後は共有projectionがactiveとbuildingの両generationへ同じeventを適用します。

baseline snapshotと日付・watermark固有のinvariantが完了しても、自動では切り替わりません。  
activationは、bootstrap完了、source event backlog 0件、projection子job 0件、baseline complete、invariantのsource cursor一致、failed job 0件を同じtransactionで再確認し、`activeGeneration`を明示的に切り替えます。

日次の不完全値、依存projectionの失敗、defensiveなLINE batch不完全検知などが発生したgenerationは`degraded`になります。  
building中に旧active generationが劣化した場合は、buildingの`building`・`ready`状態と旧activeの健康状態を分けて保持します。これにより再構築とcutoverを継続しつつ、Dashboardは旧activeの応答を`partial`として扱います。

同じgenerationのretryでは正確性を回復できない場合、`abandonBuildingGeneration`がpending・processing・failed jobを有界にcancelし、active generationがあれば共有projectionとbuilding開始前の状態を復元し、なければpipelineを`idle`へ戻してから対象generationを有界cleanupします。旧activeのdegraded状態は復元時にも解除しません。

invariantはsource event backlogとblocking projection子jobが0件になったbarrierでsource cursorを捕捉してから走査します。完了時にcursorが変わっていればbarrierから再走査し、同じcursor配下の未完了projectionをcutover証明にしません。

LINEのfollow、unfollowはprovider eventごとに別internal mutationで処理します。同じLINE userに紐づくactive accountは51件目まで先に読み、50件を超えていれば運用documentをpatchする前に拒否します。連携確定時も、処理後のactive account数と変更数が50件以内であることをpatch前に検証します。  
source eventのLINE batchは、最大50件のstaff ID、linked・following状態、サービス受理時刻だけを持ちます。provider timestampとevent IDは重複・順序判定だけに使い、分析上の発生時刻やpayloadへ複製しません。通常経路では`isComplete: false`を作りませんが、defensiveに受け取った場合は`analytics_line_batch_overflow`でfail-closedにし、原因確認後に新しいgenerationを再構築します。

## 新しい分析table

すべての新tableは`schemaVersion`を持ち、再構築可能な行は`generation`で分離します。

| table | 役割 |
|---|---|
| `analyticsSourceEvents` | 運用変更と非同期projectionのdurable boundary |
| `analyticsOrganizations` | グループの現在dimensionとmilestone |
| `analyticsShops` | 店舗の現在dimension、milestone、最新活動、通常周期 |
| `analyticsPeople` | PIIを持たないグループ内unique person |
| `analyticsMemberships` | managerとstaffの有効期間、シフト対象、LINE状態 |
| `analyticsShiftCycles` | cycle単位の期間、確定、提出、通知、完全性 |
| `analyticsShiftCycleOpportunities` | cutoff時点の対象者集合と初回提出事実 |
| `analyticsDailyServiceKpis` | サービス全体の日次KPI |
| `analyticsDailyNotificationKpis` | service、shop、recruitment単位の日次通知送信・失敗数 |
| `analyticsDailyOrganizationKpis` | グループ単位の日次KPI |
| `analyticsDailyShopKpis` | 店舗単位の日次KPIとhealth signal |
| `analyticsDailySegmentKpis` | 単一dimensionまたは採用済み組み合わせの日次比較 |
| `analyticsAggregationJobs` | bootstrap、projection、finalization、daily、cleanupの進捗 |
| `analyticsPipelineStates` | active/building generation、watermark、完全日、状態 |

既存の`analyticsDailyServiceSnapshots`、`analyticsDailyShopSnapshots`、`analyticsDailyEventCounts`は、新基盤のcutover後もschema上に残します。  
これら3tableのdocumentを別工程でbounded cleanupし、対象deploymentで0件を確認するまで定義を削除しません。

## 時刻と完全性

| 値 | 意味 |
|---|---|
| `occurredAt` | 登録、提出、確定などの事実が発生した時刻 |
| `effectiveAt` | planや所属の状態が有効になった時刻 |
| `cutoffAt` | 提出率の対象者集合を固定した時刻 |
| `snapshotDate` | JST日次終了時点の状態 |
| `computedAt` | 集計処理が完了した時刻 |

`complete`なcycleだけを率の上位rollupへ含めます。bootstrap開始前に作成され、履歴を完全には復元できないcycleは、finalization後も`unavailable`のまま率から除外します。`unavailable`だけを理由に日次snapshotを`partial`にはしません。

日次処理が途中停止した場合は`partial`として残し、最新完全日を更新しません。service、organization、shopのrollupと率を全page検証する日次invariantが同じsource watermarkに対して完了した後だけ、snapshotを`complete`にして最新完全日を更新します。

通常の日次snapshotは、JSTで終了済みの日だけを対象にします。bootstrap時のbaselineだけは例外で、構築開始時のsource watermarkに固定したpoint-in-time snapshotを当日の`buildingDataStartDate`へ作ります。このbaselineを一日の終了値として扱いません。

通知集計は、対象日の既存行をresetしてから通知outboxの`sentAt`とterminal `failedAt`を半開区間で最大50件ずつ走査し、service、shop、recruitmentの各scopeへ同じ送信・失敗事実を再構築します。  
通知watermarkを公開した後、対象日以前のcycle finalizationが完了するまで待ち、shop、organization、segment、service、invariant、publishの順に進みます。failed cycle jobがある日は`partial`として扱います。notification本文、宛先、provider raw errorは保存しません。

shopの日次行には、時点の人員、LINE状態、health signal、期間内KPIに加え、累積cycle数、累積提出率の分子と分母、累積通知送信・失敗数、確定lead timeの中央値とP90を保存します。  
organizationとserviceの日次行には、KPI対象店舗数、person未接続staff数、管理者兼スタッフ数を含め、invariantでshopからのrollupと照合します。

## Retention

| data | retention |
|---|---|
| source event | projection watermark通過後90日 |
| cycle fact | 25か月 |
| cycle opportunity | 400日後にpersonとstaffのlinkを削除 |
| shop、organization、segment日次 | 25か月 |
| service日次 | 5年 |
| 完了job | 90日 |
| inactive generation | active切替から14日 |

グループまたは店舗が削除された場合、表示名は分析projectionから削除し、集計値はretention契約に従います。  
氏名、email、電話番号、LINE user ID、提出内容、通知本文、provider raw errorは分析tableへ保存しません。

## 負荷上限

- source event追加によるreadはevent key重複確認の最大1件だけ、writeはsource eventの1件だけです。
- source event主consumerは、一transaction一eventです。
- staff、LINE、plan差分などのprojection子jobとcycle opportunity生成は、一transaction最大50件です。
- snapshotは、一page最大100分析行です。
- jobのlease期限切れは再取得でき、attempt上限を超えたjobは失敗状態にします。

実行時のdocument数とbytesは、[Analytics rollout](../manual/analytics-rollout.md)に従って対象deploymentで記録します。  
最大想定量でbudgetを超える場合は、batch sizeだけで隠さずquery形状またはprojection粒度を見直します。

## 関連ファイル

- `convex/analytics/model.ts`
- `convex/analytics/registry.ts`
- `convex/analytics/sourceEvents.ts`
- `convex/analytics/pipeline.ts`
- `convex/analytics/refs.ts`
- `convex/schema.ts`
- `convex/crons.ts`
- [分析KPI可視化アプリ](analytics-dashboard.md)
- [Analytics rollout](../manual/analytics-rollout.md)
- [分析KPIと内部BI再設計 実装計画](../plans/2026-08-02_分析KPIと内部BI再設計_実装計画.md)
