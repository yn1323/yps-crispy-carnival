# デバッグ環境変数の運用

> [!CAUTION]
> `DEBUG_MODE=true`は、通知やTrialのデバッグだけでなく、全テーブルを削除できる開発用seedとE2E helperも有効にします。
> Shiftori Productionでは設定せず、未設定のまま維持してください。

> 文書種別: manual
>
> 対象: local、Development、CIが作成するPreviewのConvex deployment

デバッグ機能は`DEBUG_MODE`を共通の有効化スイッチとして使います。
通知配送方法とTrial期間は、用途別の環境変数を追加した場合だけ通常動作から変わります。

## 現行の環境変数

| 変数 | 設定値 | 未設定時 | 用途 |
|---|---|---|---|
| `DEBUG_MODE` | `true`だけが有効。`false`は無効 | 無効 | すべてのデバッグ機能と、開発用seed・E2E helperの許可 |
| `DEBUG_NOTIFICATION_DELIVERY_MODE` | `dry-run`または`force-failure` | live配送 | メール、LINE、問い合わせSlackの配送を共通制御 |
| `DEBUG_TRIAL_DURATION_DAYS` | `1`から`30`までの整数 | 通常の2か月 | 初回Setupで作るTrialのJST暦日期限を短縮 |
| `DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER` | 専用Clerk Development利用者の`identity.tokenIdentifier` | seedを拒否 | seedデータへ保存する主利用者の指定 |

`DEBUG_NOTIFICATION_DELIVERY_MODE`と`DEBUG_TRIAL_DURATION_DAYS`は`DEBUG_MODE=true`を必要とします。
Debugが無効な状態でこれらを処理した場合や、許可されていない値を指定した場合は設定エラーになります。

`DEBUG_MODE=true`だけを設定した場合、通知はliveのままで、Trial期間も変わりません。
一方、seedとE2E helperは有効になるため、必要なdeploymentで必要な時間だけ設定します。

通知モードの動作は次のとおりです。

| モード | 外部送信 | 結果 |
|---|---|---|
| 未設定 | 実行する | 通常のlive配送 |
| `dry-run` | 実行しない | 通知履歴と使用量を作らず、配送済みとして処理を継続 |
| `force-failure` | 実行しない | providerを呼ばず、非リトライの配送失敗を再現 |

## localまたはDevelopmentへの設定

対象を完全修飾deployment名で固定します。
URLや現在選択中のdeploymentから対象を推測せず、Shiftori Productionではないことを確認してから操作してください。

| 対象 | `--deployment`へ指定する名前 | この手順での扱い |
|---|---|---|
| Local | `fortunate-mallard-809` | 操作可 |
| Development | `knowing-chihuahua-595` | 操作可 |
| Production | `proficient-kookabura-834` | 操作禁止。確認も変更もしない |

以下の`TARGET_DEPLOYMENT_NAME`は、LocalまたはDevelopmentのどちらか一つの名前へ置き換えてから実行します。

最初にキー名だけを確認します。  値は表示しません。

```bash
pnpm exec convex env list --names-only \
  --deployment TARGET_DEPLOYMENT_NAME
```

最初に`DEBUG_MODE`を設定し、対話入力で`true`を指定します。
値をcommand引数、shell history、Issue、ログへ残しません。

```bash
pnpm exec convex env set \
  --deployment TARGET_DEPLOYMENT_NAME \
  DEBUG_MODE
```

続けて、必要な用途別変数を対話入力で設定します。

```bash
# 通知をdry-runまたはforce-failureにする場合
pnpm exec convex env set \
  --deployment TARGET_DEPLOYMENT_NAME \
  DEBUG_NOTIFICATION_DELIVERY_MODE

# 新しく作るTrialを短縮する場合
pnpm exec convex env set \
  --deployment TARGET_DEPLOYMENT_NAME \
  DEBUG_TRIAL_DURATION_DAYS

# 開発用seedを実行する場合
pnpm exec convex env set \
  --deployment TARGET_DEPLOYMENT_NAME \
  DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER
```

設定後は`env list --names-only`を再実行し、意図したキーの有無だけを確認します。
`DEBUG_MODE=true`を設定したままProductionへdeployしたり、別deploymentへ環境変数を同期したりしません。

## デバッグ機能の無効化

作業終了時は用途別変数を先に削除し、最後に`DEBUG_MODE`を削除します。
依存する用途別変数だけが残る一時的な設定エラーを避けるため、この順番を変えません。

```bash
pnpm exec convex env remove \
  --deployment TARGET_DEPLOYMENT_NAME \
  DEBUG_NOTIFICATION_DELIVERY_MODE
pnpm exec convex env remove \
  --deployment TARGET_DEPLOYMENT_NAME \
  DEBUG_TRIAL_DURATION_DAYS
pnpm exec convex env remove \
  --deployment TARGET_DEPLOYMENT_NAME \
  DEBUG_MODE
```

`DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER`は、同じ専用Clerk利用者で再びseedする場合に限り保持できます。
Clerk利用者を削除・作り直した場合や、今後seedしない場合は削除します。

```bash
pnpm exec convex env remove \
  --deployment TARGET_DEPLOYMENT_NAME \
  DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER
```

削除後も`env list --names-only`でキーの不在を確認し、値を証跡へ残しません。

## 旧環境変数からの移行

旧コードが動いている間は、旧通知dry-run変数を先に削除するとlive配送へ変わります。
次の順番でdeploymentごとに切り替えます。
デバッグを継続しないdeploymentでは、新しいデバッグ環境変数を設定しません。

1. デバッグを継続する場合だけ、旧環境変数を残したまま`DEBUG_MODE=true`、続いて新しい用途別変数を設定する。
2. 新しい環境変数を参照するコードを対象deploymentへ反映する。
3. 外部送信しない設定ではprovider呼び出しがなく、対象機能が期待する結果になることを確認する。
4. 次の旧環境変数を削除する。
5. `env list --names-only`で新旧キーの有無だけを確認する。

| 旧環境変数 | 移行先または対応 |
|---|---|
| `DEBUG_NOTIFY_FAIL` | `DEBUG_NOTIFICATION_DELIVERY_MODE=force-failure`へ移行して削除 |
| `NOTIFICATION_DELIVERY_MODE` | `DEBUG_NOTIFICATION_DELIVERY_MODE`へ移行して削除 |
| `NOTIFICATION_DRY_RUN_USER_EMAILS` | メールアドレス別制御を廃止して削除 |
| `DEBUG_TRIAL_DURATION_DEPLOYMENT_URL` | `DEBUG_MODE`へ統合して削除 |
| `DEVELOPMENT_SEED_ENABLED` | `DEBUG_MODE`へ統合して削除 |
| `DEVELOPMENT_SEED_DEPLOYMENT_URL` | `DEBUG_MODE`へ統合して削除 |
| `DEVELOPMENT_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER` | 値を`DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER`へ設定し直して削除 |
| `E2E_TESTING_ENABLED` | `DEBUG_MODE`へ統合して削除 |
| `E2E_TESTING_DEPLOYMENT_URL` | `DEBUG_MODE`へ統合して削除 |

旧`NOTIFICATION_DELIVERY_MODE`の値は次のように移行します。

| 旧設定 | 新設定 |
|---|---|
| 未設定または`live` | `DEBUG_NOTIFICATION_DELIVERY_MODE`を設定しない |
| `dry-run`、`disabled`、`mock` | `DEBUG_NOTIFICATION_DELIVERY_MODE=dry-run` |
| `DEBUG_NOTIFY_FAIL`に空でない値がある | 上記より優先して`DEBUG_NOTIFICATION_DELIVERY_MODE=force-failure` |

旧キーは対象を固定して一つずつ削除します。

```bash
pnpm exec convex env remove --deployment TARGET_DEPLOYMENT_NAME DEBUG_NOTIFY_FAIL
pnpm exec convex env remove --deployment TARGET_DEPLOYMENT_NAME NOTIFICATION_DELIVERY_MODE
pnpm exec convex env remove --deployment TARGET_DEPLOYMENT_NAME NOTIFICATION_DRY_RUN_USER_EMAILS
pnpm exec convex env remove --deployment TARGET_DEPLOYMENT_NAME DEBUG_TRIAL_DURATION_DEPLOYMENT_URL
pnpm exec convex env remove --deployment TARGET_DEPLOYMENT_NAME DEVELOPMENT_SEED_ENABLED
pnpm exec convex env remove --deployment TARGET_DEPLOYMENT_NAME DEVELOPMENT_SEED_DEPLOYMENT_URL
pnpm exec convex env remove --deployment TARGET_DEPLOYMENT_NAME DEVELOPMENT_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER
pnpm exec convex env remove --deployment TARGET_DEPLOYMENT_NAME E2E_TESTING_ENABLED
pnpm exec convex env remove --deployment TARGET_DEPLOYMENT_NAME E2E_TESTING_DEPLOYMENT_URL
```

`PROMOTION_COMPLIMENTARY_PRO_CODE`、`SLACK_CONTACT_WEBHOOK_URL`、`RESEND_FROM_EMAIL`は現行機能が使うため、この移行では変更・削除しません。

## Preview CI

Pull RequestのPlaywright用Previewはworkflowが`DEBUG_MODE=true`と`DEBUG_NOTIFICATION_DELIVERY_MODE=dry-run`を設定します。
Preview専用の設定として扱い、同じ設定をDevelopmentやProductionへ引き継ぎません。
