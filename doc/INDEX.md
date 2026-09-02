# ドキュメント

知りたいことに合う入口を選んでください。  文書は「現行実装仕様」「業務要件」「検証契約」「実環境状態」を分けて管理します。

| 知りたいこと | 入口 | ここで分かること |
|---|---|---|
| 現行実装仕様 | [機能インデックス](features/INDEX.md) | 利用者の仕事ごとの機能概要、条件別の挙動、主な画面。詳細な実行値はコードと設定が正本 |
| システム全体とコード配置 | [システム構成](ARCHITECTURE.md) | フロントエンド、Convex、外部サービス、非同期処理の境界 |
| 業務要件 | [業務要件](#業務要件) | プラン、状態遷移、受入条件など、実装が満たすべき事項。未実装の要件を含み得る |
| 検証契約 | [検証契約](#検証契約) | 主要契約、public surface、通知と主担当テスト層の対応 |
| 実環境状態 | [リリース状態](manual/release-status.md) | Productionのartifact、deployment、migration、外部サービス設定を証跡付きで確認した状態 |
| 実装とレビューの判断基準 | [設計・開発規約](#設計開発規約) | 対象作業で読む規約と責務分担 |
| リリースや外部設定を操作する | [運用手順インデックス](manual/INDEX.md) | CI/CD、migration、法務更新、外部サービスの確認・復旧手順 |
| 未決提案、進行中の作業、過去の判断を調べる | [計画インデックス](plans/INDEX.md) | `Proposed`、`Active`、`History`に分けた計画 |
| 廃止・置換された資料や時点監査を調べる | [Archiveインデックス](archive/INDEX.md) | Archive理由と現在の参照先 |

`plans/`と`archive/`は現在仕様の正本ではありません。
計画の結論を現在の挙動として使う前に、機能文書からコードと設定を確かめてください。  業務要件と現行実装が食い違う場合は、要件をコードへ合わせて暗黙に変更せず、「要件判断」として分けます。

## 業務要件

- [組織課金、複数店舗、複数管理者の業務要件](specs/organization-billing-business-flow.md)：プラン、利用人数、店舗と管理者の上限、支払い状態、Stripe連携、専用ページからの管理者招待・交代・権限解除について、実装が満たすべき要件を定めます。

## 検証契約

- [Full Regression横断契約表](specs/full-regression-contracts.md)：主要な業務要件と現行機能、public surface、通知purposeを主担当テスト層へ対応付けます。

## 設計・開発規約

- [エージェント指示の配置方針](rules/agent-instructions.md)：Rule、`AGENTS.md`、Skill、機能文書、運用文書の役割を分けます。
- [UI設計方針](rules/ui-design.md)：プロダクトの約束、利用者、画面と文言の判断基準を定めます。
- [フロントエンド設計](rules/frontend-architecture.md)：ディレクトリ、依存方向、ファイル責務を定めます。
- [Convex設計方針](rules/convex-design-strategy.md)：認証境界、public API、Capability、永続ワークフロー、データ保持を定めます。
- [セキュリティ設計方針](rules/security-strategy.md)：認証、認可、token、通知、課金、個人情報の安全契約を定めます。
- [テスト方針](rules/testing-strategy.md)：変更契約を守るテスト層と配置を定めます。

## 文書を更新するとき

機能文書を追加したら`features/INDEX.md`、計画を追加または完了したら`plans/INDEX.md`も同じ変更で更新します。
Archiveへ移す場合は、理由と後継文書を本文と`archive/INDEX.md`の両方に記録します。

更新後は次のコマンドで、相対リンク、見出しanchor、repo内パス、Convex API・HTTP route・cron・migrationの参照、INDEX所属、Archive metadataを確認します。

```bash
pnpm docs:check
```
