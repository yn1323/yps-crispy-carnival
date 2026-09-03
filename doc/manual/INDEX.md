# 運用手順インデックス

このディレクトリは、人が繰り返し行う確認、設定、リリース、復旧の手順を扱います。
コマンド、workflow、外部サービス設定の現在値は、リンク先に示すコードと設定を正としてください。
[リリース状態](release-status.md)だけは手順ではなく、実環境で確認した状態と証跡を記録する台帳です。

| 実行場面 | 手順 | 確認するもの |
|---|---|---|
| localまたはDevelopmentへ網羅的な開発データを作る | [開発用網羅シード](development-seed.md) | 全削除の対象、環境guard、9シナリオ、Clerk紐付け、再実行と復旧 |
| Pull Request、Preview、Develop、Productionを運用する | [CI/CD運用](ci-cd.md) | 対象commit、workflow結果、approval、デプロイ後確認 |
| 利用規約・プライバシーポリシーを更新する | [法務文書のバージョン更新](legal-versioning.md) | 本文版、再同意版、更新日、対象利用者 |
| 課金設定、Stripe公開、課金migrationを扱う | [組織課金の運用](organization-billing.md) | 対象環境、停止条件、migration、Stripe設定、復旧 |
| 組織プランの遷移をStripe Sandboxで手動確認する | [組織プラン遷移の手動シナリオテスト](organization-billing-transition-scenario-test.md) | Trial短縮、専用アカウント、22ケース、日程、合否判定 |
| Widen済みの保存形式をNarrowする | [Narrow Migrationの運用](narrow-migrations.md) | forward migration、全ページreadiness、schema Narrowの停止条件 |
| Analyticsの新generationを構築し旧基盤から切り替える | [Analytics rollout](analytics-rollout.md) | 完全修飾deployment名、bootstrap、invariant、cutover、負荷、旧3テーブルの0件証跡 |
| LINE設定、Webhook、通知障害を扱う | [LINE通知の運用](line-notification.md) | channel設定、署名、疎通、停止と復旧 |
| Convex functionの失敗を調査する | [Convexエラーログの確認](convex-error-observability.md) | PostHog、request ID、安全なcontext、Log Stream設定 |
| Convex functionのrelease別利用量を比較する | [Convex function利用量の計測](convex-usage-measurement.md) | 完全修飾deployment、commit SHA、期間、total・per-call、best-effortの制約 |
| 全ページのGTM、GA4、Clarityを確認・公開する | [GA4・GTM・Clarity運用](ga4-gtm.md) | 常時発火、route family、Preview、masking、保持、rollback |
| セキュリティ候補と外部環境を再検証する | [セキュリティ再検証](security-validation.md) | 成立条件、既存control、固定回帰、実環境証跡 |
| Productionの公開・migration状態を記録する | [リリース状態](release-status.md) | 完全修飾deployment名、commit SHA、確認日時、証跡 |

特定日の監査結果は[Archive](../archive/INDEX.md)に置き、継続利用する手順と分けます。
秘密値、個人情報、アクセス制限のない証跡URLは記録しません。
