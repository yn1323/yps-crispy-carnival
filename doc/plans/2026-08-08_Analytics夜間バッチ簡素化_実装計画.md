# Analytics夜間バッチ簡素化 実装計画

作成日: 2026-08-08
状態: approved
対象: ConvexのAnalytics source fact、夜間集計、保持処理、内部Analytics API
置換対象: [分析KPIと内部BI再設計 実装計画](2026-08-02_分析KPIと内部BI再設計_実装計画.md)のgeneration、bootstrap、job recovery、cutover、rollout方式

## 1. 結論

KPI定義、締切時点の分子と分母、PIIを持たないsource fact、retention、公開前invariantは維持する。
表示するdimension、cycle、日次KPI、Dashboardの分析軸も維持する。

削る対象は、常時projection、active/building generation、汎用job table、lease、cursorの永続化、自動回収、同日retry、過去日のbackfill、日次の全件監査である。
通常処理はJST 03:00に前日一日分を直列集計し、週次に深い監査とretentionを行う二本へ縮小する。

日次処理が失敗した日は、同じ日を再実行せず永久欠損にする。
失敗した事実だけを小さなrun manifestへ残し、error message、error code、stack、cursor、attemptはDBへ保存しない。
原因はConvexのPIIを含まない構造化ログと外部監視で追跡する。

初回bootstrap state machineは廃止する。
切替時は過去のAnalytics派生データを破棄し、内部専用の`resetAnalytics`で現在dimensionと切替日時点の基準状態だけを作る。
resetが失敗した場合は途中から再開せず、原因修正後に派生データを再度消して最初から実行する。

### 1.1 解決する問題

現行`convex/analytics/pipeline.ts`は、bootstrap、continuous projection、cycle finalization、daily aggregation、generation cleanup、retention、旧table cleanup、invariantを一つの汎用job modelへ載せている。
`analyticsAggregationJobs`には多数のphase、複数cursor、lease、attempt、dependency、watermark、集計途中のaccumulatorが集まり、`analyticsPipelineStates`にもactiveとbuildingの進行を重複保存している。

`pending`は、次pageの正常待機、依存job待ち、実行予約漏れ、失敗した子job待ちを兼ねる。
毎分のrecoveryとprojection ensureが同じjobを再作成または再予約するため、停止理由と正常な待機をstatusだけで区別できない。

source event consumerはConvex pagination cursorをpipeline stateへ長期保存している。
終端cursorを保持したまま新しいeventが追加されると、再開が新規行を含むfresh queryにならず、見かけ上caught upのまま進まない経路がある。
今回の方式ではnative cursorをrun間へ持ち越さず、日付の半開区間を毎回fresh queryすることでこの原因を除く。

## 2. 確定した判断

| 論点 | 採用する契約 |
|---|---|
| 更新頻度 | JSTの夜間に前日一日分を集計する |
| 常時最新性 | 要求しない |
| 通常時の重さ | Convexの各transaction上限内であれば、直列処理と長めの夜間実行を許容する |
| 日次失敗 | その日は永久欠損にし、同日retryと後日のbackfillをしない |
| 処理中と失敗後 | `/requests`以外のAnalyticsを`unavailable`にする |
| 次日の処理 | 直前日のsnapshotを入力にせず、最後に成功したcutoff以降のcanonical factから独立して計算する |
| 過去履歴 | 既存Analyticsの履歴を移行、比較、保持しない |
| 切替前の日次値 | 作らない。推計もしない |
| 登録日 | 運用tableの作成時刻から復元し、切替前の日付も表示できる |
| generation | 廃止する |
| bootstrap | generationを構築するbootstrapは廃止し、破壊的resetへ置き換える |
| status保存 | 一日または一回のmaintenanceにつき小さなrun manifest一行だけを保存する |
| error保存 | DBへ保存しない |
| invariant | 日次publish前の安い検査と、週次の深い監査に分ける |
| retention | 維持する。週次の有界処理へまとめる |
| rollback | 派生データ削除後は旧履歴へ戻さず、新方式を修復してresetする |

## 3. 維持するデータ価値

### 3.1 KPIと締切精度

KPI名、分子、分母、基準時刻、除外条件は引き続き`convex/analytics/registry.ts`を正本とする。
率を店舗別率の単純平均へ変えず、分子合計を分母合計で割る。
`0`と算出不能を混ぜず、証明できない値を0へ補完しない。

期限内提出率と最終提出率は、締切またはclose時点の対象者集合と初回提出事実から計算する。
現在のスタッフ数を過去の分母として代用しない。
この契約を守るため、`analyticsShiftCycles`と`analyticsShiftCycleOpportunities`は残す。

### 3.2 source event

後から運用tableだけでは復元できない状態変化は、引き続き業務mutationと同じtransactionで`analyticsSourceEvents`へ追記する。
source eventを非同期のbest effortへ変えると、業務は成功したのに締切時点のfactだけが欠けるため採用しない。

`occurredAt`はprovider側の任意時刻ではなく、サービスが業務変更を受理した時刻として扱う。
任意のbackdated writeを許さず、日次runは終了済みの半開区間だけを読む。
provider timestampは重複と順序の検証にだけ使う現在の契約を維持する。

### 3.3 PII境界

氏名、email、電話番号、LINE user ID、提出内容、通知本文、provider raw errorをAnalytics tableへ追加しない。
個人単位factには既存のopaque IDだけを保持し、現在のredaction期限を維持する。
DashboardのBFF、service credential、request allowlist、response上限も変更しない。

## 4. 切替前の日付をどう扱うか

過去のAnalytics履歴を捨てても、運用tableが持つ不変の作成時刻までは失われない。
`dataStartDate`は「日次Analyticsを作り始めた日」であり、「画面に出せるすべての日付の下限」ではない。

| データ | 切替後の扱い |
|---|---|
| グループ登録日 | `organizations.createdAt`から正確にseedする |
| 店舗登録日 | `shops._creationTime`から正確にseedする |
| 登録cohort | 上記の登録日で分類できる。dataStartDateより前のcohortは一覧に出せるが、切替前milestoneを必要とする到達率は`unavailable`にする |
| 現在のグループ、店舗、所属 | reset時の運用tableから基準状態をseedする |
| 切替前の初回提出、初回確定、2回目確定 | 過去Analyticsとしては捨て、推計しない |
| 切替前に終了したcycleの提出率 | 作らない |
| 切替前の日次KPIとhealth | 作らない |
| dataStartAtをまたぐ未完了cycle | 詳細の文脈としてseedするが、切替前提出を証明できないためcycle rateは`unavailable`にし、上位rollupから除外する |
| 失敗日の日次KPI | 永久欠損にする |

店舗一覧と詳細では、`registeredAt`が`dataStartDate`より前でも表示する。
日次trendは`dataStartDate`以降だけを返す。
dataStartDateより前のcohortは、登録店舗数と登録日だけを表示できる。
初回募集以降のmilestone到達率と転換率は、dataStartDate以降に登録されたshopだけをeligibleにし、既存cohortの未観測到達を未達として数えない。
このeligible判定は導入到達度だけに使う。
既存shopもdataStartDate以降の現在値、health、完全なcycle rateには含める。

## 5. 最終状態のデータフロー

### 5.1 日次run

日次runは一日につき一行のmanifestを作り、次の順で直列に進める。

1. JSTで終了済みの前日を`targetDate`、翌日00:00を`cutoffAt`として固定する。
2. 同じ`targetDate`のrunが存在しないことと、別のdailyまたはresetが実行中でないことを確認する。
3. 最後に成功したrunの`cutoffAt`から今回の`cutoffAt`までのsource eventを、発生時刻順に絶対値upsertする。
4. 今回のcutoffまでに期限またはcloseを迎えたcycle factを確定する。
5. 対象日の通知、店舗、グループ、segment、serviceの順に日次値を絶対値で作る。
6. publish前の安いinvariantを検証する。
7. 同じrunの全出力だけを公開対象にし、manifestを`complete`へ変える。

通常phaseは次の六つへ限定する。

```text
sourceFacts
  -> notifications
  -> shops
  -> organizations
  -> segmentsAndService
  -> publish
```

cleanup、generation切替、job回収、retryを同じphase enumへ混ぜない。
retentionと深い監査は別のweekly maintenance runが所有する。

### 5.2 page処理

各pageの引数には`runId`、`stepVersion`、`stage`、Convex pagination cursor、小さなscalar accumulatorだけを渡す。
cursorやaccumulatorをDBへ保存しない。
ID配列やsource payloadをscheduled引数へ積まない。

scheduled wrapperはinternal actionとし、page本体はinternal mutationとする。
page mutationは次を一つのtransactionで行う。

- runが`running`で、`stepVersion`が呼出し時の値と一致することを確認する
- indexを使った有界readを行う
- 結果を絶対値でreplaceまたはupsertする
- `stepVersion`を進める
- 次のpageまたは次stageをscheduleする

mutationが失敗した場合、そのpageのwriteはrollbackする。
wrapperは安全な項目だけをConvex logへ出し、別mutationでrunを`failed`へ変える。
wrapper自身の予期しない停止で`running`が残った場合は、次回の日次開始が期限超過runを`failed`へ変える。
このための毎分watchdogは作らない。

### 5.3 次日の独立性

失敗runが途中まで更新したcanonical factを、そのまま次日の正本にはしない。
次日のrunは最後に`complete`になったrunのcutoffからsource eventを再適用し、失敗runが触れた範囲を冪等に収束させる。

projectionは加算差分ではなく、business identityとeffective timeをkeyにした絶対値upsertへ統一する。
同じeventを再適用しても件数や区間が二重にならないことをFunction Testで固定する。

次日は自日のsnapshotだけを作る。
失敗日のsnapshotを途中で埋めず、trendには日付の穴を残す。
累積値は前日のsnapshotへ加算せず、canonical factまたはretentionと整合するcompact baseから再計算する。

## 6. 公開のatomicity

### 6.1 run manifestを公開markerにする

generationの代わりに、日次出力へ`runId`を持たせる。
Dashboard queryは`status: complete`のrunに属する行だけを読む。

処理中の行やfailed runの行がDBに残っていても、queryからは見えない。
次のweekly retentionがfailed runの部分行を有界削除する。
日次の全行を最後に`partial`から`complete`へpatchする処理は作らない。

### 6.2 APIのavailability

`/requests`以外のAnalytics APIは、次の場合に`unavailable`を返し、古い成功値や途中値を返さない。

- resetが実行中または失敗している
- 最新の日次runが`running`または`failed`である
- publish前invariantを満たすcomplete runが一件もない

後日のrunが成功すれば、APIは再び利用可能になる。
失敗日は欠損のまま残し、失敗日を含む期間集計は不完全な部分集合から数値を作らず`unavailable`にする。
trendは欠損日を`null`または点なしとして示し、0へ置き換えない。

cron自体が起動せずrun行もない場合は、直前の成功値と`asOf`を返してよい。
所定時刻までに前日runが存在しないことは外部監視が検知する。

### 6.3 stale pageの無効化

各pageは`runId`と`stepVersion`をserver側で照合する。
古いrun、完了済みrun、失敗済みrun、すでに進んだstepの呼出しは副作用なしで終了する。
これがgeneration、lease、attemptの代わりに残す最小のcorrectness fenceである。

## 7. schemaの完成形

### 7.1 残すデータtable

| table | 残す理由 |
|---|---|
| `analyticsSourceEvents` | 切替後の非復元factと正確なcutoffの入力 |
| `analyticsOrganizations` | グループdimension、登録日、現在plan |
| `analyticsShops` | 店舗dimension、登録日、現在状態、切替後milestone |
| `analyticsPeople` | PIIを持たないunique person集計 |
| `analyticsMemberships` | managerとstaffのtime-valid所属、シフト対象、LINE状態 |
| `analyticsShiftCycles` | cycle期間、締切、確定、率の分子と分母 |
| `analyticsShiftCycleOpportunities` | cutoff時点の対象者集合と初回提出fact |
| `analyticsDailyServiceKpis` | サービス全体の日次KPI |
| `analyticsDailyNotificationKpis` | scope別の日次通知集計 |
| `analyticsDailyOrganizationKpis` | グループ単位の日次KPI |
| `analyticsDailyShopKpis` | 店舗単位の日次KPIとhealth |
| `analyticsDailySegmentKpis` | segment別の日次比較 |

`analyticsPeople`、`analyticsMemberships`、`analyticsShiftCycleOpportunities`は画面から直接読まれない。
しかし、unique person、締切時点の対象者、提出率を作るcanonical factなので、control plane簡素化と同時には削らない。

### 7.2 削除するtable

次のtableはdocumentを有界削除して0件を確認した後、schemaから削除する。

- `analyticsDailyServiceSnapshots`
- `analyticsDailyShopSnapshots`
- `analyticsDailyEventCounts`
- `analyticsAggregationJobs`
- `analyticsPipelineStates`

`analyticsAggregationJobs`と`analyticsPipelineStates`の代わりに、`analyticsRuns`一つだけを追加する。
状態保持tableは二つから一つに減り、job単位のdocumentは作らない。

### 7.3 `analyticsRuns`

`analyticsRuns`は進捗を再開するjob tableではなく、実行排他、stale page拒否、日付単位の公開markerである。

| field | 用途 |
|---|---|
| `runKey` | `daily:YYYY-MM-DD`、`reset:<sourceCaptureStartAt>:<id>`、`maintenance:YYYY-Www`の一意key |
| `kind` | `daily`、`reset`、`maintenance` |
| `status` | `running`、`complete`、`failed` |
| `calculationVersion` | 同一run内のKPI計算契約を固定する整数 |
| `dataStartDate` | 日次履歴の起点 |
| `dataStartAt` | reset終了後に始まる最初の完全なJST日の00:00 |
| `targetDate` | dailyの対象JST日。daily以外は省略 |
| `inputFromAt` | source factを再適用する半開区間の始点 |
| `cutoffAt` | 入力半開区間とsnapshotの終端 |
| `sourceCaptureStartAt` | reset用source eventの捕捉開始時刻。reset以外は省略 |
| `resetWatermarkAt` | full scan完了後に固定するreset baselineの終端。reset以外は省略 |
| `stage` | 六つの粗いstageまたはreset、maintenanceのstage |
| `stepVersion` | 重複pageとstale pageを拒否する単調増加値 |
| `startedAt` | 開始時刻 |
| `terminalAt` | completeまたはfailedになった時刻 |
| `updatedAt` | 期限超過runの判定時刻 |

DBへ保存しないfieldは次のとおりとする。

- error message、error code、stack
- pagination cursor、parent cursor、snapshot cursor
- lease token、lease期限
- attempt回数、next run時刻
- 処理件数とtransaction metricsの履歴
- generationとbuilding状態
- retry、cancel、degraded、paused状態

indexは`by_runKey`、`by_kind_and_status_and_targetDate`、`by_status`、retention用の`by_terminalAt`へ限定する。
latest complete日は`kind + status + targetDate`のindexから求め、pipeline singletonへ重複保存しない。

### 7.4 retained tableのfieldとindex

すべての派生tableから`generation`を削除し、`by_generation...`と`by_gen...`のindexをgenerationなしのquery形状へ置き換える。
`analyticsOrganizations.pendingOrganizationProjectionJobKey`も削除する。

source eventの`schemaVersion`と`payloadVersion`はdurable payloadを安全に解釈するため残す。
破壊的resetで作り直せる派生行の`schemaVersion`は削除し、計算versionはrun manifestへ集約する。

日次rowのworker進捗を表す`partial`は廃止する。
cycleまたはopportunityの`complete`と`unavailable`は、処理状態ではなく分母を証明できるかを表すため残す。
実装調査で`partial`の固有ケースが残らなければ、cycle側のvalidatorからも`partial`だけを除く。

## 8. resetとbootstrapの扱い

### 8.1 `resetAnalytics`

`resetAnalytics`はinternal functionだけで提供し、public mutationや管理画面は作らない。
呼出しには`confirmed: true`、期待するdeployment label、revision、固定した`sourceCaptureStartAt`、期待する`calculationVersion`を必須にする。
実行前にoperatorが完全修飾deployment名とrevisionを確認する。

破壊的cleanupとresetの開始には、対象deploymentだけへ一時設定するserver-side enable期限、期待revision、`sourceCaptureStartAt`を必要とする。
internal queryのdry runは、書込みをせずにserver側設定、引数、削除対象table、対象件数をreadbackする。
開始mutationはdry runと同じ値を再検証し、enable期限切れまたは一つでも不一致ならrun作成もscheduleもしない。
最初のreset pageをscheduleした後はenableを無効化し、継続pageはrun IDとstepだけで進める。

resetは次を行う。

1. reset runを`running`にし、Analytics APIを`unavailable`にする。
2. 以前のrun manifestを非公開化し、現在のreset run以外のmanifestと固定allowlistにある派生tableを有界削除する。
3. 運用tableからseed allowlistにある現在状態と継続cycle候補だけを有界走査する。
4. full scan完了後の時刻を`resetWatermarkAt`として固定する。
5. `[sourceCaptureStartAt, resetWatermarkAt)`のsource eventを絶対値upsertで再適用する。
6. `resetWatermarkAt`より後の最初のJST 00:00を`dataStartAt`とし、同じ日付を`dataStartDate`にする。
7. dataStartAtをまたぐ継続cycleを`unavailable`にし、それ以前に終了したcycle候補を削除する。
8. reset用の参照整合性を検証し、最初の日次runを待つ状態へ進める。

seed allowlistは次へ限定する。

- グループと店舗の現在dimension、現在plan、現在所属
- `organizations.createdAt`から得るグループ登録日
- `shops._creationTime`から得る店舗登録日
- 店舗登録事実から正確に導ける`firstShopAt`と`secondShopAt`
- full scan時点で未完了の継続cycle候補。dataStartAt確定後にrateの可否を決める

次は切替前の運用tableからseedしない。

- `firstRecruitmentAt`、`firstSubmissionAt`
- 初回確定、2回目確定、`secondShopFirstConfirmedAt`
- `latestActivityAt`、通常cadence、health signal
- `dataStartAt`より前にdeadlineとcloseの両方を終えたcycle

当日途中のbaseline snapshotは作らない。
`sourceCaptureStartAt`から`dataStartAt`までのeventは、full scanを一つのbaselineへ収束させるためだけに使う。
この区間のeventは現在状態の収束には使うが、milestone field、cycle rate、日次KPIには使わない。
最初の日次runだけは`resetWatermarkAt`をcheckpointとして信用せず、`sourceCaptureStartAt`から最初の完全日の終端までを再適用する。
これにより、full scanと同時にcommitしたeventも3時間の確定待ちを経た同じ入力区間へ含め、`dataStartDate`の日次値だけを作る。
最初の日次runがcompleteになるまで、Dashboardは利用不可のままにする。

### 8.2 reset失敗

reset失敗時はgenerationを切り替えたり、保存cursorから再開したりしない。
失敗runを`failed`にし、安全な構造化ログを残す。
原因修正後は新しいreset runを作り、派生tableを再度削除して最初から実行する。

これは日次失敗のbackfillではない。
初回構築またはKPI計算version変更時に、新しい`dataStartDate`から基盤全体を作り直す唯一の復旧手段である。

## 9. invariantとretention

### 9.1 日次publish前の検査

日次runでは、公開に必要な次の検査だけを行う。

- 全stageの終端へ到達し、source factが`cutoffAt`まで収束している
- 同じrunに属するservice rowがちょうど一件ある
- organization、shop、segment、notificationのscope keyが重複していない
- countが負でなく、すべての率で`0 <= numerator <= denominator`が成り立つ
- service、organization、shopの主要countと分子分母のrollupが一致する
- rowの`runId`、`snapshotDate`、`computedAt`が今回のrunと一致する
- cutoffまでに確定すべきcycleが未確定のまま残っていない

検査が一つでも失敗した場合はpublishせず、runを`failed`にする。
全snapshotの再走査やsource table全件との照合は日次runへ入れない。

### 9.2 週次maintenance

週次cronは深い監査とretentionを一つのmaintenance runで直列に行う。
dailyまたはresetと重なった場合はdailyを優先し、maintenanceを開始しない。
毎分回収はせず、次週のrunが期限rangeを先頭から再走査する。

maintenanceはPII redactionとretentionを先に行い、その後に監査する。
監査は直近7日分の保存済みcomplete日次行について、次をpage単位で確認する。

- scope keyが重複していない
- 率の分子と分母が有効である
- service、organization、shop、segmentのrollupが一致する
- 日次行の`runId`、`snapshotDate`、`computedAt`が対象runと一致する

保存済み日次行の不一致が確定した日だけ、対応するdaily runを`complete`から`failed`へ変えて非公開にする。
監査処理自体がerrorになり、値の誤りを確定できない場合はdaily runを変更せず、maintenanceだけを`failed`にする。

日次行の監査後に、現在のcanonical factについてtenant参照とcycle、opportunityの参照整合性をpage単位で確認する。
現在のdimensionと所属は過去時点の状態を保持しないため、過去日をcanonical factから再計算する監査は行わない。
KPI集計式の正しさはLogic TestとScenario Testで検証する。

retentionは次を有界削除またはredactする。

- failed runに属する非公開の部分出力
- complete cutoffを十分過ぎたsource event
- 期限を迎えたcycle opportunityのpersonとstaff link
- 保持期限を過ぎた日次detailとcanonical fact
- 対応する出力がなくなった古いrun manifest

完全な日次行を参照するrun manifestは、その日次行と同じ期間だけ残す。
KPIのlookbackに必要なfactを先に削除しない。
現在の25か月経過時の`analyticsShiftCycles`削除は、累積提出率とexactなmedian、P90を後から低下させるため廃止する。
cycleの数値factはdataStartDate以降の累積KPIを提供する期間中は保持し、opportunityのpersonとstaff linkだけを現在の期限でredactする。
これにより、新しいcompact aggregate tableや近似quantileを追加せずにKPI定義を維持する。

週次実行が一回失敗しても現在のredaction期限を越えないよう、400日のhard deadlineより14日早いthresholdで対象にする。
同じcycleのopportunityは一transactionでredactし、本人参照がactiveとredactedに分かれた状態を残さない。
retention失敗もerror本文をDBへ保存せず、Convex logと外部alertで追跡する。

### 9.3 外部監視

外部監視は、Convexの構造化logを使って次を検知する。

| 条件 | alert条件 |
|---|---|
| daily未開始 | JST 03:15までに前日分の`analytics_run_started`がない |
| daily期限超過 | JST 15:00までに同じrunの`complete`または`failed`がない |
| terminal failure | daily、reset、maintenanceの`analytics_run_failed`を検知した |
| reset期限超過 | reset開始から12時間以内にterminal logがない |
| maintenance欠落 | 前回の`analytics_maintenance_complete`から8日を超えた |
| redaction接近 | maintenance logの最古未処理期限が7日以内になった |

通知先と担当ownerは外部監視側で設定し、疎通testのevent IDまたは画面証跡を`doc/manual/release-status.md`へ記録する。
missing、期限超過、failure、redaction接近の四系統をProduction有効化前に一回ずつtest alertで確認する。
監視の送信状態やerror本文をAnalytics DBへ複製しない。

## 10. DashboardとAPIの変更

### 10.1 metadata

現在の`activeGeneration`、building、degraded、pausedに依存するmetadataを削除する。
responseは次を返す。

- `availability: available | unavailable`
- `asOf`
- `dataStartDate`
- `latestCompleteSnapshotDate`
- `computedAt`
- 選択期間に欠損日がある場合のwarning
- 既存の`pageInfo`

worker進捗由来の`partial` responseは返さない。
cycle固有の算出不能は、cycleまたは指標単位の`unavailable`として残す。

### 10.2 query

`convex/analyticsDashboard/queryHelpers.ts`からpipeline singletonとgenerationの解決を削除する。
選択範囲のcomplete runを先に取得し、日次rowの`runId`と照合する。
最新一覧と詳細は、最新complete runのsnapshotだけを読む。

店舗やグループの`registeredAt`は`dataStartDate`で切り落とさない。
trend、期間集計、比較期間にはcompleteな日だけを使い、必要日が欠ける集計値は`unavailable`にする。

`/requests`は運用tableを直接読む独立routeなので、Analytics runのavailabilityに連動させない。
Cloudflare Access、Worker BFF、HTTP Action credential、rate limit、request kindの契約も変更しない。

## 11. コード配置

現在の`convex/analytics/pipeline.ts`へ新旧制御を併記しない。
完成形では、呼出し主体と変更理由で次のように分ける。

| file | 責務 |
|---|---|
| `convex/analytics/runs.ts` | run開始、排他、step fence、failed、publish manifest |
| `convex/analytics/nightly.ts` | 日次stageの直列orchestration |
| `convex/analytics/projection.ts` | source eventの冪等なcanonical fact反映 |
| `convex/analytics/aggregation.ts` | notification、shop、organization、segment、service集計 |
| `convex/analytics/invariants.ts` | publish前の安い検査と週次監査 |
| `convex/analytics/maintenance.ts` | retentionとfailed output cleanup |
| `convex/analytics/reset.ts` | 破壊的resetと現在dimension seed |
| `convex/analytics/sourceEvents.ts` | 業務transaction内のPII-free source event追記 |
| `convex/analytics/registry.ts` | KPI定義、page上限、retention契約 |
| `convex/analytics/model.ts` | source payload、fact、runのvalidator |
| `convex/analytics/refs.ts` | 固定されたinternal function reference |

page runnerを他機能向けの汎用queue、workflow framework、registryへ拡張しない。
Analyticsの六stageを安全に直列実行する最小helperだけを共有する。

## 12. Security Lens

- **Actor**：夜間と週次のConvex scheduler、resetを実行するoperator、Worker BFF、内部Analytics閲覧者。
- **Asset**：tenant別KPI、PII-free source fact、締切時点の対象者集合、公開可否、service credential、retention対象ID。
- **Trust boundary**：業務mutationからsource event、schedulerとoperatorからinternal batch、未公開行からDashboard query、WorkerからConvex HTTP Action。
- **Abuse case**：誤deploymentの全削除、cronとresetの競合、stale pageの上書き、failed行の誤公開、tenant混入、PII入りlog、retention対象外の削除、旧scheduled functionの再書込み。
- **Server-side enforcement**：resetとbatchはinternal限定、削除対象とseed対象を固定allowlist化し、一時enable、deployment label、revision、全deployで同じ`sourceCaptureStartAt`をserver側で検証し、各pageでrun IDとstepを照合し、publish時にrunとinvariantを同じserver transactionで再確認する。
- **Rate limit / idempotency**：新しいpublic APIを増やさない。source eventはevent keyでdedupeし、projectionと日次出力は絶対値upsertにする。
- **Lifecycle / recovery**：daily失敗は永久欠損、reset失敗は全消去から再実行、保存済み日次行の不整合が確定した日は週次監査で非公開化する。
- **Logs / PII**：`kind`、`targetDate`、run IDの短いdigest、stage、step、duration、allowlistされたsafe error codeと固定messageだけを記録する。未知の例外本文は`analytics_unexpected`へredactし、source payload、表示名、opaque person ID、credential、通知本文、provider errorを記録しない。
- **Regression test**：stale step、tenant混入、削除allowlist、failed出力の不可視性、PII-free DTOとlog formatterを検証する。

## 13. schema変更と破壊的切替

既存documentを新schemaへ変換するmigrationは行わない。
ただし、documentが残ったままfieldとtableをschemaから外すことはできないため、Widen下で停止、reset cleanup、seed、Narrow readiness確認を終えてから、Narrowを別deployに分ける。

### Phase 0: 実装と自動検証

1. `analyticsRuns`、新runner、query gate、reset、maintenanceをWiden互換で実装する。
2. 旧runnerを呼ぶscheduled functionの互換no-op stubを用意する。
3. 新cronはまだ有効にしない。
4. development deploymentの複製データでresetと日次runを検証する。
5. 最大想定件数で一pageのdocument数、bytes、mutation時間、全run時間を測る。

### Phase 1: freeze deploy

1. 完全修飾deployment名、revision、将来のJST 00:00である`sourceCaptureStartAt`を固定する。
2. 毎分の`recoverJobs`と`ensureProjectionJob`、旧daily、旧retention cronを停止する。
3. 既に予約済みの`processJob`を含む旧entrypointを、削除予定tableのID型に依存しないvalidatorを持つno-opへ変える。
4. `convex/analytics/refs.ts`の互換referenceから`Id<"analyticsAggregationJobs">`依存を除く。
5. source event writerは`occurredAt < sourceCaptureStartAt`をDBへ書かず、`sourceCaptureStartAt`以降だけを従来どおり業務transaction内で追記する。
6. writerとcleanupは`Date.now()`ではなく、全deployで同じ不変な`sourceCaptureStartAt`を使う。
7. `/requests`以外のAnalytics APIを`unavailable`へ固定する。
8. 少なくとも旧lease期間を過ぎてもAnalytics派生tableと捕捉開始前source eventが増えないことを確認する。
9. 対象deploymentだけに破壊的操作のenable期限、deployment label、期待revision、`sourceCaptureStartAt`を設定する。
10. nightly cronが無効であることを第5のreset安全条件とし、dry runの`allowed: true`と`configured.nightlyCronEnabled: false`を保存する。

過去Analyticsは破棄対象なのでbackup restoreを切替条件にしない。
誤deployment削除を防ぐため、deployment名、revision、source capture境界、削除allowlistのreadbackは必須にする。

### Phase 2: Widen下での破壊的reset

旧schemaと旧indexを残したまま、`resetAnalytics`を固定した`sourceCaptureStartAt`で開始する。
resetは一つのrunとして、次を順に行う。

1. `analyticsAggregationJobs`、`analyticsPipelineStates`、旧Analytics三tableを有界削除する。
2. 日次KPI五table、opportunity、cycle、membership、person、shop、organizationを固定allowlistで有界削除する。
3. `sourceCaptureStartAt`より前のsource eventだけを`by_occurredAt`のindex範囲で削除する。
4. 運用tableから現在のorganization、shop、person、manager、staff、継続cycle候補をseedする。
5. full scan後の時刻を`resetWatermarkAt`へ固定し、`[sourceCaptureStartAt, resetWatermarkAt)`のsource eventを絶対値upsertで再適用する。
6. registeredAt、seed allowlist、所属基準、継続cycle、source capture区間の収束と参照整合性を確認し、resetを`complete`にする。

`analyticsSourceEvents`を全件削除しない。
業務mutationが同時に新しいeventを追記するため、`by_occurredAt`で`q.lt("occurredAt", sourceCaptureStartAt)`を指定したindex範囲だけをpaginateする。
`sourceCaptureStartAt`以降を新runnerの入力として残し、全table paginate後のin-memory filterで削除対象を選ばない。

cleanupだけを先に行ってNarrowしない。
resetのseedと検証は旧fieldと旧indexを含むWiden schema上で完了させる。

### Phase 3: Narrow readiness確認とNarrow deploy

1. resetが`complete`になった後、`analytics/reset:getNarrowReadiness`を実行する。
2. `resetComplete`、`legacyTablesEmpty`、`legacyGenerationFieldsEmpty`、`sourceEventsBeforeCaptureEmpty`、`readyForNarrow`がすべて`true`であることを保存する。
3. 旧lease期間を過ぎてから同じreadbackを再実行し、旧writerや旧scheduled callによる再増加がないことを確認する。
4. 旧三table、`analyticsAggregationJobs`、`analyticsPipelineStates`をschemaから削除する。
5. retained tableのgeneration fieldとgeneration indexを削除する。
6. generationなしindexと、Widen中optionalだった`runId`、`kpiEligible`、`kpiEligibleShopCount`をNarrowする。
7. 新runner、query gate、旧entrypointの互換stubをdeployし、新cronはまだ無効のままにする。

### Phase 4: 初回日次

1. Narrow後もreset runが`complete`であることを確認する。
2. reset rowの`resetWatermarkAt`と、その次のJST 00:00である`dataStartAt`を確認する。
3. 最初の完全日が終了して3時間経過した後、その日の日次runを手動で一回開始する。
4. publish前invariant、run manifest、Dashboard metadata、PII-free logを確認する。

### Phase 5: cron有効化

1. JST 03:00のdaily cronを有効にする。
2. dailyと重ならない週次maintenance cronを有効にする。
3. 旧互換stubを次のdeployで削除する。
4. Productionのrevision、sourceCaptureStartAt、resetWatermarkAt、dataStartDate、実行時間、対象件数、complete run、Dashboard responseを`doc/manual/release-status.md`へ記録する。

## 14. rollback境界

| 時点 | rollback |
|---|---|
| reset開始前 | freeze deployを戻し、旧cronと旧runnerを再度有効にできる |
| reset中または失敗後 | 旧履歴は復元しない。Widen schemaを保ち、派生tableを再削除する新しいreset runを最初から開始する |
| reset完了後、Narrow前 | Analyticsをunavailableに保ち、readinessが成立するまで旧writerや旧scheduled callを修正する |
| Narrow後、初回日次前 | schemaと新runnerを修正し、必要ならWidenから破壊的resetをやり直す |
| 新方式publish後 | 旧generationへ戻さず、新しいdataStartDateからresetする |

直接削除を始める直前がpoint of no returnである。
この境界以降は「旧Analyticsへ戻す」を復旧手順に含めない。

## 15. テスト契約

主担当層はConvex Scenario Testとする。
複数page、manifest、Dashboard queryまでを同じ隔離DBで通し、公開可否と永続状態を検証する。

| 契約 | 主担当層 | ケース |
|---|---|---|
| resetと初回publish | Convex Scenario | reset中はunavailableで、最初のcomplete run後だけ全scopeが見える |
| 登録日の維持 | Convex Scenario | dataStartDateより前のshop登録日を表示でき、切替前の日次rowは存在しない |
| 既存cohort | Convex Scenario | dataStartDate前のshopをmilestone未達へ数えず、切替後の現在値、health、完全なcycle rateには含める |
| 境界をまたぐcycle | Convex Scenario | dataStartAt前の提出を持ち得る継続cycleをunavailableにし、上位率の分子と分母から除外する |
| 日次成功 | Convex Scenario | cutoffまでのevent、cycle、通知を集計し、全scopeが同じrun IDで公開される |
| 日次失敗 | Convex Scenario | 各主要stageで失敗させ、途中行を一件も返さない |
| 永久欠損 | Convex Scenario | D1失敗後にD2が成功し、D1は欠損、D2は最後の成功cutoffから正確に収束する |
| stale page | Convex Function | run A失敗後またはstep進行後のpageがwriteもscheduleもしない |
| event冪等性 | Convex Function | 同じevent区間を再適用してもmembership、cycle、countが二重にならない |
| JST cutoff | Logic Test | 日跨ぎ、月跨ぎ、年跨ぎで`[from, cutoff)`が正しい |
| publish invariant | Convex Function | scope欠落、重複、rollup不一致、分子超過ではcompleteにならない |
| tenant境界 | Convex Scenario | 複数organizationとshopのfact、集計、詳細が混ざらない |
| cleanup allowlist | Convex Scenario | Analytics派生tableだけを消し、運用documentとsourceCaptureStartAt以降のeventを残す |
| destructive guard | Convex Function | enable無効、期限切れ、deployment、revision、sourceCapture不一致ではwriteとscheduleが0件になる |
| 週次監査 | Convex Scenario | 直近7日の保存済み日次行の不一致だけを該当日のfailedへ変え、現在canonical監査のerrorではdailyを変更しない |
| retention | Convex Scenario | opportunityをhard期限の14日前からcycle単位でredactし、KPI lookbackに必要な数値factを削除しない |
| 累積KPI retention | Convex Scenario | 25か月境界を越えても古いcycle数値factと累積提出率、median、P90が低下しない |
| API metadata | Convex Function | available、unavailable、asOf、dataStartDate、欠損日warning、最小DTOを返す |
| HTTP境界 | 既存Function Test | credential、request kind、size、rate limit、not found統一を維持する |
| error log | Logic Test | formatterがsource payload、ID、credential、provider errorを受け取らない |
| 外部監視 | 運用canary | missing、期限超過、failed、redaction接近のtest alertが指定先へ届く |

既存のbootstrap、generation activation、lease recovery、retry、contiguous latest dateを検証するtestは削除する。
Analytics Dashboard frontendには新しいtest、Storybook、VRT、E2Eを追加しない。
Convex response変更に追従したうえで、app固有の静的検証を実行する。

実装時の検証commandは次を基本とする。

```bash
pnpm vitest --project='convex(logic)' convex/analytics convex/analyticsDashboard --run
pnpm vitest --project='convex(scenario)' convex/_scenario/analyticsNightly.test.ts --run
pnpm analytics:lint
pnpm analytics:type-check
pnpm analytics:build
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

## 16. 実装順序

1. run manifest、availability、cutoff、失敗日の契約をtest fixtureへ固定する。
2. source event projectionをgenerationなしの絶対値upsertへ分離する。
3. 六stageの日次runnerとpublish前invariantを実装する。
4. `analyticsRuns`とretained tableのWiden schema、query gateを追加する。
5. reset、weekly audit、retentionを実装する。
6. Dashboard DTO、validator、query helper、frontend adapterをavailable/unavailable契約へ変更する。
7. 旧runnerをfreezeできる互換stubとcleanupを実装する。
8. Scenario TestとFunction Testを完成させ、最大量のpage budgetを測る。
9. Phase 1からPhase 5の順でdevelopment、Productionへ適用する。
10. 現行機能文書と人向けrunbookを新方式へ更新する。

## 17. 受入条件

- 通常時のAnalytics cronがdaily一つとweekly maintenance一つだけで、毎分cronがない。
- `analyticsAggregationJobs`と`analyticsPipelineStates`がschemaとruntimeから消えている。
- active/building generation、lease、attempt、永続cursor、retry API、backfill APIがない。
- 状態保持が`analyticsRuns`一tableだけで、error detailを含まない。
- batch開始からcomplete publishまで、Dashboard queryが途中行を返さない。
- failed runの後で古いscheduled pageがwriteもpublishもできない。
- 失敗日のsnapshotを作らず、後日のrunはその日を埋めずに成功できる。
- 同じsource intervalを再適用してもcanonical factが二重にならない。
- 日次値がJST cutoffより後のeventを含まない。
- 締切時点の対象者と初回提出factを現在値で推測しない。
- 店舗とグループの登録日はdataStartDateより前でも表示できる。
- 切替前の日次trend、率、healthを表示しない。
- 切替前から存在する店舗も、切替後の現在値、health、完全なcycle rateには含める。
- 欠損日を0として集計または描画しない。
- publish前のcheap invariant、直近7日の日次出力監査、現在canonical参照監査が異なる責務で実装されている。
- retentionがKPI lookbackとredactionの期限を同時に守る。
- cycle数値factのretentionで累積提出率、median、P90が後から低下しない。
- resetとcleanupがinternal限定かつ固定allowlistで、運用tableとsourceCaptureStartAt以降のeventを削除しない。
- 破壊的操作がserver-side enable、deployment label、revision、sourceCaptureStartAtの不一致時に副作用なく拒否される。
- Dashboard DTOと構造化logにPII、credential、通知本文、provider raw errorがない。
- 最大想定量で各pageがConvex transaction budget内に収まり、dailyが次回cronまでに完了する。
- Productionのdeployment、revision、sourceCaptureStartAt、resetWatermarkAt、dataStartDate、実行時間、complete結果を証跡化できる。
- daily未開始、12時間超過、terminal failure、maintenance欠落、redaction期限接近の外部alertと疎通証跡がある。

## 18. 採用しない案

- current運用tableだけを夜間に読み、締切時点の分母を推測する
- source eventをbest effortの非同期追記へ変える
- 一つの巨大mutationで全件集計する
- failed日の自動retry、backfill、repair queueを作る
- active/building generationとdual readを残す
- staleな前回成功値をbatch失敗中も表示する
- incomplete rowを`partial`な日次値として公開する
- 日次ごとに全sourceと全snapshotを深く監査する
- 汎用workflow engine、queue、runnerを新設する
- KPI version変更時に旧履歴を変換するmigrationを作る
- 誤差のある切替前cycle rateやmilestoneを推計する

## 19. 更新する現行文書

実装と同じ変更で次を更新する。

- `doc/features/analytics.md`：generationとjob workflowを夜間run契約へ置換する
- `doc/features/analytics-dashboard.md`：availability、欠損日、登録日とdataStartDateの違いを反映する
- `doc/manual/analytics-rollout.md`：bootstrap、generation cutover、retry手順をfreeze、cleanup、reset手順へ置換する
- `doc/manual/release-status.md`：対象deploymentの切替証跡を記録する
- `doc/plans/INDEX.md`：本計画をActiveとして追跡し、旧計画を置換済みのHistoryへ移す

## 20. 参考にした現行ファイル

- `AGENTS.md`
- `convex/AGENTS.md`
- `convex/_generated/ai/guidelines.md`
- `doc/rules/convex-design-strategy.md`
- `doc/rules/security-strategy.md`
- `doc/rules/testing-strategy.md`
- `doc/features/analytics.md`
- `doc/features/analytics-dashboard.md`
- `doc/manual/analytics-rollout.md`
- `doc/manual/release-status.md`
- `doc/plans/INDEX.md`
- `doc/plans/2026-08-02_分析KPIと内部BI再設計_実装計画.md`
- `convex/schema.ts`
- `convex/crons.ts`
- `convex/analytics/model.ts`
- `convex/analytics/registry.ts`
- `convex/analytics/sourceEvents.ts`
- `convex/analytics/pipeline.ts`
- `convex/analytics/pipeline.test.ts`
- `convex/analytics/refs.ts`
- `convex/analyticsDashboard/dto.ts`
- `convex/analyticsDashboard/schemas.ts`
- `convex/analyticsDashboard/validators.ts`
- `convex/analyticsDashboard/queryHelpers.ts`
- `convex/analyticsDashboard/queries.ts`
- `convex/analyticsDashboard/httpActions.ts`
- `apps/analytics-dashboard/AGENTS.md`
