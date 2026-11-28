# Convexエラーログの確認

Convex functionのhandler実行が失敗したときは、Convex標準の`function_execution`と、シフトリが出力する
`convex_function_error_context`を同じrequest IDで突き合わせます。  標準イベントは失敗したfunctionと例外を示し、
シフトリ側のconsole eventは調査に必要な安全なcontextだけを補います。

## 前提

Convex DashboardのLog Streamで、転送先の`function_execution`と`console` Topicを有効にします。  この設定は
repositoryからは判定できないため、転送先を変更したときはDashboardとPostHogの両方で確認してください。

## 調査手順

1. PostHogのLogsで`convex_function_error_context`を検索する。
2. 対象eventのrequest IDを確認する。
3. 同じrequest IDの`function_execution`を開き、失敗したfunctionと発生時刻を確認する。
4. `context`の組織・店舗・対象IDを使い、保存済み状態と直前の操作を確認する。

`function_execution`だけが見つかる場合は、引数validatorや戻り値serializationでhandlerの外側が失敗していないか、対象functionが
共通の観測builderを通っているか、Log Streamの`console` Topicが有効かを確認します。  `console` eventだけを根拠に、
処理の失敗、rollback、外部providerの成否を確定しません。

PostHogのError Trackingには、Convex DashboardのException Reportingが例外を送ります。  例外の`convex_request_id`で
同じrequest IDのLogsを検索すると、組織・店舗などのcontextを確認できます。  Exception Reportingの例外には、
コードから項目を足せません。

## 想定内のエラー

利用者の通常の操作で起き、画面が理由と次の操作を案内する失敗は、`expectedConvexError(kind, data)`で作ります。  利用者へ届く内容は
`new ConvexError(data)`と同じです。  Logsへは`failureKind: "expected"`と`expected_<kind>`などの`errorCode`を付けて、
warnで出力します。  errorで出力されるLogsは直すべき失敗だけになります。

`kind`は次の7つです。

| kind | 例 |
|---|---|
| `plan_limit` | 利用人数・店舗数・管理者数の上限、契約状態による制限 |
| `business_rule` | 最後の店舗の削除、ポジションの登録数、確定済みの募集の変更 |
| `already_exists` | 登録済みのメールアドレス、所属済みの組織、ほかの人と連携済みのLINE |
| `stale_state` | 画面を開いた後に、ほかの操作で状態が変わった |
| `time_passed` | 締切や日付を過ぎた |
| `rate_limited` | 短時間の連続操作、1日の回数上限 |
| `auth_expired` | ログインやリンクの期限切れ |

画面で先に止めている入力チェック、保存済みデータの不整合、安全のための取得上限は、想定内にしません。  サーバーで失敗したときは、
画面とサーバーの条件の食い違いや、データ量が設計の想定を超えたことを示すためです。  `Not found`も、想定内の場合と不具合の場合が
同じ文面になるため、想定内にしません。

action境界では、mutationの例外が別のobjectとして作り直されます。  このため、`USAGE_LIMIT_EXCEEDED`など構造化した`code`を
持つ想定内のエラーは、`code`でも判定します。

Error Trackingでは、PostHogのSuppression Ruleで想定内のエラーの文面を取り込みません。  想定内のエラーを追加した場合や
文面を変えた場合は、ルールの条件も更新してください。

## ログの安全境界

`context`へ出せるのは、serverで解決したactor・組織・店舗などの内部IDと、要求ID、固定enum、boolean、件数だけです。  値と
field数には上限があり、許可されていないfieldは出力しません。

要求IDは引数のうち`organizationId`、`shopId`、`staffId`、`recruitmentId`、`userId`など決めた名前の項目から、
Convex IDの形をした値だけを拾います。  利用者が指定した未検証の値なので、`requested`で始まるfieldに分けて出力します。  field数の
上限を超える場合は、serverで解決した値を残します。

次の情報は出力しません。

- functionの引数・戻り値全体
- 氏名、メールアドレス、通知本文などの個人情報
- session token、magic link、authorization header、secret
- provider response、Webhook body、生のerror message、stack

観測処理が失敗しても、元のConvex functionの例外を同じobjectのまま再送出します。  ログ出力を業務処理や
監査記録の代わりには使いません。

## 実装変更時の確認

Convex functionは`convex/_lib/errorObservability.ts`のobserved builder、または
`convex/_lib/functions.ts`の認証・scope付きbuilderで登録します。  `pnpm lint`はraw builderの新しい使用を検出します。

変更時は、少なくとも次を確認します。

- 元の例外が置き換わらない。
- error message、stack、メールアドレス、token、raw payloadがeventへ含まれない。
- 許可したcontextだけが長さとfield数の上限内で出力される。
- 想定内のエラーはwarn、それ以外の失敗はerrorで出力される。
- PostHogで`console`と`function_execution`を同じrequest IDで検索できる。
