# Analytics rollout

> 文書種別: manual
>
> 現在の実環境状態: [リリース状態](release-status.md)

この手順は、新しいAnalytics generationを同じConvex deployment内で構築し、内部BIを切り替え、旧Analytics 3 tableを後続のNarrowへ安全に引き渡すためのものです。  
リポジトリの実装完了は、Productionへのdeploy、bootstrap、cutover、cleanup、Narrowの完了を意味しません。

## 完了条件

次の状態を別々の証跡として記録します。

1. Widen版が対象revisionと完全修飾deploymentへdeployされている。
2. building generationのbootstrap、source event追従、baseline snapshot、invariantが完了している。
3. `activeGeneration`が明示操作で切り替わり、新UIの固定endpointだけが新Analyticsを読んでいる。
4. 代表jobのread document数、read bytes、write document数、write bytesがbudget内である。
5. Cloudflare Access、credential非露出、partialとstaleの表示を実環境で確認している。
6. 旧3 tableのbounded cleanupが完了し、対象deploymentで各0件を全page確認している。
7. 旧3 tableのschema定義削除を、0件証跡より後の別revision、別deployで行っている。

一項目の成功から、後続項目の成功を推測しません。

## 作業前の固定

1. `git rev-parse HEAD`で対象revisionを記録します。
2. Convex DashboardとCLIでprojectと完全修飾deployment名を照合します。
3. Cloudflare Workerの対象revision、Access policy、環境名を記録します。
4. 新しいgeneration名を、同じdeployment内で一意な64文字以下の英数字と`._-`から決めます。
5. 失敗時に戻すConvexとWorkerのrevision、Accessを閉じる担当、証跡保存先を決めます。

`--deployment prod`のような短縮名は使いません。  
secret、認証header、要望本文、氏名、email、電話番号、LINE user ID、通知payloadをコマンド出力や証跡へ残しません。

## Widenと構築

最初のdeployでは、新しいAnalytics tableとpipelineを追加し、旧3 tableのschema定義を残します。  
現在の実装は新しいBFF契約も含むため、内部BIをAccessで閉じた保守時間帯にConvexとWorkerの切替を調整します。

### LINE readiness

building generationを始める前に、対象deploymentのDashboard exportまたはbackup ZIPを取得します。  
CLIを使う場合は完全修飾deployment名を指定します。

```bash
pnpm exec convex export --deployment <fully-qualified-deployment> \
  --path <access-controlled-unique-path>/analytics-line-readiness-<timestamp>.zip
unzip -t <analytics-line-readiness-export.zip>
shasum -a 256 <analytics-line-readiness-export.zip>
```

exportはリポジトリ、seed用backup、別deploymentのsnapshot、以前のreadiness exportと分離した、アクセス制限付きの一意なパスへ保存します。  
`pnpm convex:save`や既存ZIPへの上書きは行いません。Dashboardから取得したZIPも同じ条件で保存し、展開する場合はそのZIP専用の別directoryを使います。

ZIPまたは展開済みdirectoryをoffline verifierへ渡します。

```bash
pnpm convex:verify-analytics-line-readiness -- \
  --path <Convex-export.zip-or-extracted-directory>
```

verifierは`staffLineAccounts`をofflineで集計し、PIIとLINE user IDを出力しません。  
対象revision、完全修飾deployment名、export取得時刻、export ZIPのSHA-256とともに、次の値を証跡へ記録します。

- `ok: true`
- `overLimitLineUserCount: 0`
- `maxActiveAccountsPerLineUser`が`limit`の50以下
- `activeAccountCount`と`distinctLineUserCount`
- `activeAssociationSetSha256`

`overLimitLineUserCount`が1以上ならverifierはexit code 1で停止します。運用documentを変更せず、原因を解消して新しいexportを別パスへ取得し、再検証します。  
この結果はexport取得時点のsnapshot証跡です。bootstrapまたはcutoverまでに対象データが変わった場合は、同じ結果を流用せず再取得します。

### Bootstrap

LINE readinessが成功した後、building generationを開始します。

```bash
pnpm exec convex run analytics/pipeline:startBootstrap \
  '{"generation":"<generation>"}' \
  --deployment <fully-qualified-deployment>
```

この処理は現在の運用tableと、正確に復元できるcycle factだけを有界に読みます。  
旧`analyticsDailyServiceSnapshots`、`analyticsDailyShopSnapshots`、`analyticsDailyEventCounts`をcopy、比較、dual readしません。

すべての店舗と所属に正規の`organizationId`を解決できない場合は、building generationをreadyにせず原因を解消します。legacy recordを黙って除外した状態でcutoverしません。

source eventは業務mutationと同じtransactionで追記します。payload検証、event key競合、insertに失敗した場合は業務mutationもrollbackします。  
transaction commit後のprojection、cycle finalization、日次jobの失敗は業務mutationへ波及しません。

bootstrap baselineは、構築開始時のsource watermarkに固定したpoint-in-time値です。`snapshotDate`は`buildingDataStartDate`ですが、その日の終了値ではありません。通常の日次trendは、cutover後にJSTで終了した日から蓄積します。

generationは`building`でbootstrapを始め、開始時のsource cursorまでcatch-upした後に`ready`になります。ready後は共有projectionがactiveとbuildingへ同じsource eventを適用し、後述のcutover証明を満たすまでbuildingを公開しません。

通常経路はactive accountを51件目まで先に読み、50件超過または連携確定後の件数・変更数超過をoperational patch前に拒否します。Webhookのfollow、unfollowはprovider eventごとに別transactionで処理し、LINE source batchは最大50件のstaff ID、linked・following状態、サービス受理時刻だけを持ちます。provider timestampとevent IDは重複・順序判定にだけ使います。  
防御上`isComplete: false`のbatchがprojectionへ到達した場合は`analytics_line_batch_overflow`でfail-closedにし、generationを`degraded`としてcutoverを止めます。このgenerationをretryだけで正確とみなさず、新しいgenerationを運用tableから再構築します。

## 進捗と負荷

次のstatus queryを繰り返し、bootstrap、projection、daily、cycle finalizationの状態を確認します。

```bash
pnpm exec convex run analytics/pipeline:getStatus '{}' \
  --deployment <fully-qualified-deployment>
```

`pending`または`processing`は完了ではありません。  
`failed`、attempt上限、leaseの長期滞留、`degraded`があればcutoverを止めます。

失敗原因を解消した後は、`getStatus`に表示された完全一致の`jobKey`を指定して、保存済みphaseとcursorから再開します。

```bash
pnpm exec convex run analytics/pipeline:retryFailedJob \
  '{"jobKey":"<job-key>","confirmed":true}' \
  --deployment <fully-qualified-deployment>
```

成功するまで機械的にretryせず、`lastErrorCode`と対象revisionを先に確認します。

projection定義の誤り、復元不能なsource不整合、defensiveな不完全LINE batchなど、同じgenerationをretryしても正確性を回復できない場合はbuilding generationを破棄します。`generation`は`getStatus`の現在値を完全一致で指定します。

```bash
pnpm exec convex run analytics/pipeline:abandonBuildingGeneration \
  '{"generation":"<building-generation>","confirmed":true}' \
  --deployment <fully-qualified-deployment>
```

このmutationはbuilding fieldを外し、active generationがあれば共有projectionとbuilding開始前の状態へ戻し、なければpipelineを`idle`へ戻します。開始前またはbuilding中に`degraded`だったactive generationは`degraded`のままです。対象generationのpending、processing、failed jobを有界pageでcancelしてから、generation tableを有界cleanupします。`getStatus`へ同じgenerationを指定し、cleanup jobが`completed`、`generationTables`の全`*IsEmpty`が`true`であることを確認するまで、同じ名前の再利用や新generationのcutoverを行いません。失敗したbuilding generationのcleanupは、cutover済みinactive generationに対する14日保持とは別契約です。

各jobの`lastTransactionMetrics`から、少なくとも次をphase別に記録します。

- `documentsRead`
- `bytesRead`
- `documentsWritten`
- `bytesWritten`
- `databaseQueries`
- `functionsScheduled`
- `executedPhase`
- `measuredAt`

`lastTransactionMetrics`はphase処理とrecovery schedule後に`ctx.meta.getTransactionMetrics()`から得た実使用量です。その値自身を保存する最後のjob patchは含みません。jobの最新transactionだけを保持し、次のpageまたはphaseで上書きされます。`executedPhase`は計測したtransactionのphaseであり、取得時点の次phaseとは限りません。  
各phaseの実行中に`getStatus`を取得し、対象deployment、revision、generation、job keyとともに外部証跡へ残します。完了後の一回の取得から全phase履歴を復元したことにしません。

確認対象はsource event主consumer 1件、projection子job 50件、cycle opportunity 50件、通知reset・sent・failed・finalize、shop snapshot、organization rollup、segment rollup、service rollup、cleanup 50件です。  
source event writerによる追加readはevent key重複確認の最大1件だけ、追加writeはsource eventの1件だけであることを、代表操作のtransaction metricsで別に確認します。LINEのactive account preflightなど既存業務安全性のreadを、Analytics追加readへ混ぜません。

値がbudgetを超える場合はcutoverせず、query形状とprojection粒度を見直します。  
batch sizeを下げただけで成功扱いにしません。

## Invariantとcutover

building generationのmanual invariant jobを補助検査として明示的に起動します。

```bash
pnpm exec convex run analytics/pipeline:checkGenerationInvariants \
  '{"generation":"<generation>"}' \
  --deployment <fully-qualified-deployment>
```

invariant jobは、source event backlogとblocking projection子jobがともに0件になったtransactionでsource cursorを捕捉してから走査を始めます。走査完了時にbacklog、blocker、cursorを再確認し、cursorが変化していればbarrierから全走査をやり直します。

milestone順序、cycle scope、提出数が対象数を超えないこと、complete snapshot一意、organizationとshop、serviceとorganizationのrollup一致、unknown cycleの率除外を確認します。  
このmutationの返却はjobの開始を示すだけです。`getStatus`へgenerationを渡し、`invariant:<generation>:manual`が全pageを走査して`completed`になるまで確認します。  
manual invariantは広い整合性を点検する補助証跡であり、cutoverに必要なbaseline invariantの代わりではありません。

```bash
pnpm exec convex run analytics/pipeline:getStatus \
  '{"generation":"<generation>"}' \
  --deployment <fully-qualified-deployment>
```

日次jobは、同じ日付とsource watermarkのdaily invariantが完了するまでservice snapshotを`partial`に保ち、`latestCompleteSnapshotDate`を進めません。cutoverでは、そのうち`buildingDataStartDate`のbaseline jobに紐づくinvariantを要求します。invariantの走査中にsource cursorが変わった場合は、古い走査結果を採用せず先頭から再検証します。

cutover直前には、generationが`ready`、bootstrap jobが完了、bootstrap完了後のprojection catch-up証明あり、source event backlog 0件、blocking projection子job 0件、baseline snapshotがcomplete、baseline daily jobが完了、baseline invariantの日付・source watermark・source cursorが現在値と一致、全job種別のfailed 0件であることを確認します。  
`activateGeneration`はこれらを同じtransactionで再確認してから、一度だけ切り替えます。manual invariantの完了だけでは切り替えません。  
初回cutoverでは`expectedActiveGeneration`を省略し、再構築時は現在値を明示します。

```bash
pnpm exec convex run analytics/pipeline:activateGeneration \
  '{"generation":"<generation>","confirmed":true}' \
  --deployment <fully-qualified-deployment>
```

```bash
pnpm exec convex run analytics/pipeline:activateGeneration \
  '{"generation":"<generation>","expectedActiveGeneration":"<current-generation>","confirmed":true}' \
  --deployment <fully-qualified-deployment>
```

切替後に`getStatus`を再実行し、`activeGeneration`、`buildingGeneration`、`latestCompleteSnapshotDate`、`lastProjectedAt`を記録します。

## 日次再実行

通常はcronがJST前日を起動します。  
特定日を再実行する場合も、active generationとJSTで終了済みの対象日を固定します。当日は手動日次の対象にしません。

```bash
pnpm exec convex run analytics/pipeline:startDailyAggregation \
  '{"date":"<YYYY-MM-DD>","generation":"<active-generation>"}' \
  --deployment <fully-qualified-deployment>
```

日次処理は、既存通知集計のreset、terminal `sent`のpage走査、terminal `failed`のpage走査、通知集計とnotification watermarkの確定、期限済みcycle finalizationの待機、shop内のstaff・manager・cycle・確定時間quantile・通知集計、organization、segment、service、daily invariant待機、snapshot公開の順に進みます。  
同日再実行で値が増えず、途中pageがcompleteにならず、通知watermarkとdaily invariantが揃った完了後だけ`latestCompleteSnapshotDate`が進むことを確認します。

## Workerと実環境確認

新しいAnalytics UIとWorkerを同じ対象revisionで配信し、[セキュリティ再検証](security-validation.md)の次を確認します。

- `ENV-BI-01`: 未認証ではHTMLとAPIへ到達できない。
- `ENV-BI-02`: service credentialがbrowserへ露出しない。
- `ENV-BI-03`: pipeline停止またはpartial時に古い値を正常値として表示しない。
- `ENV-BI-04`: body上限をstream途中で拒否する。
- `ENV-BI-05`: 最大想定量の負荷とresponse sizeを記録する。

Analytics一覧は初期50件、最大100件、`/requests`は最大50件、trendは最大366点、responseは512 KiB未満であることも記録します。  
`/requests`だけはAnalytics table専用readの例外として`featureRequests`と現在の`shops`を直接読みます。

## 旧Analytics cleanup

旧cron、旧backfill、旧queryの停止と、新UIに旧readがないことを先に確認します。  
数日分のcomplete snapshotと負荷証跡が揃うまで、旧3 tableのcleanupを始めません。

cleanupは専用internal jobから開始し、1 transaction最大50件でcursorを保存します。  
途中停止時は同じjobを再開し、手動の全件削除やDashboard上の一括削除を行いません。

```bash
pnpm exec convex run analytics/pipeline:startLegacyCleanup \
  '{"confirmed":true}' \
  --deployment <fully-qualified-deployment>
```

cleanup完了後、`getStatus`の`legacyTables`が、次の各tableについて独立したindex probeで空を示すことを確認します。

- `analyticsDailyServiceSnapshots`
- `analyticsDailyShopSnapshots`
- `analyticsDailyEventCounts`

三つすべての`*IsEmpty`が`true`であること、cleanup jobが`completed`であること、対象revisionとdeploymentが一致することを一組の証跡にします。  
cleanup job statusだけ、三つのうち一部だけ、ローカル環境の結果をProductionの0件証跡として使いません。

retention cleanupと非active generation cleanupも、対象を明示して開始します。activeまたはbuilding generationはcleanupできません。  
非active generationのcleanup jobはcutover transactionが14日後を`nextRunAt`として作成します。14日経過前に手動mutationで期限を前倒しせず、切替日時とjobの`nextRunAt`を証跡で照合してから実行します。

```bash
pnpm exec convex run analytics/pipeline:startRetentionCleanup \
  '{"confirmed":true}' \
  --deployment <fully-qualified-deployment>
```

```bash
pnpm exec convex run analytics/pipeline:startInactiveGenerationCleanup \
  '{"generation":"<inactive-generation>","confirmed":true}' \
  --deployment <fully-qualified-deployment>
```

## Narrow

旧3 tableのschema定義は、このリポジトリ変更では削除しません。  
Productionの0件証跡が揃った後に、別revisionで`convex/schema.ts`から旧3定義だけを削除します。

Narrow版をdeployする前に、旧revisionのWorker、scheduled function、手動runbookが旧tableへreadまたはwriteしないことを確認します。  
対象deploymentを取り違えた、旧rowが再流入した、0件証跡が古い場合はNarrowを止めます。

## 停止と復旧

Narrow前に失敗した場合は、Cloudflare Accessで内部BIを閉じ、新pipelineを`active`として扱わず、原因を調査します。  
必要ならConvex HTTP ActionとWorkerを互換する以前のrevisionへ組で戻します。旧3 tableは残っているため、この段階で削除しません。

Narrow後は旧Analyticsデータへrollbackしません。  
運用tableと保持期間内のsource eventから新しいgenerationを再構築し、復元不能な期間は`unavailable`として扱います。

次のいずれかなら工程を止めます。

- 完全修飾deployment名、revision、generationを一意に特定できない。
- jobが失敗、attempt上限、長期lease、またはbudget超過になった。
- defensiveな不完全LINE batchを検知し、generationが`degraded`になった。
- 同じLINE userのactive accountが50件を超える組み合わせをreadinessで検出した。
- invariant違反または`hasMore`を未確認のまま残した。
- baselineまたは対象日のsnapshotがcompleteでない。
- credential、PII、通知payloadがresponseまたはlogへ出た。
- 旧3 tableのいずれかが0件でない。

実環境の結果は[リリース状態](release-status.md)へ、対象revision、完全修飾deployment、generation、日時、確認者、アクセス制限された証跡とともに記録します。
