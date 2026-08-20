# シフトリ

シフトリは、店舗スタッフの希望回収からシフト作成までを支援するSaaSです。
管理者向け画面はReact、Vite、TanStack Router、Chakra UI v3で構成し、バックエンドにはConvexを使っています。

## 文書を読む

- [ドキュメントの入口](doc/INDEX.md)：機能、業務仕様、設計規約、運用手順、計画、Archiveを目的別に案内します。
- [システム構成](doc/ARCHITECTURE.md)：フロントエンド、Convex、外部サービス、非同期処理の境界を示します。
- [開発エージェント向け指示](AGENTS.md)：このリポジトリで常に守る制約と参照先です。

実装の詳細はコードと設定を正とします。
機能概要は`doc/features/`、承認済みの業務契約は`doc/specs/`、人が行う運用は`doc/manual/`を参照してください。

## 開発を始める

Node.jsは`22.12.0`以上を使用します。
パッケージマネージャーはpnpmです。

```bash
pnpm install
pnpm convex:env:setup
pnpm convex
pnpm dev
```

`pnpm convex`と`pnpm dev`は別のターミナルで実行します。
Storybookを使う場合は`pnpm storybook`を実行します。

環境変数の値をREADMEやログへ記録しないでください。
`pnpm convex:env:setup`は`scripts/setupEnv.ts`に列挙された変数を、現在選択中のdeploymentへ同期します。ローカルまたは開発用deploymentであることを確認してから実行してください。
LINE用の環境変数は対象外なので、[LINE通知の設定と運用](doc/manual/line-notification.md)に従って設定してください。

## 検証する

変更範囲に応じて、次のコマンドを実行します。

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

テスト層の選び方と個別コマンドは[テスト方針](doc/rules/testing-strategy.md)を参照してください。

## 内部分析アプリ

`apps/analytics-dashboard/`は、本体アプリと分離した内部BIです。
変更時は同ディレクトリの`AGENTS.md`を読み、`pnpm analytics:lint`、`pnpm analytics:type-check`、`pnpm analytics:build`で確認します。
