# 運用手順インデックス

このディレクトリは、人が繰り返し行う確認、設定、リリース、復旧の手順を扱います。
コマンド、workflow、外部サービス設定の現在値は、リンク先に示すコードと設定を正としてください。

| 実行場面 | 手順 | 確認するもの |
|---|---|---|
| Pull Request、Preview、Develop、Productionを運用する | [CI/CD運用](ci-cd.md) | 対象commit、workflow結果、approval、デプロイ後確認 |
| 利用規約・プライバシーポリシーを更新する | [法務文書のバージョン更新](legal-versioning.md) | 本文版、再同意版、更新日、対象利用者 |
| 課金設定、Stripe公開、課金migrationを扱う | [グループ課金の運用](organization-billing.md) | 対象環境、停止条件、migration、Stripe設定、復旧 |
| LINE設定、Webhook、通知障害を扱う | [LINE通知の運用](line-notification.md) | channel設定、署名、疎通、停止と復旧 |
| セキュリティ候補と外部環境を再検証する | [セキュリティ再検証](security-validation.md) | 成立条件、既存control、固定回帰、実環境証跡 |
| Productionの公開・migration状態を記録する | [リリース状態](release-status.md) | 完全修飾deployment名、commit SHA、確認日時、証跡 |

特定日の監査結果は[Archive](../archive/INDEX.md)に置き、継続利用する手順と分けます。
秘密値、個人情報、アクセス制限のない証跡URLは記録しません。
