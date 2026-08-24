# 計画インデックス

`doc/plans/`は、計画を作成した時点の判断、実装順序、受入条件を残す場所です。
現在の機能や常設規約は、各表の「現在の正本」を参照してください。

> 分類日: 2026-08-25
>
> 分類基準: 既存計画は2026-07-23のworktree、2026-08-02以降の追加計画は作成時点のworktreeと各計画本文

- **Proposed**：採否または設計レビューが終わっていない提案。
- **Active**：コード、判断、外部設定、migration、実環境証跡のいずれかに未完了条件がある計画。
- **History**：実装済み、置換済み、廃止済み、または別の正本へ進捗管理を移した計画。

`History`は「Productionへ反映済み」を意味しません。
実環境の状態は[リリース状態](../manual/release-status.md)で、証跡がある項目だけを確認済みとします。

## Proposed

| 計画 | 状態 | 次に必要な判断 | 現在の正本 |
|---|---|---|---|
| [GA4計測基盤とSkill整備](2026-08-12_GA4計測基盤とSkill整備_実装計画.md) | `partially superseded` | アプリ側safe coreは監査残件実装計画へ移管済み。`ga4-measurement` Skillを別途作成するかだけを決める | [公開Web計測](../features/web-measurement.md)、[GA4・GTM運用](../manual/ga4-gtm.md) |
| [AIシフト下書き機能 詳細設計](2026-07-03_AIシフト下書き機能.md) | `reviewing` | 機能を採用するか、誰が再検討するかを決める | 現行のシフト作成は[シフト表](../features/shift-board.md) |
| [AIシフト下書き機能 実装仕様書](2026-07-03_AIシフト下書き機能_実装仕様書.md) | `reviewing` | 詳細設計の採否後に実装仕様を確定する | 現行のシフト作成は[シフト表](../features/shift-board.md) |
| [スタッフのメールアドレス任意化](2026-07-04_メールアドレス任意化_設計.md) | `reviewing` | 通知手段、認証境界、既存データmigrationを含めて採否を決める | 現行のスタッフ管理は[ユーザー詳細](../features/user-detail.md)と[LINE通知連携](../features/line-notification.md) |
| [新規グループ作成導線](2026-07-25_新規グループ作成導線_実装計画.md) | `reviewing` | 二つ目以降をFree開始とする方針と作成上限3の採否を決める | 現行のグループ作成は[グループ課金、複数店舗、複数管理者](../features/organization-billing.md) |

## Active

| 計画 | 状態 | 未完了条件 | 現在の正本 |
|---|---|---|---|
| [認証済み新ページ正式切替と旧ページ削除](2026-08-15_認証済み新ページ正式切替と旧ページ削除_実装計画.md) | `rollout verification` | repository実装、目的別commit、Pull Request更新、最新head SHAの全test・build・全E2E・VRT captureとcompare開始は確認済み。Productionのcanonical所属readiness、artifact反映、canaryは未確認 | 現行仕様は[機能インデックス](../features/INDEX.md)、実環境証跡は[リリース状態](../manual/release-status.md)、設計と検証は[フロントエンド方針](../rules/frontend-architecture.md)、[テスト方針](../rules/testing-strategy.md)、[セキュリティ方針](../rules/security-strategy.md) |
| [LINE連携のグループ内共通化](2026-08-13_LINE連携のグループ内共通化_実装計画.md) | `rollout verification` | repository artifactのcanonical readは更新済み。店舗・所属追加は常時公開契約へ移行済み。Production artifactとdeploymentの確定、exportとbackup、必要なmigration、非同期処理のdrain、反映後canary、Preview E2E、CI VRT、法務確認と実環境証跡は未実施 | [LINE通知連携](../features/line-notification.md)、[ユーザー詳細](../features/user-detail.md)、[通知配送outbox](../features/notification-outbox.md)、[リリース状態](../manual/release-status.md) |
| [管理者設定ページ](2026-08-13_管理者設定ページ_実装計画.md) | `rollout verification` | repository実装、主担当test、標準検証は完了。Preview E2E・CI VRT、Widen deploy後の旧client排出確認とAPI Narrow、Production公開判断・canaryは未確認 | [グループ課金](../features/organization-billing.md)、[ユーザー詳細](../features/user-detail.md)、[店舗所属の移行互換](../features/manager-shop-membership.md)、[課金業務フロー](../specs/organization-billing-business-flow.md) |
| [UI・UX・SEO監査残件 実装計画](2026-08-12_UI_UX_SEO監査残件_実装計画.md) | `rollout verification` | 確定不具合のrepository実装と主担当testは完了。外部GTM・GA4・Clarity設定、Production deploy・canary、Preview Deployed Smoke、計測browser契約の実走、CI VRT、GSC・RUM・Product判断gateは未実施。gate未成立項目とユーザー指定の除外二項目は現行維持 | [公開Web計測](../features/web-measurement.md)、[希望シフト提出](../features/shift-submission.md)、[公開サイト](../features/public-pages.md)、[リリース状態](../manual/release-status.md) |
| [テスト充足度監査と改善計画](2026-08-12_テスト充足度監査_改善計画.md) | `rollout verification` | リポジトリ内の不足テスト、Trial継続取消の別requestId排他、全機能契約表、内部BI・VRT・Deployed SmokeのCI gateは実装済み。管理者招待の契約と主担当層は[管理者設定ページ計画](2026-08-13_管理者設定ページ_実装計画.md)へ移管済み。GitHub Actions上のVRT・Analytics CI・管理者設定E2E、Preview Deployed Smoke、実Convex・Stripe到達は未確認 | [テスト方針](../rules/testing-strategy.md)、[セキュリティ方針](../rules/security-strategy.md)、[CI/CD運用](../manual/ci-cd.md) |
| [ShiftForm PC・SP時間編集不具合](2026-08-08_ShiftForm_PC_SP時間編集不具合_実装計画.md) | `rollout` | code・tests・現行文書は完了。deploy後canaryでPCの完全隣接枠、SPの短縮・複数区間案内、新しい確定通知の時間表示を確認する。既存DBの一括migrationは行わない | [シフト表](../features/shift-board.md)、[希望シフト提出](../features/shift-submission.md)、[通知配送outbox](../features/notification-outbox.md)、[リリース状態](../manual/release-status.md) |
| [Analytics夜間バッチ簡素化](2026-08-08_Analytics夜間バッチ簡素化_実装計画.md) | `rollout` | code・tests・現行文書とNarrow revisionへの実装は完了。対象deploymentへNarrow deploy → 初回partialを通常のcompleteとして即時公開 → cron有効化 → 翌日03:00のno-op → 翌々日03:00の完全日次 → 外部alertの実環境証跡まで確認する | [分析KPI蓄積基盤](../features/analytics.md)、[分析KPI可視化アプリ](../features/analytics-dashboard.md)、[Analytics rollout](../manual/analytics-rollout.md) |
| [E2E安定性改善・スコープ再設計](2026-08-03_E2E安定性改善_実行計画.md) | `rollout` | code、local contract test、50回burn-inは完了。同一SHA 3回、workflow cancel、30%短縮をActionsで確認 | [テスト方針](../rules/testing-strategy.md)、[セキュリティ方針](../rules/security-strategy.md)、[CI/CD運用](../manual/ci-cd.md) |
| [別端末ログイン本人確認](2026-07-11_別端末ログイン本人確認_実装計画.md) | `rollout` | Production相当のClerk設定、返却status、メール確認の実環境証跡 | [認証画面](../features/auth-pages.md)、[リリース状態](../manual/release-status.md) |
| [フロントエンド単体テスト、Storybook、VRTリファクタ](2026-07-13-frontend-test-vrt-refactor.md) | `approved` | 完了記録がないため、各完了条件を現行テストとCIへ再照合する | [テスト方針](../rules/testing-strategy.md) |
| [グループ課金、複数店舗、複数管理者](2026-07-14_事業者課金_複数店舗_複数管理者_実装計画.md) | `rollout` | Production migration、互換期間後のNarrow、実環境証跡。旧プラン記述は後続計画で置換済み | [課金業務フロー](../specs/organization-billing-business-flow.md)、[グループ課金](../features/organization-billing.md)、[リリース状態](../manual/release-status.md) |
| [所属なしユーザーのアカウント削除](2026-07-18_所属なしユーザーのアカウント削除_実装計画.md) | `rollout` | 段階公開の判断と実環境での受付・復旧確認 | [アカウント削除](../features/account-deletion.md)、[リリース状態](../manual/release-status.md) |
| [削除後の業務識別情報保持と認証切り離し](2026-07-19_削除後の業務識別情報保持と認証切り離し_実装計画.md) | `blocked` | 公開前に保持目的、保持期間、別途消去要求を扱う運用を決める | [店舗・グループ削除](../features/data-deletion.md)、[アカウント削除](../features/account-deletion.md) |
| [スタッフ通知履歴](2026-07-19_スタッフ通知履歴_実装計画.md) | `rollout` | リリースとResendの`email.delivered` Webhook設定を証跡付きで確認する | [スタッフ通知履歴](../features/notification-history.md)、[リリース状態](../manual/release-status.md) |
| [Stripeセキュリティ対策](2026-07-20_Stripeセキュリティ対策_テスト計画.md) | `blocked` | Stripe sandbox canary、Clerk・Cloudflare・端末保護などの実環境証跡 | [セキュリティ再検証](../manual/security-validation.md)、[リリース状態](../manual/release-status.md) |
| [doc現行コード差分調査](2026-07-23_doc現行コード差分調査.md) | `reviewing` | 10論点のProduct、Security、Backend、運用判断を確定し、必要な別計画へ引き渡す | [現行コード差分調査](2026-07-23_doc現行コード差分調査.md) |

`frontend-test-vrt-refactor`は本文に実施結果がないため、完了済みと推測せず`Active`に残しています。
`E2E Full Regression`は2026-08-03にE2E単独の完了条件から外し、現行作業を`E2E安定性改善・スコープ再設計`へ移しました。

## History

Historyの本文には、現在と異なる名称、パス、状態、上限、実装方式が含まれる場合があります。
次の表は判断経緯を探す入口であり、現在仕様の一覧ではありません。

### 2026年3月

| 計画 | 分類根拠 | 現在の正本 |
|---|---|---|
| [YPS v3 プロダクト定義](2026-03-25_プロダクト定義.md) | 初期プロダクト定義。現行の製品原則へ移管 | [UI設計方針](../rules/ui-design.md)、[機能インデックス](../features/INDEX.md) |
| [ダッシュボード・オンボーディングUX設計](2026-03-26_UX設計_ダッシュボード.md) | 初期設計。現行機能を実装済み | [ログイン後オンボーディング](../features/dashboard-onboarding.md) |
| [シフトボード ハッピーパス](2026-03-26_シフトボード_ハッピーパス.md) | 初期のMVPフロー | [シフト表](../features/shift-board.md) |
| [YPS v3 情報設計](2026-03-26_情報設計書.md) | 初期の画面・情報設計 | [システム構成](../ARCHITECTURE.md)、[機能インデックス](../features/INDEX.md) |
| [ダッシュボード・シフトボードDB設計](2026-03-28_DB設計_ダッシュボード_シフトボード.md) | 空schemaを前提にした初期設計 | [システム構成](../ARCHITECTURE.md) |
| [シフトボード ワイヤーフレーム仕様](2026-03-28_UX設計_シフトボード.md) | 初期の画面設計 | [シフト表](../features/shift-board.md) |
| [セキュリティ・認証設計](2026-03-28_セキュリティ・認証設計.md) | 初期設計。横断規約と現行認証文書へ移管 | [セキュリティ設計方針](../rules/security-strategy.md)、[認証画面](../features/auth-pages.md) |
| [実装ギャップ分析・AIプロンプト](2026-03-28_実装プロンプト.md) | 初期実装用プロンプト | [システム構成](../ARCHITECTURE.md)、[機能インデックス](../features/INDEX.md) |
| [店舗情報と初回セットアップ設計](2026-03-28_店舗情報と初回セットアップ設計.md) | 初期セットアップの設計履歴 | [ログイン後オンボーディング](../features/dashboard-onboarding.md)、[店舗設定](../features/shop-settings.md) |
| [シフトボードヘッダー再構成](2026-03-29_コード改修_シフトボードヘッダー再構成.md) | 局所改修の実装プロンプト | [店舗所属の移行互換](../features/manager-shop-membership.md)、[システム構成](../ARCHITECTURE.md) |
| [メール通知・マジックリンク実装設計](2026-03-30_メール通知・マジックリンク実装設計.md) | 初期通知設計。現行機能へ移管 | [通知配送outbox](../features/notification-outbox.md)、[希望シフト提出](../features/shift-submission.md) |
| [メール通知・マジックリンク設計](2026-03-30_メール通知・マジックリンク設計.md) | 初期通知設計。現行機能へ移管 | [通知配送outbox](../features/notification-outbox.md)、[希望シフト提出](../features/shift-submission.md) |
| [初回シフト確定E2E実装プロンプト](2026-03-31_E2Eテスト実装プロンプト.md) | 初回E2Eの実装指示 | [テスト方針](../rules/testing-strategy.md)、[E2E安定性改善・スコープ再設計](2026-08-03_E2E安定性改善_実行計画.md) |
| [E2Eテスト方針](2026-03-31_E2Eテスト方針.md) | 初期方針。現行規約へ移管 | [テスト方針](../rules/testing-strategy.md)、[E2E安定性改善・スコープ再設計](2026-08-03_E2E安定性改善_実行計画.md) |

### 2026年4月

| 計画 | 分類根拠 | 現在の正本 |
|---|---|---|
| [ラベル改善とガント画面整理](2026-04-05_ラベル改善とガント画面整理.md) | シフト表UIの局所改修 | [シフト表](../features/shift-board.md) |
| [レートリミット実装プロンプト](2026-04-05_レートリミット実装プロンプト.md) | 初期の安全対策実装指示 | [セキュリティ設計方針](../rules/security-strategy.md) |
| [スタッフ提出画面](2026-04-08_スタッフ提出画面_実装計画.md) | 現行提出導線を実装済み | [希望シフト提出](../features/shift-submission.md) |
| [Clerk日本語化とアプリ名変更](2026-04-09_Clerk日本語化とアプリ名変更.md) | 認証UIの局所改修 | [認証画面](../features/auth-pages.md) |
| [Google Form目安箱](2026-04-09_GoogleForm目安箱.md) | 後続のアプリ内要望受付へ置換 | [要望受付](../features/feature-requests.md) |
| [LP実装](2026-04-09_LP実装計画.md) | 公開TOPの初期実装計画 | [公開サイト](../features/public-pages.md) |
| [OGP設定](2026-04-09_OGP設定.md) | 公開サイトの初期設定 | [公開サイト](../features/public-pages.md) |
| [staging通しテスト](2026-04-09_staging通しテスト計画.md) | 初回リリース向け確認計画 | [CI/CD運用](../manual/ci-cd.md)、[E2E安定性改善・スコープ再設計](2026-08-03_E2E安定性改善_実行計画.md) |
| [初回リリース タスクインデックス](2026-04-09_リリースタスク_インデックス.md) | 初回リリースの時点計画 | [CI/CD運用](../manual/ci-cd.md)、[リリース状態](../manual/release-status.md) |
| [利用規約・プライバシーポリシー](2026-04-09_利用規約プライバシーポリシー.md) | 法務画面の初期実装計画 | [法務同意フロー](../features/legal-consent.md)、[法務文書の更新](../manual/legal-versioning.md) |
| [OGP・SEO設定](2026-04-11_OGPとSEO設定.md) | 公開サイト設定の実装履歴 | [公開サイト](../features/public-pages.md) |
| [プライバシーポリシーと利用規約](2026-04-11_プライバシーポリシーと利用規約.md) | 法務画面の実装履歴 | [法務同意フロー](../features/legal-consent.md)、[法務文書の更新](../manual/legal-versioning.md) |
| [Migration基盤導入](2026-04-12_migration基盤導入_実装計画.md) | 基盤導入の履歴。現在の実行方法へ移管 | [Convex設計方針](../rules/convex-design-strategy.md)、[グループ課金の運用](../manual/organization-billing.md) |
| [店舗設定変更](2026-04-12_店舗設定変更_実装計画.md) | 店舗設定の改修履歴 | [店舗設定](../features/shop-settings.md) |
| [デモサンドボックス](2026-04-19_デモサンドボックス設計.md) | 公開デモを実装済み | [公開サイト](../features/public-pages.md) |
| [TOPとデモのSEO最適化](2026-04-25_SEO改善.md) | 公開サイトの改修履歴 | [公開サイト](../features/public-pages.md) |

### 2026年5月

| 計画 | 分類根拠 | 現在の正本 |
|---|---|---|
| [LINE通知連携設計](2026-05-06_LINE通知連携設計.md) | 初期設計。現行機能と運用へ移管 | [LINE通知連携](../features/line-notification.md)、[LINE通知の運用](../manual/line-notification.md) |
| [追加スタッフへの希望シフト通知](2026-05-08_追加スタッフへの希望シフト通知.md) | 通知機能の改修履歴 | [シフト募集管理](../features/shift-recruitment-management.md)、[通知配送outbox](../features/notification-outbox.md) |
| [下書き保存後の希望表示優先順位](2026-05-10_下書き保存後の希望表示優先順位.md) | シフト表表示の改修履歴 | [シフト表](../features/shift-board.md) |
| [スタッフ参加QRと承認導線](2026-05-13_スタッフ参加QRと承認導線.md) | 現行参加導線を実装済み | [スタッフ参加QR・承認導線](../features/staff-registration.md) |
| [提出方法ごとの時間入力整理](2026-05-17_シフト提出パターン作成.md) | 現行提出導線を実装済み | [希望シフト提出](../features/shift-submission.md) |

### 2026年7月

| 計画 | 分類根拠 | 現在の正本 |
|---|---|---|
| [E2E Full Regression](2026-07-13-e2e-full-regression.md) | E2E単独でFull Regressionを担う方針を終了し、代表導線と下位層への契約分担を後続計画へ移管 | [E2E安定性改善・スコープ再設計](2026-08-03_E2E安定性改善_実行計画.md)、[テスト方針](../rules/testing-strategy.md) |
| [複数店舗・複数マネージャー旧設計](2026-07-03_複数店舗・複数マネージャー設計.md) | グループ単位課金と現行招待設計により置換 | [グループ課金](../features/organization-billing.md)、[課金業務フロー](../specs/organization-billing-business-flow.md) |
| [分析KPI蓄積基盤 設計](2026-07-04_分析KPI蓄積基盤_設計.md) | 現行基盤を実装済み | [分析KPI蓄積基盤](../features/analytics.md) |
| [スタッフ詳細モーダル設計](2026-07-05_スタッフ詳細モーダル設計.md) | 後続のユーザー詳細機能へ置換 | [ユーザー詳細](../features/user-detail.md) |
| [分析KPI可視化アプリ設計](2026-07-05_分析KPI可視化アプリ_設計.md) | 現行の内部BIを実装済み | [分析KPI可視化アプリ](../features/analytics-dashboard.md) |
| [問い合わせと要望受付](2026-07-10_問い合わせと要望受付機能_実装計画.md) | 実装完了を本文で確認 | [問い合わせ](../features/contact.md)、[要望受付](../features/feature-requests.md) |
| [Webhook受信制約とメールHTMLエスケープ](2026-07-15_Webhook受信制約とメールHTMLエスケープ_実装計画.md) | 安全対策の実装履歴 | [セキュリティ設計方針](../rules/security-strategy.md)、[LINE通知の運用](../manual/line-notification.md) |
| [店舗とアカウント削除の旧計画](2026-07-16_店舗とアカウント削除_実装計画.md) | 本文で廃止を明示し、後続計画へ置換 | [店舗・グループ削除](../features/data-deletion.md)、[アカウント削除](../features/account-deletion.md) |
| [既存グループへの無償Business提供](2026-07-16_既存事業者_無償Business_実装計画.md) | Business再導入計画により状態とmigrationを置換 | [Business再導入計画](2026-07-21_課金プラン改定_Business再導入_実装計画.md)、[グループ課金](../features/organization-billing.md) |
| [グループ追加、店舗追加、支払い、管理者招待・交代のダークローンチ](2026-07-25_ダークローンチ_実装計画.md) | Feature Flagによる公開制御を撤去し、常時公開契約へ置換。Production反映は別証跡 | [グループ課金、複数店舗、複数管理者](../features/organization-billing.md)、[グループ課金の運用](../manual/organization-billing.md)、[リリース状態](../manual/release-status.md) |
| [スタッフ詳細からの管理者招待と5名上限](2026-07-17_スタッフ詳細_管理者招待_5名上限_実装計画.md) | 実装済みを本文で確認 | [ユーザー詳細](../features/user-detail.md)、[グループ課金](../features/organization-billing.md) |
| [Free管理者交代・複数グループ](2026-07-18_Free管理者交代_複数グループ_追加実装計画.md) | 完了を本文で確認 | [グループ課金](../features/organization-billing.md) |
| [店舗と組織の削除・個人情報匿名化](2026-07-18_店舗と組織の削除_個人情報匿名化_実装計画.md) | 識別情報の置換契約を後続計画で変更 | [識別情報保持計画](2026-07-19_削除後の業務識別情報保持と認証切り離し_実装計画.md)、[店舗・グループ削除](../features/data-deletion.md) |
| [複数管理者・複数店舗 E2E](2026-07-18_複数管理者_複数店舗_E2E実装計画.md) | 完了を本文で確認 | [テスト方針](../rules/testing-strategy.md)、[E2E安定性改善・スコープ再設計](2026-08-03_E2E安定性改善_実行計画.md) |
| [Stripe課金連携・4プラン化](2026-07-20_Stripe課金連携_実装計画.md) | プラン構成と上限をBusiness再導入計画で置換 | [Business再導入計画](2026-07-21_課金プラン改定_Business再導入_実装計画.md)、[グループ課金](../features/organization-billing.md) |
| [課金プラン改定・Business再導入](2026-07-21_課金プラン改定_Business再導入_実装計画.md) | Issue #839のStandard / Pro内部ID統一、m042〜m044移行、2キーのStripe設定でプラン構成と外部ロールアウト手順を置換 | [課金業務フロー](../specs/organization-billing-business-flow.md)、[グループ課金の運用](../manual/organization-billing.md)、[リリース状態](../manual/release-status.md) |
| [StripeとCodexセキュリティ調査](2026-07-21_StripeとCodexセキュリティ調査_不足テスト実装計画.md) | リポジトリ実装と自動検証を完了。外部証跡は運用文書へ移管 | [セキュリティ再検証](../manual/security-validation.md)、[リリース状態](../manual/release-status.md) |
| [エージェント指示体系の再構成](2026-07-23_エージェント指示体系_再構成計画.md) | 指示体系を現行Ruleと`AGENTS.md`へ反映済み | [エージェント指示の配置方針](../rules/agent-instructions.md) |
| [doc情報設計と現行コード整合の再構成](2026-07-23_doc情報設計と現行コード整合の再構成計画.md) | 目的別INDEX、Archive、明確な差分修正、長大文書の再構成、自動検査を完了。判断待ちは差分調査へ移管 | [ドキュメント入口](../INDEX.md)、[現行コード差分調査](2026-07-23_doc現行コード差分調査.md) |

### 2026年8月

| 計画 | 分類根拠 | 現在の正本 |
|---|---|---|
| [SPボトムナビゲーションと画面遷移](2026-08-14_SPボトムナビゲーションと画面遷移_実装計画.md) | 5目的とresponsive shellの判断を実装し、正式切替を2026-08-15計画へ移管 | [認証済み新ページ正式切替と旧ページ削除](2026-08-15_認証済み新ページ正式切替と旧ページ削除_実装計画.md)、[UI設計方針](../rules/ui-design.md) |
| [レスポンシブナビゲーションと固定画面遷移 Phase 1](2026-08-14_レスポンシブナビゲーションと固定画面遷移_Phase1実装計画.md) | 固定15画面とnavigation shellを実装し、実データ接続と正式切替を後続計画へ移管 | [認証済み新ページ正式切替と旧ページ削除](2026-08-15_認証済み新ページ正式切替と旧ページ削除_実装計画.md)、[機能インデックス](../features/INDEX.md) |
| [レスポンシブナビゲーションの実データ・操作接続 Phase 2](2026-08-14_レスポンシブナビゲーション実データ操作接続_Phase2実装計画.md) | Phase 2-0から2-7を実装し、未着手のPhase 2-8を2026-08-15計画へ移管 | [認証済み新ページ正式切替と旧ページ削除](2026-08-15_認証済み新ページ正式切替と旧ページ削除_実装計画.md)、[機能インデックス](../features/INDEX.md) |
| [UI・UX・SEO全体監査 最終報告・改善計画](2026-08-12_UI_UX_SEO全体監査_最終報告・改善計画.md) | Dashboard、非ログインページ、公開SSG、CSR shell、SEO、性能、計測を時点監査し、採用する残件を[UI・UX・SEO監査残件 実装計画](2026-08-12_UI_UX_SEO監査残件_実装計画.md)へ移管。ShiftBoardデモの終了・SP代替導線とDashboardのcontext-first順序は今回の修正対象外と判断した | [UI設計方針](../rules/ui-design.md)、[希望シフト提出](../features/shift-submission.md)、[公開サイト](../features/public-pages.md)、[ログイン後オンボーディング](../features/dashboard-onboarding.md) |
| [Analytics利用候補店舗](2026-08-12_Analytics利用候補店舗_実装計画.md) | 最新complete run基準の候補分類、`usage` filter、一覧の根拠表示、店舗・組織詳細への導線、Logic・Function Testを実装し、必須検証を完了。Production反映と実データ負荷計測は未実施 | [分析KPI可視化アプリ](../features/analytics-dashboard.md)、[分析KPI蓄積基盤](../features/analytics.md) |
| [UI・UX・SEO全体監査 調査計画とゴールプロンプト](2026-08-12_UI_UX_SEO全体監査_調査計画.md) | Dashboard中心journeyと公開獲得journeyをPC/SPで実操作し、公開33 URL、CSR shell、D1〜D7、SEO・性能を証拠レイヤー別に監査して[最終報告・改善計画](2026-08-12_UI_UX_SEO全体監査_最終報告・改善計画.md)へ引き渡した | [UI設計方針](../rules/ui-design.md)、[公開サイト](../features/public-pages.md) |
| [Dialogアクション統一](2026-08-12_Dialogアクション統一_実装計画.md) | feature側production 38宣言と共通fallbackを統一し、nested確認3件をinline化。PC/SP配置、閲覧専用のSecondary「閉じる」、scroll・safe area、処理中close lock、Behavior Testと必須検証を完了。VRT差分確認はGitHub Actionsへ委ねる | [UI設計方針](../rules/ui-design.md)、[テスト方針](../rules/testing-strategy.md) |
| [Dashboardプランカードの利用状況表示と配色統一](2026-08-11_Dashboardプランカード_利用状況表示と配色統一_実装計画.md) | 承認済みUI、展開時だけの利用状況query、管理者flag、全課金状態のButton配色、Function・Unit・Story、機能文書を実装し、必須検証を完了。VRT差分確認はGitHub Actionsへ委ねる | [グループ課金](../features/organization-billing.md)、[UI設計方針](../rules/ui-design.md)、[テスト方針](../rules/testing-strategy.md) |
| [スタッフ追加モーダルの方法選択UI](2026-08-10_スタッフ追加モーダル_方法選択UI_実装計画.md) | 方法選択カード、既存詳細への遷移、遅延query、状態・focus・mutation guard、Unit・Behavior・現行文書を実装し、必須検証を完了。VRT差分確認はGitHub Actionsへ委ねる | [スタッフ参加QR・承認導線](../features/staff-registration.md)、[UI設計方針](../rules/ui-design.md) |
| [分析KPIと内部BI再設計](2026-08-02_分析KPIと内部BI再設計_実装計画.md) | KPI、画面、source factの設計は維持する。generation、bootstrap、job recovery、cutover、rollout方式は後続の夜間バッチ簡素化計画で置換 | [Analytics夜間バッチ簡素化](2026-08-08_Analytics夜間バッチ簡素化_実装計画.md)、[分析KPI蓄積基盤](../features/analytics.md)、[分析KPI可視化アプリ](../features/analytics-dashboard.md) |
| [teal低階調token用途制限](2026-08-06_teal低階調token用途制限_実装計画.md) | 初期の全面廃止方針を改訂し、低階調tealを背景fillとスタッフ・店舗drilldown list cardのhover限定例外へ制限。その他の操作面、境界、focus、foregroundの禁止を維持し、VRTは利用者確認へ引き渡す | [UI設計方針](../rules/ui-design.md)、[ルートAgent指示](../../AGENTS.md) |
| [管理者メールアドレス変更とClerk同期](2026-08-03_管理者メールアドレス変更_実装計画.md) | ログイン方法とシフト連絡先を分離する後続仕様で置換。全所属同期と不一致復旧UIは撤去し、直前の旧Primary EmailAddress削除だけを現行のログインメール変更へ再導入 | [認証画面](../features/auth-pages.md)、[ユーザー詳細](../features/user-detail.md) |
| [Analytics画面情報設計改善](2026-08-03_Analytics画面情報設計改善_実装計画.md) | 初期期間、状態表示、一覧・詳細の縮退表示、mobile表示、navigation、要望画面をfrontendへ実装し、静的検証を完了 | [分析KPI可視化アプリ](../features/analytics-dashboard.md)、[UI設計方針](../rules/ui-design.md) |
| [CSR画面遷移パフォーマンス改善](2026-08-03_CSR画面遷移パフォーマンス改善_実装計画.md) | 4導線のfrontend実装、Unit・Behavior Test、production bundle比較を完了 | [フロントエンドアーキテクチャ](../rules/frontend-architecture.md)、[UI設計方針](../rules/ui-design.md)、[テスト方針](../rules/testing-strategy.md) |

### 日付形式が異なる既存計画

| 計画 | 分類根拠 | 現在の正本 |
|---|---|---|
| [PeakBandSettings 不具合修正](20260324-peakband-settings-bugfix.md) | シフト表設定の局所修正履歴 | [シフト表](../features/shift-board.md) |
| [ShiftForm 情報設計改善](20260324-shiftform-information-design.md) | シフト表入力の改修履歴 | [シフト表](../features/shift-board.md) |
| [SetupModal リファクタ](20260329-setup-modal-refactor.md) | 初回導線の改修履歴 | [ログイン後オンボーディング](../features/dashboard-onboarding.md) |
