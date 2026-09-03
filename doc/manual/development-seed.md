# 開発用網羅シード

> [!CAUTION]
> この手順は、対象deploymentの全テーブルを空にしてから、開発用データへ置き換えます。  Shiftori Production、Preview、固定したDevelopment以外の共有先を対象にせず、残す必要があるデータは実行前にbackupまたはexportを取得してください。

> 文書種別: manual
>
> 対象: `.env.local`が指す個人用Convex dev deployment、または固定したDevelopment projectのdeployment

このシードは、開発画面でFree、Trial、Standard、Pro、通知失敗、課金制限などを確認するためのデータセットです。  Snapshotの復元やE2E fixtureの初期化には使いません。

## 実行できる対象

実行先は、次の二つに固定されています。  CLIへdeployment名や別のenv fileを渡すことはできません。

| 対象 | 固定env file | 必須selector | 実行コマンド |
|---|---|---|---|
| local | `.env.local` | `CONVEX_DEPLOYMENT=dev:<personal-deployment-name>` | `pnpm convex:seed:local` |
| Development | `.env.develop` | `CONVEX_DEPLOY_KEY`（`prod:` prefix） | `pnpm convex:seed:dev` |

この手順でいうlocalは、Convexのlocal backendではなく、`.env.local`が指す個人用cloud dev deploymentです。  `CONVEX_DEPLOY_KEY`は不要であり、設定されている場合は削除前にCLIが停止します。

Developmentは、Shiftori Productionとは別のDevelopment projectのdefault deploymentです。  そのためdeploy keyの`prod:`はConvex上のdeployment typeを表しますが、Shiftori Productionを意味しません。  `.env.develop`ではこのkeyを一つだけ許可し、`CONVEX_DEPLOYMENT`との併記、Preview／project key、`CONVEX_DEPLOYMENT_TOKEN`、self-hosted用URLまたはadmin keyを拒否します。

`.env.local`と`.env.develop`はGitへ追加しません。  両ファイルは上表のselector構成を維持します。  Clerk利用者の識別子はここへ書かず、対象ごとのConvex deployment環境変数へ設定します。

## 実行前の準備

### 対象deploymentとコード

対象deploymentと現在のbranchを先に照合します。  Developmentで既存データを残す必要がある場合は、対象を完全修飾したbackupまたはexportを取得し、復元先と保管期限も決めます。

シード用functionは、対象deploymentへ事前に反映しておきます。  `scripts/seedDevelopmentData.ts`は`convex run`へ`--push`を渡さないため、このコマンド自体はローカルコードを自動反映しません。

localでは、Convex CLIへログインした状態で、個人用dev deploymentへ対象commitのfunctionが通常の`convex dev`で反映済みであることを確認します。  Developmentでも、対象commitのfunctionが通常の開発用deploy手順で反映済みであることを確認します。

### 破壊的helperの環境guard

対象Convex deploymentへ、次の設定に加え、対象Clerk instanceの`CLERK_JWT_ISSUER_DOMAIN`を設定します。
[デバッグ環境変数の運用](debug-mode.md)に従って完全修飾deploymentを指定し、値は対話入力します。

| 変数 | 値 | 扱い |
|---|---|---|
| `DEBUG_MODE` | `true` | seedの全削除helperを有効にするため必須 |
| `DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER` | 専用Clerk Development利用者の`identity.tokenIdentifier`と完全一致する値 | seedデータへ保存する主利用者として必須 |
| `DEBUG_NOTIFICATION_DELIVERY_MODE` | `dry-run` | seedデータで外部通知を送らないために設定。seed実行そのものの必須条件ではない |

`DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER`はlocalとDevelopmentの各Convex deploymentへ個別に設定します。
両方が同じClerk instanceの同じ利用者を使う場合は、同じ値を設定できます。
設定済みの`CLERK_JWT_ISSUER_DOMAIN`と識別子のissuerが一致することも確認します。

preflightは、Debugが無効、識別子が未設定・不正、または`CLERK_JWT_ISSUER_DOMAIN`と不一致の場合、scheduled functionの取消やtable削除より前に停止します。
`convex/developmentSeed/`の各internal functionも、呼び出しごとにDebugの有効性を再確認します。

CLIはConvex環境変数を設定・削除しません。
操作者が事前に`DEBUG_MODE=true`を設定し、作業終了後に削除します。

`DEBUG_MODE=true`はE2E helperも有効にします。
`DEBUG_NOTIFICATION_DELIVERY_MODE=dry-run`を維持してseedデータを利用する間もDebugを無効にできないため、対象をlocalまたは固定したDevelopmentに限定します。

`DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER`はtableの全削除では消えません。
同じ専用利用者を使う間は維持でき、Clerk利用者を削除または作り直した場合は、対象deploymentの値を更新してからseedを再実行します。

## 作成する九つのシナリオ

各シナリオは一つの組織として作成されます。  主利用者は全組織の有効な管理者ですが、組織作成上限を回避するため、一部シナリオは別のseed actorを作成者にします。

Trial、Pro、Standardの人数は、現行プランと同じく管理者を含む組織全体の利用人数です。  境界値シナリオでは管理者も店舗スタッフとして作成し、スタッフ一覧と利用人数の両方で上限を確認できます。  すべての組織でactive managerは5名以下です。

| シナリオ | 主な確認対象 |
|---|---|
| `free-capacity` | Free上限、募集承認を実行できない状態 |
| `trial-ending` | Trial終了間近、利用人数50名の上限値 |
| `standard-operations` | Standardの利用人数25名・管理者5名、店舗別スタッフ25名／12名／6名、三つの希望シフト提出方式、全募集状態、カスタム並び順 |
| `pro-notifications` | Proの利用人数50名、通知失敗、LINE連携、確定後の差分 |
| `standard-scheduled-change` | Standardの解約予約 |
| `payment-pending` | 課金の`pendingActivation` |
| `payment-failure` | 支払い失敗後のFree・契約終了処理中 |
| `free-over-limit` | Freeの利用人数6名／上限5名と、`limitRecoveryOnly`での整理導線。管理者は上限内の2名 |
| `trial-daily` | 普段使い用Trial。`合同会社シフトリノート`、`シフトリノート こもれび坂店`／`シフトリノート 駅前店`の2店舗、自然な架空名の9名、全募集状態、承認可能／重複の承認不可を含む登録申請 |

メールアドレスは`example.test`、LINE識別子は架空値を使います。  通知Outbox、fan-out、遅延deadline、cleanup、Stripe処理、scheduled functionは、実行可能な状態で残しません。

## 実行

localを置き換える場合は、次を実行します。

```bash
pnpm convex:seed:local
```

固定したDevelopment deploymentを置き換える場合は、次を実行します。  package scriptが破壊的操作の確認引数`--yes`を内部で固定し、CLIを直接呼び出す場合は引き続き`--yes`が必須です。

```bash
pnpm convex:seed:dev
```

CLIは、次の順番で処理します。  一つの段階が失敗した場合はnonzeroで終了し、後続段階を実行しません。

1. target、deployment URL、反映済みbackendの契約version・catalog fingerprint、Debug設定、主利用者の識別子とClerk issuerをpreflightで確認する。
2. `pending`のscheduled functionをbounded pageで取り消す。
3. `inProgress`が0件であることを確認する。
4. 全テーブルをbounded batchで削除する。
5. 共通actorと九つのシナリオを順番に作る。
6. table coverage、シナリオ件数、参照整合性、実行可能な非同期処理が0件であることを検証し、同じtransactionで一時的なaudit証跡を削除する。

各phaseは、起動時に一度だけ検証したselectorを子processの固定環境へ渡します。  localでは個人用`CONVEX_DEPLOYMENT`だけを、Developmentではdeploy keyだけを渡し、競合するselectorを空にします。  preflightが返すURLとselector内のdeployment名が完全一致しない場合は、scheduled functionの取消や削除を開始しません。  実行途中にenv fileが変更されても、別deploymentへ切り替えません。

標準出力には、段階、件数、完了状態だけを表示します。  Clerk識別子、メールアドレス、token、Convex CLIの生エラー、parseできなかった応答本文は表示しません。

CLIの終了時もDebug設定は変わりません。
続けてseedデータを使わない場合は、[デバッグ機能の無効化](debug-mode.md#デバッグ機能の無効化)に従って`DEBUG_MODE`を削除します。

## Clerk Development利用者との紐付け

seedは`DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER`を主利用者の`users.authTokenIdentifier`として保存し、その利用者を九つの組織すべてのactive managerとして作成します。  seed後にConvex Dashboardで`users`を手動置換する必要はありません。

localとDevelopmentが同じClerk instanceを参照し、同じ専用利用者でログインする場合は、両deploymentへ同じ識別子を設定します。  ログイン後は、九つの組織と対象店舗を切り替えられることを確認します。

Clerk User ID、JWT、session token、`identity.tokenIdentifier`の値は、Git、コマンド履歴、Issue、ログ、スクリーンショット、共有文書へ残しません。

## 再実行と失敗時の復旧

同じコマンドを再実行すると、既存データを再度すべて削除し、その日のJST暦日を基準に九つのシナリオを作り直します。  部分的なseedへ追記して修復するコマンドではありません。

| 停止位置 | deploymentの状態 | 対応 |
|---|---|---|
| preflight前、またはtarget不一致 | データ変更なし | env file、反映済みfunction、Debug設定、主利用者の識別子とClerk issuerを確認してから再実行する |
| scheduled function確認中 | `pending`の予約だけが一部取り消されている可能性がある | `inProgress`の終了を待ち、通常workflowへの影響を確認してから再実行する |
| 全テーブル削除以降、完了検証より前 | 開発画面で利用できない部分状態 | 利用を止め、原因を修正して同じコマンドを先頭から再実行する |
| 完了検証の失敗 | データは存在するが完成条件を満たさない | 完了扱いにせず、検証エラーの分類後に再実行する |

失敗後もCLIはDebug設定を変更しません。
追加の破壊的操作を止める場合は、原因調査の前に対象deploymentから`DEBUG_MODE`を削除します。
原因を解消し、固定target、Debug、主利用者の識別子、必要に応じて通知dry-runを再設定した後、同じコマンドを先頭から実行します。

実行前のデータへ戻す場合は、事前に取得したbackupまたはexportを使います。  シードを逆向きに実行して復元することはできません。

## 既存のrestoreとE2E helperとの分離

`pnpm convex:save`と`pnpm convex:restore`は、`convex-seeds/scripts/`が扱うsnapshotの保存と復元です。  開発用の九シナリオを生成するこの手順とは、入力、目的、復旧契約が異なります。

E2Eと自動テストのfixtureは、隔離されたmockまたはE2E用deploymentと既存のtest helperを使います。  自動テストから`pnpm convex:seed:local`や`pnpm convex:seed:dev`を呼び出さず、開発用シードをテスト間cleanupの代わりにしません。

## 完了条件

CLIが完了を表示した後、次を確認します。

- 九つのシナリオと九つの組織が存在する。
- catalog対象の全tableがseedまたは意図的な空tableとして検証される。
- activeなOutbox、fan-out、遅延deadline、scheduled functionが0件である。
- Convex deployment環境変数でClerkと紐付けた主利用者が、九つの組織すべてでactive managerとなり、対象店舗を切り替えられる。
- seedデータを続けて利用する場合は、`DEBUG_MODE=true`と`DEBUG_NOTIFICATION_DELIVERY_MODE=dry-run`が維持されている。
- 作業を終了する場合は、`DEBUG_MODE`と`DEBUG_NOTIFICATION_DELIVERY_MODE`が削除されている。
- secret、token、メールアドレス、Clerk識別子を実行ログへ記録していない。

この確認はlocalまたはDevelopmentへのシード完了を示します。  Productionへの反映、migration、provider疎通、実配送の完了を意味しません。
