# 開発用網羅シード

> [!CAUTION]
> この手順は、対象deploymentの全テーブルを空にしてから、開発用データへ置き換えます。  Production、Preview、共有先を対象にせず、残す必要があるデータは実行前にbackupまたはexportを取得してください。

> 文書種別: manual
>
> 対象: local Convex deployment、または固定したDevelopment deployment

このシードは、開発画面でFree、Trial、Standard、Pro、通知失敗、課金制限などを確認するためのデータセットです。  Snapshotの復元やE2E fixtureの初期化には使いません。

## 実行できる対象

実行先は、次の二つに固定されています。  CLIへdeployment名や別のenv fileを渡すことはできません。

| 対象 | 固定env file | 必須の`CONVEX_DEPLOYMENT` | 実行コマンド |
|---|---|---|---|
| local | `.env.local` | `local:<deployment-name>` | `pnpm convex:seed:local` |
| Development | `.env.develop` | `dev:<deployment-name>` | `pnpm convex:seed:dev -- --yes` |

`.env.local`と`.env.develop`はGitへ追加しません。  Productionを指す値、`/`形式やprefixだけの値、対象と一致しない値、複数の`CONVEX_DEPLOYMENT`があるファイルでは、削除前にCLIが停止します。  `CONVEX_DEPLOY_KEY`、`CONVEX_DEPLOYMENT_TOKEN`、self-hosted用URLまたはadmin keyが同じファイルにある場合も実行しません。

## 実行前の準備

### 対象deploymentとコード

対象deploymentと現在のbranchを先に照合します。  Developmentで既存データを残す必要がある場合は、対象を完全修飾したbackupまたはexportを取得し、復元先と保管期限も決めます。

シード用functionは、対象deploymentへ事前に反映しておきます。  `scripts/seedDevelopmentData.ts`は`convex run`へ`--push`を渡さないため、このコマンド自体はローカルコードを自動反映しません。

localでは、現在の`convex/`を読み込んだlocal Convex serverが動作していることを確認します。  Developmentでは、対象commitのfunctionが通常の開発用deploy手順で反映済みであることを確認します。

### 破壊的helperの環境guard

対象Convex deploymentへ、次の三条件をすべて設定します。  値はDashboardまたは対象を固定した対話入力で設定し、コマンド履歴、文書、Issue、ログへ残しません。

| 変数 | 必須値 |
|---|---|
| `DEVELOPMENT_SEED_ENABLED` | `true` |
| `DEVELOPMENT_SEED_DEPLOYMENT_URL` | 同じdeploymentの`CONVEX_CLOUD_URL`と正規化後に一致するURL |
| `NOTIFICATION_DELIVERY_MODE` | `dry-run` |

`convex/developmentSeed/`の各internal functionは、呼び出しごとに三条件を再確認します。  CLI側の固定target確認だけでは、backendの削除権限を有効にできません。

`DEVELOPMENT_SEED_ENABLED=true`は、実行直前から後処理までの間だけ設定します。  CLIはConvexの環境変数を変更しないため、成功・失敗にかかわらず、作業を止める時点で`DEVELOPMENT_SEED_ENABLED`を`false`にするか削除します。  再実行するときだけ、対象deploymentを再確認して`true`へ戻します。

`NOTIFICATION_DELIVERY_MODE=dry-run`は、シードデータを利用している間も維持します。  `DEVELOPMENT_SEED_ENABLED`の無効化と一緒に配送modeを戻しません。

追加組織、店舗追加、管理者招待、課金画面の確認に、機能ごとの環境変数は不要です。  通知は`dry-run`のまま確認します。  実際のメールやLINEを送るために配送modeを変えると、シード用functionのguardが失敗します。

## 作成する九つのシナリオ

各シナリオは一つの組織として作成されます。  主利用者は全組織の有効な管理者ですが、組織作成上限を回避するため、作成者は代表シナリオだけで主利用者になります。

| シナリオ | 主な確認対象 |
|---|---|
| `free-capacity` | Free上限、募集承認を実行できない状態 |
| `trial-ending` | Trial終了間近、募集承認を実行できる状態 |
| `standard-operations` | Standard、複数店舗、三つの希望シフト提出方式、全募集状態、スタッフのカスタム並び順 |
| `pro-notifications` | Pro、通知失敗、LINE連携、確定後の差分 |
| `standard-scheduled-change` | Standardの解約予約 |
| `payment-pending` | 課金の`pendingActivation` |
| `payment-grace` | 支払猶予中 |
| `free-over-limit` | Freeの管理者上限超過と、`limitRecoveryOnly`での整理導線 |
| `standard-over-limit` | Standardの管理者上限超過と、`limitRecoveryOnly`での整理導線 |

メールアドレスは`example.test`、LINE識別子は架空値を使います。  通知Outbox、fan-out、遅延deadline、cleanup、Stripe処理、scheduled functionは、実行可能な状態で残しません。

## 実行

localを置き換える場合は、次を実行します。

```bash
pnpm convex:seed:local
```

固定したDevelopment deploymentを置き換える場合は、明示的な確認引数を付けます。

```bash
pnpm convex:seed:dev -- --yes
```

CLIは、次の順番で処理します。  一つの段階が失敗した場合はnonzeroで終了し、後続段階を実行しません。

1. target、deployment URL、反映済みbackendの契約version・catalog fingerprint、三つのbackend guardをpreflightで確認する。
2. `pending`のscheduled functionをbounded pageで取り消す。
3. `inProgress`が0件であることを確認する。
4. 全テーブルをbounded batchで削除する。
5. 共通actorと九つのシナリオを順番に作る。
6. table coverage、シナリオ件数、参照整合性、実行可能な非同期処理が0件であることを検証し、同じtransactionで一時的なaudit証跡を削除する。

各phaseは、起動時に一度だけ検証した`CONVEX_DEPLOYMENT`を子processの固定環境へ渡し、`--deployment local`または`--deployment dev`でも対象種別を固定します。  実行途中にenv fileが変更されても、別deploymentへ切り替えません。

標準出力には、段階、件数、完了状態だけを表示します。  Clerk識別子、メールアドレス、token、Convex CLIの生エラー、parseできなかった応答本文は表示しません。

コマンドが終了したら、成功・失敗のどちらでも`DEVELOPMENT_SEED_ENABLED`を`false`にするか削除します。  CLIが環境変数を自動変更したとみなさず、対象deploymentで無効になったことを確認します。

## Clerk Development利用者との紐付け

シード直後の主利用者は、架空の`authTokenIdentifier`を持つため、そのままでは実際のClerk sessionと一致しません。  Clerk Development instanceの専用テスト利用者を一人選び、Convex Dashboardで主利用者の`users`一行だけを更新します。

1. 対象のClerk Development instanceとConvex Development deploymentが対応していることを確認する。
2. 専用テスト利用者の現在のClerk identityから、Convexが解決する`identity.tokenIdentifier`をアクセス制限された場所で確認する。
3. `users.email`が`primary-manager@seed.example.test`の行を一件だけ開く。
4. その行の`authTokenIdentifier`だけを、手順2の完全一致値へ置き換える。
5. ログインし、九つの組織と対象店舗を切り替えられることを確認する。

`organizationPeople.userId`と`organizationMembers.userId`は、すでに同じ`users._id`を参照しています。  ほかのdocument、シフト連絡先、請求先メールを変更しません。

Clerk User ID、JWT、session token、`identity.tokenIdentifier`の値は、Issue、ログ、スクリーンショット、共有文書へ残しません。

## 再実行と失敗時の復旧

同じコマンドを再実行すると、既存データを再度すべて削除し、その日のJST暦日を基準に九つのシナリオを作り直します。  部分的なseedへ追記して修復するコマンドではありません。

| 停止位置 | deploymentの状態 | 対応 |
|---|---|---|
| preflight前、またはtarget不一致 | データ変更なし | env file、反映済みfunction、三つのguardを確認してから再実行する |
| scheduled function確認中 | `pending`の予約だけが一部取り消されている可能性がある | `inProgress`の終了を待ち、通常workflowへの影響を確認してから再実行する |
| 全テーブル削除以降、完了検証より前 | 開発画面で利用できない部分状態 | 利用を止め、原因を修正して同じコマンドを先頭から再実行する |
| 完了検証の失敗 | データは存在するが完成条件を満たさない | 完了扱いにせず、検証エラーの分類後に再実行する |

どの停止位置でも、調査中は`DEVELOPMENT_SEED_ENABLED`を`false`にするか削除します。  原因を解消し、対象deploymentと`dry-run`を再確認した後、再実行の直前だけ`true`へ戻します。

実行前のデータへ戻す場合は、事前に取得したbackupまたはexportを使います。  シードを逆向きに実行して復元することはできません。

## 既存のrestoreとE2E helperとの分離

`pnpm convex:save`と`pnpm convex:restore`は、`convex-seeds/scripts/`が扱うsnapshotの保存と復元です。  開発用の九シナリオを生成するこの手順とは、入力、目的、復旧契約が異なります。

E2Eと自動テストのfixtureは、隔離されたmockまたはE2E用deploymentと既存のtest helperを使います。  自動テストから`pnpm convex:seed:local`や`pnpm convex:seed:dev`を呼び出さず、開発用シードをテスト間cleanupの代わりにしません。

## 完了条件

CLIが完了を表示した後、次を確認します。

- 九つのシナリオと九つの組織が存在する。
- catalog対象の全tableがseedまたは意図的な空tableとして検証される。
- activeなOutbox、fan-out、遅延deadline、scheduled functionが0件である。
- Clerkを紐付けた主利用者が対象組織と店舗を切り替えられる。
- `DEVELOPMENT_SEED_ENABLED`が`false`または未設定へ戻っている。
- `NOTIFICATION_DELIVERY_MODE=dry-run`が維持されている。
- secret、token、メールアドレス、Clerk識別子を実行ログへ記録していない。

この確認はlocalまたはDevelopmentへのシード完了を示します。  Productionへの反映、migration、provider疎通、実配送の完了を意味しません。
