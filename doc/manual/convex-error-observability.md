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

## ログの安全境界

`context`へ出せるのは、serverで解決したactor・組織・店舗などの内部IDと、明示的に許可した要求ID、固定enum、
boolean、件数だけです。  値とfield数には上限があり、許可されていないfieldは出力しません。

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
- PostHogで`console`と`function_execution`を同じrequest IDで検索できる。
