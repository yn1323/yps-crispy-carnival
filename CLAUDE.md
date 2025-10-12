# CLAUDE.md

このファイルは、Claude Code (claude.ai/code) がこのリポジトリで作業する際のガイダンスを提供します。

## 参照ドキュメント
- @doc/claude/basic.md
- @doc/claude/self.md

## 🚨 核心制約

### NEVER（絶対禁止）
- NEVER: data-testidをテストで使用

### YOU MUST（必須事項）
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
- IMPORTANT: 検索時にSerenaMCPを積極的に利用すること

## 開発コマンド

### コア開発
- `pnpm dev` - Vite開発サーバーの起動（ポート3000）
- `pnpm build` - Viteプロダクションビルド + TypeScript型チェック
- `pnpm start` - 開発サーバーの起動（devと同じ）
- `pnpm serve` - プロダクションビルドのプレビュー

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
- `pnpm storybook:build` - Storybookのプロダクションビルド
- `pnpm scaffdog` - コード雛形の生成

### Convex（バックエンド）
- `pnpm convex:dev` - Convex開発モード起動
- `pnpm convex:import` - データインポート
- `pnpm convex:export` - データエクスポート

## アーキテクチャ概要

### 技術スタック
- **ビルドツール**: Vite 7.1.7（高速開発サーバー）
- **ルーティング**: TanStack Router 1.132.23（ファイルベースルーティング）
- **UIフレームワーク**: React 19.1.1
- **UIライブラリ**: Chakra UI v3.27.0（Emotionスタイリング）
- **フォーム**: React Hook Form + Zodバリデーション
- **状態管理**: Jotai 2.15.0（アトミック状態管理）
- **認証**: Clerk (@clerk/clerk-react)
- **バックエンド**: Convex 1.27.3（リアルタイムデータベース）
- **パッケージマネージャ**: pnpm

### プロジェクト構造

#### ソースコード（`src/`）
- `routes/` - TanStack Routerのルート定義（ファイルベースルーティング）
- `components/` - 目的別に整理されたReactコンポーネント
  - `features/` - 機能固有コンポーネント
  - `layout/` - レイアウトコンポーネント
  - `pages/` - ページコンポーネント（店舗、シフト、勤怠等）
  - `ui/` - UI基盤コンポーネント
- `stores/` - Jotaiアトム定義（状態管理）
- `helpers/` - ユーティリティ関数
- `constants/` - 定数・バリデーションスキーマ
- `configs/` - 設定ファイル

#### Convexバックエンド（`convex/`）
- サーバーレスバックエンドコード
- リアルタイムデータベース機能

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
- フォームコンポーネントのパターン: schema.ts + index.tsx + index.stories.tsx
- `src/constants/validations.ts`での一元的バリデーションパターン
- 型は`z.infer<typeof Schema>`で自動生成

### バックエンド統合
- Convexによるリアルタイムデータベース
- Clerkによる認証機能
- 型安全なAPI呼び出し

## コード品質基準

### フォーマット・リンティング
- Biome設定: 2スペースインデント、120文字行幅を強制
- インポート整理を有効化
- Reactドメインルールを適用
- 配列インデックスキーを許可（noArrayIndexKey無効）
- forEachを許可（noForEach無効）

### ファイル整理
- コンポーネントには対応する.stories.tsxファイルを含む
- スキーマは専用ファイルに分離（schema.ts）
- パスエイリアス設定: @/src, @/e2e, @/convex