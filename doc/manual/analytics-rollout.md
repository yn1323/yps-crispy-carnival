# Analytics rollout

> 文書種別: manual
>
> 現在の実環境状態: [リリース状態](release-status.md)

この手順は、旧Analyticsを停止し、破壊的resetで新しい夜間batchへ切り替えるためのものです。
過去のAnalytics履歴は引き継ぎません。
Narrow後にreset完了日の初回partialを即時公開し、翌々日の03:00から完全な日次履歴を作ります。

リポジトリの実装完了は、対象deploymentへのWiden、破壊的reset、Narrow readiness確認、Narrow、初回日次、cronと外部alertの有効化を意味しません。
この文書は手順だけを定め、Production操作の実施記録には使いません。

## 完了条件

次の結果を、対象revisionと完全修飾deployment名に結び付けて別々に記録します。

1. codeと自動testが完了している。
2. Widen版をdeployし、旧runnerをfreezeし、新cronの環境gateを無効にしている。
3. reset用4環境変数と呼出し引数が一致し、nightly cronが無効で、`analytics/reset:dryRun`が`allowed: true`と`configured.nightlyCronEnabled: false`を返している。
4. `analytics/reset:start`から始まったreset runが`complete`になっている。
5. Widen版`analytics/reset` moduleの`getNarrowReadiness`がすべての固定probeを`true`で返し、待機後も`readyForNarrow: true`を維持している。
6. Narrow readiness証跡より後の別revisionで、初回即時partialの変更を同梱したNarrow版をdeployしている。
7. reset完了日の初回manual dailyが即時に`complete`になり、全日次scopeが同じ`runId`で公開され、Dashboardの期間集計と比較へ含まれている。
8. dailyとweekly maintenanceのcron gateを有効にし、初回翌日の03:00がno-op、翌々日の03:00がreset rowの`dataStartDate`を対象とする完全な日次runになることを確認している。実行時間、負荷、欠落・期限超過・失敗alertの疎通も確認している。
9. Cloudflare Access、service credential非露出、`availability`と欠損日の表示を実環境で確認している。
10. 旧scheduled callの互換stubを、安全条件成立後の別deployで削除している。

一つの結果から後続工程の完了を推測しません。

## 作業前に固定する値

作業開始前に次を記録します。

1. `git rev-parse HEAD`で得たWiden対象revision
2. Convex DashboardとCLIの両方で確認した完全修飾deployment名
3. 将来のJST 00:00に固定した`sourceCaptureStartAt`の`YYYYMMDDHHmmss`値
4. 現在の`ANALYTICS_CALCULATION_VERSION`
5. reset開始を許可する短い時間窓の終了時刻
6. Cloudflare Worker revision、Access policy、証跡保存先、停止判断者

`--deployment prod`、`dev`、`staging`のような短縮指定は使いません。
以降のcloud操作には、`team:project:reference`またはdeployment名など、事前に照合した完全修飾値を毎回指定します。

secret、認証header、氏名、email、電話番号、LINE user ID、通知payload、provider errorはコマンド出力と証跡へ残しません。

## developmentでの事前検証

Productionの前に、アクセス制限した複製snapshotをlocalまたは専用development deploymentへ取り込み、同じ順序でresetと初回日次を通します。
localを使う場合はURLとportで接続先を確認し、すべての操作へ`--deployment local`を明示します。

```bash
lsof -nP -iTCP:3210 -sTCP:LISTEN
lsof -nP -iTCP:3211 -sTCP:LISTEN
pnpm exec convex run --deployment local --inline-query \
  'return { organizations: (await ctx.db.query("organizations").take(1)).length, analyticsRuns: (await ctx.db.query("analyticsRuns").take(1)).length };'
```

既存local DBを置き換える場合は、対象ZIPと`--deployment local`を再確認してから実行します。
`--replace-all`はlocal DB全体を置き換えるため、共有DevやProductionを示すdeploymentへ使いません。

```bash
pnpm exec convex import <local-snapshot.zip> \
  --deployment local \
  --replace-all
```

検証前後で`organizations`、`shops`、`staffs`、`recruitments`、`shiftSubmissions`の件数を比較し、resetが運用tableを変更していないことを確認します。
検証終了後は、PIIを含むsnapshotと展開directoryをアクセス制限された保存先から削除します。

## Widenとfreeze

Widen版は、次の互換状態でdeployします。

- `analyticsRuns`、新しいrun、reset、日次、maintenance、Dashboard query gateを追加する。
- 旧5tableと旧field・indexは、reset後のNarrow readiness確認までschemaへ残す。
- 旧scheduled functionのentrypointは、削除予定tableのID型に依存しないno-op互換stubへ変える。
- 旧毎分回収、旧日次、旧retentionのcron登録は外す。
- 新dailyとweekly maintenanceのcron関数は、`ANALYTICS_NIGHTLY_CRON_ENABLED`が文字列`true`の場合だけrunを作る。
- `/requests`以外のAnalytics APIは、completeな新日次runができるまで`unavailable`を返す。

既存documentがあるtableへgenerationなしindexを追加するため、Widenは二段階でdeployします。
最初のschema専用revisionでは新indexを`{ fields: [...], staged: true }`として追加し、index backfillが完了するまで待ちます。
次のrevisionで`staged`を外し、この文書が扱うruntime codeをdeployします。
staged中のindexはqueryできないため、resetのdry run、Dashboard query、新cronを実行する前に、対象deploymentで全indexが有効になったことを確認します。
既存tableへのindex追加を非stagedのまま大きなdeploymentへ直接deployしません。

Widen deploy前に、cron gateを無効にします。
未設定または`false`は無効であり、文字列`true`だけが有効です。

```bash
pnpm exec convex env set ANALYTICS_NIGHTLY_CRON_ENABLED 'false' \
  --deployment <fully-qualified-deployment>
```

Widen deploy後は、少なくとも旧lease時間の15分を過ぎるまで待ちます。
`analytics_legacy_call_ignored`は旧revisionが予約済みだった呼出しを安全に吸収した記録であり、reset失敗ではありません。

待機中に旧派生tableと捕捉開始前source eventが増えていないこと、旧毎分cronが登録から消えたこと、Analytics APIが途中値を返さないことを確認します。

### LINE readiness

reset前に、対象deploymentのDashboard exportまたはbackup ZIPをアクセス制限された一意なパスへ取得します。
CLIを使う場合は完全修飾deployment名を指定します。

```bash
pnpm exec convex export --deployment <fully-qualified-deployment> \
  --path <access-controlled-unique-path>/analytics-line-readiness-<timestamp>.zip
unzip -t <analytics-line-readiness-export.zip>
shasum -a 256 <analytics-line-readiness-export.zip>
pnpm convex:verify-analytics-line-readiness -- \
  --path <analytics-line-readiness-export.zip>
```

次の結果を、revision、deployment、export時刻、ZIPのSHA-256とともに記録します。

- `ok: true`
- `overLimitLineUserCount: 0`
- `maxActiveAccountsPerLineUser`が50以下
- `activeAccountCount`と`distinctLineUserCount`
- `activeAssociationSetSha256`

`overLimitLineUserCount`が1以上の場合はresetを開始しません。
運用document側の原因を解消し、新しいexportを別パスへ取得して再検証します。

## reset用環境変数とcron gate

破壊的resetのguardには、次の4環境変数に加えて、nightly cronが無効であることを第5の安全条件として使います。
`ANALYTICS_NIGHTLY_CRON_ENABLED`が未設定または文字列`false`でなければ、dry runとreset開始の両方を拒否します。

| 環境変数 | 固定値 |
|---|---|
| `ANALYTICS_DEPLOYMENT_LABEL` | CLIで照合した完全修飾deployment名 |
| `ANALYTICS_EXPECTED_REVISION` | Widen版の完全なGit revision |
| `ANALYTICS_SOURCE_CAPTURE_START_AT` | 将来のJST 00:00を`YYYYMMDDHHmmss`で表した14桁の値 |
| `ANALYTICS_RESET_ENABLED_UNTIL` | reset開始だけを許可する短い時間窓の終了epoch milliseconds |

`ANALYTICS_SOURCE_CAPTURE_START_AT`はJST固定で解釈します。
たとえば`20260815000000`は2026年8月15日00:00 JSTです。時分秒は`000000`だけを許可し、存在しない日付、ISO文字列、13桁のepoch millisecondsは拒否します。serverは検証後にUnix millisecondsへ変換し、`analyticsRuns.sourceCaptureStartAt`を含む内部状態へは数値で保存します。

最初の3変数は`sourceCaptureStartAt`より前に設定し、その値を変えずにWiden版をdeployします。
source event writerは境界より前のeventを保存せず、境界以後のeventだけをreset中も業務transaction内で捕捉します。

```bash
pnpm exec convex env set ANALYTICS_DEPLOYMENT_LABEL '<fully-qualified-deployment>' \
  --deployment <fully-qualified-deployment>
pnpm exec convex env set ANALYTICS_EXPECTED_REVISION '<widen-revision>' \
  --deployment <fully-qualified-deployment>
pnpm exec convex env set ANALYTICS_SOURCE_CAPTURE_START_AT '<source-capture-start-yyyymmddhhmmss>' \
  --deployment <fully-qualified-deployment>
```

`sourceCaptureStartAt`を過ぎ、deploymentとrevisionを再照合した直後に、短いenable期限を設定します。

```bash
pnpm exec convex env set ANALYTICS_RESET_ENABLED_UNTIL '<reset-enabled-until-epoch-ms>' \
  --deployment <fully-qualified-deployment>
```

`ANALYTICS_SOURCE_CAPTURE_START_AT`はreset後もsource event writerが参照するため削除しません。
reset終了後に無効化するのは`ANALYTICS_RESET_ENABLED_UNTIL`だけです。

## dry run

`analytics/reset:dryRun`は書込みを行わず、server側設定、要求値、cron gate、固定cleanup allowlist、100件までのsample countを返します。

```bash
pnpm exec convex run analytics/reset:dryRun \
  '{"confirmed":true,"deploymentLabel":"<fully-qualified-deployment>","revision":"<widen-revision>","sourceCaptureStartAt":"<source-capture-start-yyyymmddhhmmss>","calculationVersion":2}' \
  --deployment <fully-qualified-deployment>
```

次をすべて確認します。

- `allowed`が`true`
- `configured`と`requested`のdeployment、revision、正規化後の`sourceCaptureStartAt`が完全一致
- `configured.nightlyCronEnabled`が`false`
- `enabledUntil`が未来で、作業時間だけを許可している
- `calculationVersion`が対象revisionの`ANALYTICS_CALCULATION_VERSION`と一致
- `cleanup`がコードで固定されたAnalytics tableだけを含む
- `truncated: true`を正確な件数と誤解せず、削除量の下限として扱っている

一つでも一致しない場合は`start`を実行しません。
環境変数または対象deploymentを修正し、dry runを最初から取り直します。

## 破壊的reset

dry runと同じ引数を一字も変えずに`analytics/reset:start`へ渡します。

```bash
pnpm exec convex run analytics/reset:start \
  '{"confirmed":true,"deploymentLabel":"<fully-qualified-deployment>","revision":"<widen-revision>","sourceCaptureStartAt":"<source-capture-start-yyyymmddhhmmss>","calculationVersion":2}' \
  --deployment <fully-qualified-deployment>
```

返却された`runId`と`runKey`を証跡へ保存した直後に、reset開始権限を無効化します。

```bash
pnpm exec convex env remove ANALYTICS_RESET_ENABLED_UNTIL \
  --deployment <fully-qualified-deployment>
```

resetは次の順で進みます。

1. 旧control table、旧日次table、日次KPI、canonical派生tableを固定allowlistで有界削除する。
2. 現在の組織、店舗、person、manager、staff、継続cycle候補を運用tableからseedする。
3. full scan完了時刻を`resetWatermarkAt`へ固定する。
4. `[sourceCaptureStartAt, resetWatermarkAt)`のsource eventを絶対値upsertで再適用する。
5. 切替前に終了したcycle候補を削除し、milestone、通常周期、healthを切替後の事実だけへ制限する。
6. 参照整合性を検証し、runを`complete`へ変える。

進捗は`analytics/runs:getStatus`で確認します。

```bash
pnpm exec convex run analytics/runs:getStatus '{}' \
  --deployment <fully-qualified-deployment>
```

`reset.status: complete`以外は完了ではありません。
`analyticsRuns`の対象rowをDashboardで開き、`sourceCaptureStartAt`、`resetWatermarkAt`、`dataStartAt`、`dataStartDate`、`terminalAt`を記録します。

`dataStartAt`は`resetWatermarkAt`より後の最初のJST 00:00でなければなりません。
組織登録日は`organizations.createdAt`、店舗登録日は`shops._creationTime`から保たれ、切替前milestoneと終了済みcycle rateがseedされていないことを代表行で確認します。

## Narrow readiness確認

resetが`complete`になった後、固定されたread-only queryでNarrow条件を確認します。
operatorがinline queryを組み立てず、Narrow前のWiden revisionに含まれる`analytics/reset` moduleの`getNarrowReadiness`を使います。
返却値はbooleanだけで、row ID、表示名、source payloadを含みません。

```bash
pnpm exec convex run analytics/reset:getNarrowReadiness '{}' \
  --deployment <fully-qualified-deployment>
```

次をすべて確認します。

- `resetComplete: true`
- `legacyTablesEmpty: true`
- `legacyGenerationFieldsEmpty: true`
- `sourceEventsBeforeCaptureEmpty: true`
- `readyForNarrow: true`

このreadbackは、Narrowで削除する旧5table、旧`generation`付き派生行、最新resetの`sourceCaptureStartAt`より前のsource eventを固定probeで検査します。
旧lease時間の15分を過ぎてから同じfunctionを再実行し、再びすべてが`true`であることを確認します。
一つでも`false`へ戻った場合は旧writerまたは旧scheduled callが残っているため、Narrowを止めます。

Widen schemaは、このreadiness確認が終わるまで維持します。
reset cleanupと現在状態のseedがWiden下で完了して初めて、旧field、旧index、旧tableを削除するNarrowへ進めます。
`getNarrowReadiness`自体も削除対象tableとindexに依存するためNarrowで削除し、確認結果はNarrow前の証跡として保存します。

## Narrow

Narrow readinessの証跡より後の別revisionで、次をNarrowします。

- `analyticsDailyServiceSnapshots`
- `analyticsDailyShopSnapshots`
- `analyticsDailyEventCounts`
- `analyticsAggregationJobs`
- `analyticsPipelineStates`
- retained tableの`generation`、派生行の旧`schemaVersion`、旧generation index
- `analyticsOrganizations.pendingOrganizationProjectionJobKey`
- 日次五tableの旧generation fieldとindex
- Widen中optionalにした`runId`、`kpiEligible`、`kpiEligibleShopCount`

同じNarrow revisionへ、既存の`analytics/nightly:startForDate`を再利用する初回即時partial、初回用cutoff、publish invariant、daily manifestの公開履歴起点の変更を含めます。
新しいFunction、field、statusは追加せず、reset rowの`dataStartDate`と`dataStartAt`も変更しません。

Narrow版をdeployする前に、旧revisionのWorker、cron、手動runbookが削除対象tableをreadまたはwriteしないことを確認します。
旧scheduled callのno-op互換stubは、このNarrow deployでは残します。

Narrow deploy後に`analytics/runs:getStatus`を再実行し、reset runが`complete`のまま、Dashboardが初回日次前の`unavailable`を返すことを確認します。

## 初回manual daily

cron gateを`false`のまま、Narrow deploy後に待機せず開始します。
resetが完了したJST日を`D`とすると、対象日は`D`、reset rowの`dataStartDate`は`D+1`です。
reset rowの`dataStartDate`と`dataStartAt`は変更しません。
初回daily manifestの`dataStartDate`だけを`D`とし、Dashboardへ公開する履歴の起点にします。
Narrow deployと初回manual dailyはreset完了と同じJST日内に終えます。日付を跨いだ場合はこのpartialを開始せず、cron gateを`false`のまま停止条件として再計画します。
fallbackとして、reset rowの`dataStartDate`が終了した後、その日付を対象に同じFunctionから最初の完全日次を開始できます。

同日partialは次の引数で開始します。

```bash
pnpm exec convex run analytics/nightly:startForDate \
  '{"targetDate":"<reset-complete-date>"}' \
  --deployment <fully-qualified-deployment>
```

fallbackの完全日次は次の引数で開始します。

```bash
pnpm exec convex run analytics/nightly:startForDate \
  '{"targetDate":"<reset-data-start-date>"}' \
  --deployment <fully-qualified-deployment>
```

`startForDate`は初回切替確認専用です。
すでにdaily runが一件でもある場合は開始しません。
同日partialではreset完了日だけを対象にし、fallbackの完全日次では終了済みのreset rowの`dataStartDate`だけを対象にします。
同日partialの`cutoffAt`はFunction実行時刻であり、`inputFromAt`はresetの`sourceCaptureStartAt`です。
対象時間は一日未満になり得ますが、専用のpartial statusやfieldを持たず、通常の日次と同じ`complete`としてpublishします。

次のqueryで`daily.status: complete`を確認します。

```bash
pnpm exec convex run analytics/runs:getStatus '{}' \
  --deployment <fully-qualified-deployment>
```

次を同じ証跡へ残します。

- `runKey`が`daily:<reset-complete-date>`
- reset rowの`dataStartDate`が`D+1`、初回daily manifestの`dataStartDate`が`D`になっている
- reset rowと初回daily manifestの`dataStartAt`が`D+1` 00:00 JSTから変わっていない
- `cutoffAt`が初回Function実行時刻で、未来の日末を指していない
- `stage`、`stepVersion`、`startedAt`、`terminalAt`
- `sourceFacts`から`publish`までの構造化logと全run時間
- service、notification、organization、shop、segmentの日次行が同じ`runId`
- publish前invariantが成功し、日次runが`complete`
- Dashboard metadataが`availability: available`、`asOf: <initial-cutoff-at>`、`dataStartDate: <reset-complete-date>`、`latestCompleteSnapshotDate: <reset-complete-date>`を返す
- Dashboardの期間集計と比較が初回partialを通常のcomplete日次として含み、専用のpartial表示を出さない
- 切替前日次rowがなく、既存店舗の登録日と切替後の現在値、health、完全なcycle rateが表示される
- 既存店舗の初回募集以降のmilestoneが、未達ではなく「算出対象外」と表示される
- notification本文、credential、PII、任意error messageがresponseとlogへ出ていない

初回manual dailyが`failed`になっても、同じ対象日を再実行しません。
公開前の初回成功をやり直す場合は、原因を修正した新revisionと新しい固定境界で破壊的resetを全消去から行い、新しい`dataStartDate`を作ります。

## cron gateと外部alert

初回manual dailyの成功後に、cron gateを文字列`true`へ変えます。

```bash
pnpm exec convex env set ANALYTICS_NIGHTLY_CRON_ENABLED 'true' \
  --deployment <fully-qualified-deployment>
```

有効になる定期処理は次の二つだけです。

| cron | JST | 役割 |
|---|---|---|
| `analytics-nightly-daily` | 毎日03:00 | 終了済みの前日を集計 |
| `analytics-weekly-maintenance` | 月曜04:00 | PII redaction、retention、直近7日の日次出力監査、現在canonical参照監査 |

reset完了日を`D`とした最初の二回は、次の結果になります。

| 実行時刻 | cronの対象日 | 結果 |
|---|---|---|
| `D+1` 03:00 | `D` | 初回manual runが存在するためno-op。新しいrun行と日次行を作らない |
| `D+2` 03:00 | `D+1`（reset rowの`dataStartDate`） | `D+1` 00:00から翌日00:00までの完全な日次snapshotを作る |

`D+2`のrunは、初回manual runの`cutoffAt`からsource eventを再適用します。
このため、初回実行後のeventを飛ばさず、通知集計は`D+1`の00:00から翌日00:00までになります。
`D+2`以降のdaily manifestも`dataStartDate: D`と`dataStartAt: D+1 00:00 JST`を引き継ぎます。

weekly maintenanceは、400日のhard deadlineを越えないよう期限の14日前からopportunityの本人参照をcycle単位でredactします。
その後にretentionを行い、直近7日分の保存済み日次行のscope、率、rollup、`runId`を監査します。
保存済み行の不整合が確定した日だけdaily runを`failed`へ変えます。
最後に現在のcanonical factのtenant参照とcycle、opportunityの整合性を監査します。
過去日を現在のcanonical factから再計算する監査は行いません。

`D+1` 03:00のno-op、`D+2` 03:00の最初の完全な自動日次、weekly maintenanceについて、`analytics/runs:getStatus`、Function logs、実行時間、read/write document数とbytesを記録します。
最大想定件数でscope上限またはConvex function limitへ達した場合は、不完全値を許可せず、query形状またはscope上限の設計を見直します。

外部監視には、次の条件を設定します。

| 条件 | alert条件 |
|---|---|
| daily未開始 | JST 03:15までに前日分の`analytics_run_started`がない。ただし初回翌日の予定されたno-opは除外する |
| daily期限超過 | JST 15:00までに同じrunの`analytics_run_complete`または`analytics_run_failed`がない |
| terminal failure | daily、reset、maintenanceの`analytics_run_failed`を検知した |
| reset期限超過 | reset開始から12時間以内にterminal logがない |
| maintenance欠落 | 前回の`analytics_maintenance_complete`から8日を超えた |
| redaction接近 | maintenanceが報告する最古未処理期限が7日以内になった |

missing、期限超過、terminal failure、redaction接近の各test alertを一回ずつ送信し、通知先、owner、event IDまたは画面証跡を[リリース状態](release-status.md)へ記録します。
監視の送信状態とerror本文はAnalytics DBへ複製しません。

## 日次失敗とreset失敗

日次runが失敗した場合、その日は永久欠損です。
同日retry、過去日の再集計、backfillは行いません。

原因を修正しても、次のcronは次の対象日だけを作ります。
次のrunは最後に成功した`cutoffAt`からsource eventを再適用するため、canonical factは収束しますが、失敗日のsnapshotは作りません。

同じsource eventを処理できないerrorは、最後の成功cutoff以降を再適用する後続runでも繰り返します。
code修正で安全に処理できる場合は次の対象日で収束させ、source fact自体が不完全で再生できない場合は、cron gateを無効にして新しい固定境界から破壊的resetを行います。
このresetも失敗日のsnapshotを補修せず、新しい`dataStartDate`から再開します。

`running`のまま停止した日次runは、12時間を過ぎた後の次回開始時に`failed`へ変わります。
毎分の回収処理はなく、期限超過自体は外部監視が検知します。

resetが失敗した場合、保存cursorから再開しません。
cron gateとreset enableを無効にし、Convex logの安全なerror codeから原因を修正します。

修正後は、新revisionまたは新しいJST 00:00境界でreset identityを作り、4環境変数、dry run、`start`を取り直します。
新しいresetは旧派生tableをもう一度全消去し、seedからやり直します。

unknownな例外本文、stack、source payloadはDBにも外部証跡にも保存しません。
詳細調査にはアクセス制限されたConvex logsと外部監視を使います。

## Workerと実環境確認

Analytics UIとWorkerを同じ対象revisionで配信し、[セキュリティ再検証](security-validation.md)の次を確認します。

- `ENV-BI-01`: 未認証ではHTMLとAPIへ到達できない。
- `ENV-BI-02`: service credentialがbrowserへ露出しない。
- `ENV-BI-03`: `availability: unavailable`または欠損期間を古い正常値や`0`として表示しない。
- `ENV-BI-04`: body上限をstream途中で拒否する。
- `ENV-BI-05`: 最大想定量の負荷とresponse sizeを記録する。

Analytics一覧は初期50件、最大100件、`/requests`は最大50件、trendは最大366点、responseは512 KiB未満であることも記録します。
`/requests`だけはrunの公開可否と独立し、`featureRequests`と現在の`shops`を直接読みます。

## 旧互換stubの削除境界

`convex/analytics/pipeline.ts`の互換stubは、旧revisionが予約したscheduled callをNarrow後も吸収するため、一回は残します。
次の条件をすべて満たした後の別deployでだけ削除します。

1. 旧cronと旧callerを作るrevisionが全environmentからなくなっている。
2. freezeから旧lease時間の15分を超えている。
3. `getNarrowReadiness`の再確認とNarrow deployが完了している。
4. 初回manual daily、翌日03:00のno-op、翌々日03:00の完全な自動daily、weekly maintenanceを確認している。
5. 旧schedule時刻を含む24時間以上、`analytics_legacy_call_ignored`が新たに出ていない。
6. 手動runbook、Dashboard、固定referenceに旧function名が残っていない。

削除deploy後も`analyticsRuns`、新cron、Dashboard availabilityを確認します。
旧互換stubを削除するために、旧Analytics履歴や削除済みtableを復元しません。

## 停止条件と証跡

次のいずれかに当てはまる場合は、後続工程を止めます。

- 完全修飾deployment名、revision、`sourceCaptureStartAt`を一意に特定できない。
- dry runが`allowed: false`、またはserver設定と要求値が一致しない。
- reset、daily、maintenanceのrunが`failed`または期限超過になった。
- 初回manual dailyの開始前に、resetが完了したJST日を跨いだ。
- 初回翌日の03:00にno-op以外のdaily runが作られた、または翌々日の03:00にreset rowの`dataStartDate`を対象とする完全なdaily runが作られなかった。
- LINE readinessで50件超過を検出した。
- tenant参照、rollup、rate pair、runIdのinvariantに違反した。
- Narrow readinessの一項目が`false`、または待機後に再増加した。
- credential、PII、通知payload、任意error messageがresponseまたはlogへ出た。
- 初回日次前にcron gateが`true`になっている。

実環境の結果は[リリース状態](release-status.md)へ、次を一組として記録します。

- Widen、Narrow、cron gate有効化、互換stub削除の各revision
- 完全修飾deployment名
- `sourceCaptureStartAt`、`resetWatermarkAt`、`dataStartAt`、reset rowとdaily manifestそれぞれの`dataStartDate`
- dry run readback、reset run、初回partial run、翌日03:00のno-op、翌々日03:00の最初の完全な自動runの状態
- `getNarrowReadiness`の初回・再確認証跡
- Function logs、実行時間、負荷、Dashboard metadata
- 外部alertの疎通証跡と確認者

## 関連ファイル

- `convex/analytics/config.ts`
- `convex/analytics/runs.ts`
- `convex/analytics/reset.ts`
- `convex/analytics/nightly.ts`
- `convex/analytics/maintenance.ts`
- `convex/analytics/observability.ts`
- `convex/analytics/pipeline.ts`
- `convex/crons.ts`
- [分析KPI蓄積基盤](../features/analytics.md)
- [分析KPI可視化アプリ](../features/analytics-dashboard.md)
- [Analytics夜間バッチ簡素化 実装計画](../plans/2026-08-08_Analytics夜間バッチ簡素化_実装計画.md)
