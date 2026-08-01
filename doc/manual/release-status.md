# リリース状態

> 最終更新: 2026-07-28
>
> 実環境確認: 未確認

この文書は、Productionの公開、deployment、migration、外部サービス設定を、実環境の証跡とともに記録する正本です。
リポジトリ内の実装、テスト成功、計画書の記述だけでは、実環境へ反映済みとは判定しません。

## 現在の確認状態

2026-07-28時点で、この文書へ必要な実環境証跡は登録されていません。
次の状態はすべて**未確認**です。

| 確認対象 | 状態 | 最終確認日時 | 対象環境・deployment | 証跡 |
|---|---|---|---|---|
| Productionのフロントエンドartifactとcommit SHA | 未確認 | 未確認 | 未確認 | 未登録 |
| ProductionのConvex deployとcommit SHA | 未確認 | 未確認 | 未確認 | 未登録 |
| Productionのmigration seriesと各migrationの完了 | 未確認 | 未確認 | 未確認 | 未登録 |
| ダークローンチ4フラグのdeployment別設定値と画面表示 | 未確認 | 未確認 | 未確認 | 未登録 |
| StripeのPro・Business公開設定、Price、Webhook | 未確認 | 未確認 | 未確認 | 未登録 |
| Resendの`email.delivered` Webhook | 未確認 | 未確認 | 未確認 | 未登録 |
| Clerk、Cloudflare、Stripeのセキュリティ設定とprovider canary | 未確認 | 未確認 | 未確認 | 未登録 |

「未確認」は未実施を意味しません。
この文書に、対象と時刻を特定できる証跡がまだないことを表します。

## 記録に必要な情報

一つの確認記録に、次を揃えます。

- 確認日時とタイムゾーン。
- 確認者。
- 対象commit SHAと、デプロイしたartifactの識別子。
- Production、Develop、Previewなどの環境名。
- Convexでは完全修飾deployment名と、CLIが表示した実行対象。
- 実行したコマンドまたは外部管理画面で確認した項目。
- 成功、要対応、未確認の判定と、その根拠。
- アクセス制限されたログ、export、Pull Request、管理画面記録などの証跡。
- 失敗時の停止位置、復旧先、再確認条件。

秘密値、個人情報、token、Webhook URLは記録しません。

## 確認記録の様式

確認ごとに、次の節を複製して追記します。

```md
### YYYY-MM-DD HH:mm TZ：確認対象

- 状態: 確認済み | 要対応 | 未確認
- 確認者:
- 環境:
- 完全修飾deployment名:
- commit SHA:
- artifact:
- 実行または確認内容:
- CLIが表示した対象:
- 結果:
- 証跡:
- 停止位置・復旧先:
- 次の確認条件:
```

## Migrationの記録

exportの検証とmigrationの完了確認は別の証跡として残します。
snapshotの件数やhashが一致しても、migration workerの完走は証明できません。

Migrationを確認するときは、少なくとも次を分けて記録します。

1. 実行前snapshotの取得元、取得時刻、deployment、SHA-256。
2. dry runまたは事前検証の結果と停止条件。
3. migrationを実行した完全修飾deployment名と、CLIが表示した対象。
4. migration statusの完了結果。
5. 実行後snapshotと対象件数、整合性検証。
6. 失敗時のforward recoveryまたは復旧判断。

具体的な実行手順は[グループ課金の運用](organization-billing.md)と、対象機能の運用文書を参照してください。
