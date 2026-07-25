# ドキュメント

知りたいことに合う入口を選んでください。
現在の挙動はコードと設定、承認済みの業務契約は`specs/`、実環境で確認した公開状態は`manual/release-status.md`を正とします。

| 知りたいこと | 入口 | ここで分かること |
|---|---|---|
| 現在のコードに実装されている機能 | [機能インデックス](features/INDEX.md) | 利用者の仕事ごとの機能概要と主な画面 |
| システム全体とコード配置 | [システム構成](ARCHITECTURE.md) | フロントエンド、Convex、外部サービス、非同期処理の境界 |
| 承認済みの業務契約 | [業務仕様](#業務仕様) | プラン、状態遷移、受入条件などの確定事項 |
| 実装とレビューの判断基準 | [設計・開発規約](#設計開発規約) | 対象作業で読む規約と責務分担 |
| リリースや外部設定を確認する | [運用手順インデックス](manual/INDEX.md) | CI/CD、migration、法務更新、外部サービス、実環境証跡 |
| 未決提案、進行中の作業、過去の判断を調べる | [計画インデックス](plans/INDEX.md) | `Proposed`、`Active`、`History`に分けた計画 |
| 廃止・置換された資料や時点監査を調べる | [Archiveインデックス](archive/INDEX.md) | Archive理由と現在の参照先 |

`plans/`と`archive/`は現在仕様の正本ではありません。
計画の結論を現在の挙動として使う前に、機能文書、業務仕様、コードの順で確かめてください。

## 業務仕様

- [グループ課金、複数店舗、複数管理者の業務フロー](specs/organization-billing-business-flow.md)：プラン、利用人数、店舗と管理者の上限、支払い状態、Stripe連携、管理者招待の業務契約です。

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
