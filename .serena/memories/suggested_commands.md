# 開発コマンド一覧

## 🚨 重要: Windowsシステム用コマンド

このプロジェクトはWindows環境で動作しており、以下のコマンドを使用します。

## 📦 パッケージマネージャ
- **pnpm** - このプロジェクトの標準パッケージマネージャ

## 🏗️ コア開発コマンド

### 開発サーバー
```bash
pnpm dev              # Turbopackを使用した開発サーバー起動（http://localhost:3000）
pnpm build            # Turbopackを使用したプロダクションビルド
pnpm start            # プロダクションサーバーの起動
```

### コード品質・型チェック
```bash
pnpm lint             # Biomeリンティング実行（チェックのみ）
pnpm lint:fix         # linter自動修正（作業完了前に必須実行）
pnpm format           # Biomeによるコードフォーマット
pnpm type-check       # TypeScript型チェック（作業完了前に必須実行）
```

## 🧪 テストコマンド

### 単体テスト（Vitest）
```bash
pnpm test             # 全てのVitestテスト実行（作業完了前に必須実行）
pnpm test:logic       # ロジック・ユニットテストのみ（./src/**/*.test.ts）
pnpm test:ui          # StorybookによるUI・コンポーネントテスト（ブラウザモード）
```

### E2Eテスト（Playwright）
```bash
pnpm e2e              # Playwright E2Eテスト実行
pnpm e2e:ui           # Playwright UIでE2Eテスト実行
pnpm e2e:debug        # E2Eテストのデバッグ
pnpm e2e:report       # Playwrightテストレポート表示
pnpm e2e:codegen      # E2Eテストコードの生成
pnpm e2e:no-report    # E2Eテスト実行（レポートなし）- 作業完了前推奨
```

## 📚 ドキュメント・開発ツール

### Storybook
```bash
pnpm storybook        # Storybook開発サーバー起動（ポート6006）
pnpm build-storybook  # Storybookのプロダクションビルド
```

### コード生成
```bash
pnpm scaffdog         # コード雛形の生成
```

## 🚨 作業完了前の必須チェックリスト

**この順番で実行すること（CLAUDE.mdより）:**

1. `pnpm test` - 単体テスト
2. `pnpm e2e:no-report {必要なテストファイル名}` - E2Eテスト
3. `pnpm lint:fix` - linter自動修正
4. `pnpm type-check` - 型チェック
5. `pnpm lint` - linter

**注意: Sub Agentでタスクを並列化して実行すること**

## 🖥️ Windowsシステムコマンド

### ファイル操作
```bash
dir                   # ディレクトリ内容表示（Unix: ls）
cd                    # ディレクトリ移動
type                  # ファイル内容表示（Unix: cat）
find                  # ファイル検索
findstr               # テキスト検索（Unix: grep）
```

### Git操作
```bash
git status            # リポジトリステータス確認
git add               # ファイルをステージング
git commit            # コミット実行
git push              # リモートにプッシュ
git pull              # リモートから取得
```

## 💡 開発のポイント

- **pnpm dev**, **pnpm storybook**は開発者が既に実行済み
- **data-testid**は絶対に使用禁止
- **バレルエクスポート**禁止
- **UTF-8**を使用
- **TypeScript型推論**を活用
- **3ステップ以上の作業はTodoWrite使用**