# 技術スタック詳細

## 🏗️ フレームワーク・ライブラリ

### コアフレームワーク
- **Next.js 15** - React フレームワーク
  - App Router使用
  - Turbopack（開発・ビルド高速化）
  - Server Actions対応
- **React 19.1.0** - UIライブラリ
- **TypeScript** - 静的型付け（厳格設定）

### UI・スタイリング
- **Chakra UI v3** (@chakra-ui/react 3.25.0)
  - Modern API準拠
  - inline style props使用必須
  - レスポンシブ：配列記法、2段階（PC/SP）
- **Emotion** (@emotion/react 11.14.0) - CSS-in-JS
- **next-themes 0.4.6** - ダーク・ライトモード対応
- **React Icons 5.5.0** - アイコンライブラリ

### 状態管理・フォーム
- **Jotai 2.12.2** - アトミック状態管理
  - ドメイン別ストア定義
  - Context API禁止の代替
- **React Hook Form 7.56.3** - フォーム管理
- **@hookform/resolvers 5.0.1** - バリデーション連携
- **Zod 3.24.2** - スキーマバリデーション

## 🧪 テスト環境

### 単体テスト
- **Vitest 3.1.1** - テストランナー
- **@vitejs/plugin-react 5.0.1** - React対応
- **@vitest/coverage-v8 3.1.1** - カバレッジ
- **@vitest/browser 3.1.1** - ブラウザテスト

### UIテスト・VRT
- **Storybook 9.1.3** - コンポーネント開発・テスト
- **@storybook/nextjs-vite 9.1.3** - Next.js統合
- **@storybook/addon-vitest 9.1.3** - Vitestとの統合
- **storycap-testrun 1.0.0** - VRT
- **reg-suit 0.14.4** - VRT比較システム

### E2Eテスト
- **Playwright 1.51.1** - E2Eテスト
- **@playwright/test 1.51.1** - テストフレームワーク

## 🔧 開発ツール・設定

### リンター・フォーマッター
- **Biome 2.2.0** - 統合リンター・フォーマッター
  - ESLint + Prettier代替
  - 2スペースインデント、120文字行幅
  - インポート自動整理
  - Next.js・React特化ルール適用

### バンドル・ビルド
- **Turbopack** - Next.js 15標準バンドラー
- **tsx 4.19.4** - TypeScript実行環境

### その他開発ツール
- **scaffdog 4.1.0** - コード雛形生成
- **dotenv 17.0.0** - 環境変数管理
- **chromatic 13.1.3** - Storybookホスティング・VRT

## 📋 設定詳細

### TypeScript設定（tsconfig.json）
- **target**: ESNext
- **strict**: true（厳格型チェック）
- **パスエイリアス**:
  - `@/app/*` → `./app/*`
  - `@/src/*` → `./src/*`
  - `@/e2e/*` → `./e2e/*`

### Biome設定（biome.json）
- **フォーマット**: 2スペース、120文字
- **リンティング**: recommended + Next.js + React
- **特別設定**: `noArrayIndexKey: "off"`（配列インデックスキー許可）

### Vitest設定（vitest.config.ts）
- **2プロジェクト構成**:
  - **logic**: 単体テスト（Node.js環境）
  - **ui**: UIテスト（Playwright browser環境）
- **Storybookテスト統合**

### Playwright設定（playwright.config.ts）
- **ブラウザ**: Chrome
- **ベースURL**: http://localhost:3000
- **失敗時**: スクリーンショット・動画保存
- **開発サーバー自動起動**: `pnpm dev`

## 🚨 技術制約・ルール

### 禁止事項
- ❌ **interface** → **type**使用必須
- ❌ **Function Declaration** → **Arrow Function**必須
- ❌ **React.FC** → 通常の関数コンポーネント
- ❌ **Context API** → Props Drilling + Jotai
- ❌ **enum** → Union Types
- ❌ **バレルエクスポート** → Explicit Import
- ❌ **data-testid** → セマンティック要素優先

### 必須事項
- ✅ **Arrow Function**使用
- ✅ **const**優先（let最小限）
- ✅ **分割代入**積極活用
- ✅ **async/await**（Promise.then禁止）
- ✅ **Early Return**パターン
- ✅ **2個以上の引数はオブジェクト化**

## 🎯 パフォーマンス・最適化

### アニメーション統一
- **Duration**: 150ms統一
- **Easing**: ease統一
- **ローディング**: スピナー使用

### バンドル最適化
- Turbopack使用
- Tree-shaking対応（Explicit Import）
- 型推論活用（型定義最小化）