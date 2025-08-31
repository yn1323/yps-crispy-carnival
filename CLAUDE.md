# CLAUDE.md

このファイルは、Claude Code (claude.ai/code) がこのリポジトリで作業する際のガイダンスを提供します。

## 参照ドキュメント
- @doc/claude/basic.md
- @doc/claude/character.md
- @doc/claude/self.md

## 🚨 核心制約

### NEVER（絶対禁止）
- NEVER: data-testidをテストで使用

### YOU MUST（必須事項）
- YOU MUST: Playwright MCPでスクリーンショットを撮るときは`.env`の`CLAUDE_PLAYWRIGHT_MCP_SCREENSHOT_STORE`にファイルを配置してください
- YOU MUST: 質問をする場合は、1つずつ質問してください。チャットなので。。。
- YOU MUST: 作業時はSerenaMCPを利用してください。
- YOU MUST: ユーザーの指示で不明瞭な箇所は必ず聞き返してください。これすごく重要！！ぜひ一緒に仕様をつくっていきましょう！

### IMPORTANT（重要事項）
- IMPORTANT: Chakra UI v3 Modern API準拠
- IMPORTANT: 3ステップ以上でTodoWrite使用
- IMPORTANT: 作業開始前に計画することを好む
- IMPORTANT: バレルエクスポート禁止
- IMPORTANT: utf-8を利用すること
- IMPORTANT: TypeScriptの型は推論を利用すること
- IMPORTANT: 定数化は2箇所以上で利用しているときのみとする
- IMPORTANT: 開発者の指摘が誤っているときは、根拠を示して反論すること

## 開発コマンド

### コア開発
- `pnpm dev` - Turbopackを使用した開発サーバーの起動
- `pnpm build` - Turbopackを使用したプロダクションビルド
- `pnpm start` - プロダクションサーバーの起動

### コード品質・型チェック
- `pnpm lint` - Biomeリンティングの実行（チェックのみ）
- `pnpm format` - Biomeによるコードフォーマット
- `pnpm type-check` - TypeScript型チェックの実行

### テスト
- `pnpm test` - 全てのVitestテストの実行
- `pnpm test:logic` - ロジック・ユニットテストのみ実行（./src/**/*.test.ts）
- `pnpm test:ui` - StorybookによるUI・コンポーネントテスト（ブラウザモード）
- `pnpm e2e` - Playwright E2Eテストの実行
- `pnpm e2e:ui` - Playwright UIでE2Eテストを実行
- `pnpm e2e:debug` - E2Eテストのデバッグ
- `pnpm e2e:report` - Playwrightテストレポートの表示
- `pnpm e2e:codegen` - E2Eテストコードの生成

### ドキュメント・コンポーネント
- `pnpm storybook` - Storybook開発サーバーをポート6006で起動
- `pnpm build-storybook` - Storybookのプロダクションビルド
- `pnpm scaffdog` - コード雛形の生成

## アーキテクチャ概要

### 技術スタック
- **フレームワーク**: Next.js 15（App Router + Turbopack）
- **UIライブラリ**: Chakra UI v3（Emotionスタイリング）
- **フォーム**: React Hook Form + Zodバリデーション
- **状態管理**: Jotaiによるアトミック状態管理
- **テーマ**: next-themes（ライトモードのみ）
- **パッケージマネージャ**: pnpm

### プロジェクト構造

#### コアアプリケーション（`app/`）
- Next.js App Router構造を使用
- `(auth)/` - 認証関連ページ（勤怠、シフト、店舗、タイムカード）
- `config/` - 設定ページ

#### ソースコード（`src/`）
- `components/` - 目的別に整理されたReactコンポーネント:
  - `features/` - 機能固有コンポーネント（登録フォームなど）
  - `layout/` - レイアウトコンポーネント（サイドメニューなど）
  - `templates/` - 再利用可能テンプレートコンポーネント
  - `ui/` - UI基盤コンポーネント（カラーモード、プロバイダー、トースター、ツールチップ）
- `services/` - API・データ取得ユーティリティ（clientFetch、serverFetch）
- `stores/` - 状態管理用Jotaiアトム定義
- `helpers/` - カテゴリ別に整理されたユーティリティ関数
- `types/` - TypeScript型定義
- `constants/` - バリデーションスキーマを含むアプリケーション定数

### テストアーキテクチャ
プロジェクトでは多層テスト手法を採用:

1. **ロジックテスト**: Vitestを使用したユーティリティ・ビジネスロジックのユニットテスト
   - `src/**/*.test.ts`に配置
   - 分離されたNode.js環境で実行

2. **UIテスト**: Storybook統合によるコンポーネントテスト
   - 実ブラウザテスト用Playwrightブラウザプロバイダーを使用
   - Storybookストーリーを直接テスト

3. **E2Eテスト**: Playwrightによるフルアプリケーションテスト
   - `e2e/`ディレクトリに配置
   - テスト用開発サーバーの自動起動

### 状態管理パターン
- アトミック状態管理にJotaiを使用
- ドメイン別ストア定義（例: `src/stores/user/`）
- UIとユーザーデータ用のクライアントサイド状態アトム

### フォームアーキテクチャ
- React Hook Form + Zodスキーマバリデーション
- フォームコンポーネントのパターン: schema.ts + actions.ts + index.tsx + stories
- `src/constants/validations.ts`での一元的バリデーションパターン

### API統合
- `src/services/common/`のカスタムフェッチユーティリティ
- 適切なエラーハンドリングを持つ型安全APIコール
- Cookieベース認証サポート

## コード品質基準

### フォーマット・リンティング
- Biome設定: 2スペースインデント、120文字行幅を強制
- インポート整理を有効化
- Next.js・Reactドメインルールを適用
- 配列インデックスキーを許可（noArrayIndexKey無効）

### ファイル整理
- コンポーネントには対応する.stories.tsxと.test.tsファイルを含む
- スキーマとアクションは専用ファイルに分離
- パスエイリアス設定: @/app, @/src, @/e2e, @/prisma