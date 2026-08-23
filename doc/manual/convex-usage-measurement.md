# Convex function利用量の計測

## 目的

Convex Log Streamからexportした現行形式の`function_execution` eventを、外部接続なしで集計します。  releaseごとの呼出量と1 call当たりの負荷を分け、アクセス量の変化とfunction自体のread増加を区別します。

集計toolはJSON array、JSONL、Axiomの`{"data": event}`形式を受け取ります。  Productionへの接続、Log Streamの作成・変更、外部sinkからのexportは行いません。

## 証跡の状態

| 状態 | 完了条件 |
|---|---|
| Repository implemented | `scripts/summarizeConvexFunctionExecutions.ts`の対象Logic testとsample集計が成功している |
| External configured | Convex Dashboardで対象deploymentのLog Streamに`function_execution` topicが設定され、転送先でeventを検索できる |
| Production observed | 完全修飾deployment、commit SHA、UTC期間、export元を記録した実eventを集計し、対象releaseの結果を保存している |

コードとtestが存在しても、External configuredまたはProduction observedとは判定しません。  外部設定と実環境の確認結果は[リリース状態](release-status.md)へ記録します。

## 計測単位

集計keyは`convex.project_slug`、`convex.deployment_name`、function path、function typeです。  新しいfunctionは追加設定なしで集計対象になり、renameしたfunctionは比較結果で`removed`と`added`に分かれます。

JSONは次の値を全体とfunction別に出力します。

| 分類 | 値 |
|---|---|
| 呼出し | calls、success、failure、cached、run reason |
| Database | read/write documents、read/write bytesのtotalとper-call |
| その他のusage | text/vector search bytes、file storage read bytes、network egress、audit log egressのtotalとper-call |
| 実行 | execution timeのp50・p95。nearest-rank方式 |
| 競合 | mutation retryのcall数・合計回数、OCC event数・retry合計 |

Markdownは初動確認用に、呼出し、Database、network egress、p50・p95、mutation retry、OCCの主要列へ絞ります。  text/vector search、file storage、audit log egressを含む完全な比較と機械処理にはJSONを使います。

引数、戻り値、`error_message`、stack、OCCのdocument ID・table、request ID、個人情報は出力しません。  `function_args_bytes`と`function_returns_bytes`も出力対象外です。  不正なrecordは内容を表示せず件数だけを記録します。

## 単一releaseの集計

1. Convex Dashboardで対象deploymentを確定し、eventの`convex.project_slug`と`convex.deployment_name`の実値を記録して、export対象と一致することを確認する。
2. 対象releaseの完全なcommit SHAを記録する。
3. UTCの開始・終了を決め、転送先からその期間の`function_execution`をJSON arrayまたはJSONLでexportする。
4. 次を実行し、MarkdownまたはJSONをアクセス制限された場所へ保存する。

```bash
pnpm exec tsx scripts/summarizeConvexFunctionExecutions.ts summary \
  --input ./function-executions.jsonl \
  --release FULL_COMMIT_SHA \
  --period-start 2026-08-10T00:00:00Z \
  --period-end 2026-08-17T00:00:00Z \
  --format markdown
```

期間は`period-start`以上、`period-end`未満です。  入力に期間外eventがあれば集計から除外し、`outsidePeriodEvents`へ件数を出します。

## release間の比較

同じ曜日構成、同じ長さ、近い季節性の期間を使います。  toolはbaselineとcurrentの期間長が一致しない比較を拒否します。  call総数だけでなくper-callを併記し、利用者数や操作構成が大きく異なる期間を性能回帰として直接比較しません。

```bash
pnpm exec tsx scripts/summarizeConvexFunctionExecutions.ts compare \
  --baseline ./baseline-function-executions.jsonl \
  --baseline-release BASELINE_COMMIT_SHA \
  --baseline-start 2026-08-03T00:00:00Z \
  --baseline-end 2026-08-10T00:00:00Z \
  --current ./current-function-executions.jsonl \
  --current-release CURRENT_COMMIT_SHA \
  --current-start 2026-08-10T00:00:00Z \
  --current-end 2026-08-17T00:00:00Z \
  --format json
```

比較結果は継続functionを`persisting`、新規functionを`added`、消えたfunctionを`removed`に分類します。  total、per-call、p50・p95はbaseline、current、絶対差、変化率を保持します。  baselineが0の場合は変化率を`null`とし、無限大の値を作りません。

## 解釈と停止条件

[Convex Log Streams](https://docs.convex.dev/production/integrations/log-streams)はbest-effort配信です。  高負荷時には欠落し、network retryでは重複する可能性があります。  toolはdeployment、request ID、function、type、timestampから作る安定keyで重複を除きますが、欠落したeventは復元できません。

read totalが増えた場合は、calls、run reason、per-callの順に確認します。  query subscriptionの`dataChange`増加と、同じcall数でのread documents増加を同じ原因として扱いません。  Log Streamの欠測、export条件、release期間が揃わない場合は結論を保留します。

この結果だけを根拠にschema、index、denormalized counter、pagination、public APIを変更しません。  functionのcode pathと対象tableの増加特性を確認し、schema・index・保存形式の変更が必要ならmigrationとrehearsalを別作業にして停止します。  固定予算、自動合否、自動最適化はこのtoolへ追加しません。

## 公開Web Vitalsとの関係

公開サイトのWeb Vitalsには既存の`release_id`があります。  Convex集計と同じcommit SHA・期間へ揃えると、公開ページの表示性能とbackend function利用量をrelease単位で並べて確認できます。

Web Vitalsは同意済みの公開routeだけを対象とし、認証後画面、全利用者、特定店舗の操作を表しません。  両計測をuser単位で結合せず、それぞれの欠測と対象surfaceを分けて解釈します。  詳細は[公開サイトのWeb計測](../features/web-measurement.md)を参照してください。

## 対象外

このtoolは`function_execution`だけを扱います。  `current_storage_usage`、storage URLの直接downloadを表す`storage_api_bandwidth`、scheduler lag、concurrency、外部provider料金は含みません。  action memoryと引数・戻り値のbyte数も出力しないため、Convex請求額を完全再現するbilling toolではありません。
