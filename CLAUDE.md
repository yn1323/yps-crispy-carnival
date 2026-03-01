# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

店舗スタッフのシフト管理SaaSアプリケーション。React + Vite + Convex構成。

## コマンド

```bash
pnpm dev              # 開発サーバー起動 (port 3000)
pnpm build            # ビルド (vite build && tsc)
pnpm lint             # Biomeでlint
pnpm format           # Biomeでフォーマット (--write)
pnpm type-check       # TypeScriptの型チェック
pnpm test             # 全テスト (vitest: logic + ui)
pnpm test:logic       # ロジックテストのみ (src/**/*.test.ts)
pnpm test:ui          # UIテスト (Storybook + Playwright browser)
pnpm e2e              # E2Eテスト (Playwright)
pnpm storybook        # Storybook起動 (port 6006)
pnpm scaffdog         # コンポーネントの雛形生成
pnpm convex:dev       # Convex開発サーバー
```

### 単一テスト実行

```bash
pnpm vitest --project=logic src/path/to/file.test.ts    # 特定ファイル
pnpm vitest --project=logic -t "テスト名"                # 特定テスト名
pnpm e2e e2e/path/to/file.spec.ts                       # 特定E2Eファイル
```

## アーキテクチャ

### 技術スタック

React 19 / Vite / TanStack Router / Chakra UI v3 / React Hook Form + Zod / Jotai / Clerk(認証) / Convex(BaaS) / Biome(lint/format)

### レイヤー構造とデータフロー

```
routes/       → ページ呼び出しのみ（ロジック禁止）
  ↓
pages/        → useQuery、エラー/ローディング処理（useMutation禁止）
  ↓
features/     → ドメインロジック、useMutation、UI組成
  ↓
convex/       → queries.ts(読み取り) / mutations.ts(書き込み) / policies.ts(権限判定)
```

- **routes/**: TanStack Routerのファイルベースルーティング。ページコンポーネントの呼び出し**のみ**
- **pages/**: `useQuery`でデータ取得し、エラー/ローディング/正常系を振り分け。正常系のみfeaturesを呼ぶ
- **features/**: ドメイン別ディレクトリ（Shop, Shift, Staff等）。`useMutation`はここで定義
- **ui/**: 汎用UIコンポーネント（FormCard, BottomSheet等）。Select, DialogなどChakra UIのラッパーもここに配置
- **templates/**: レイアウトコンポーネント（BottomMenu, SideMenu等）

### Convexバックエンド（詳細は `convex/CLAUDE.md` を参照）

- Feature Slices + CQRS + Policy Pattern
- ドメイン単位でディレクトリ分割（shop/, user/, staff/等）
- `policies.ts`は純粋関数（DBアクセスなし）。命名: `can*` / `is*`
- API呼び出し: `api.shop.queries.getById` / `api.shop.mutations.create`
- 論理削除パターン: `isDeleted`フラグ

### 状態管理（Jotai）

- `selectedShopAtom`: 選択中店舗（localStorage永続化）
- `userAtom`: ログインユーザー情報
- ShiftForm系Atoms: Jotai Providerでスコープ管理

### 認証

- **Clerk**: アプリ認証（管理者・マネージャー）
- **マジックリンク**: スタッフのシフト申請（Clerkアカウント不要）
- **招待トークン**: マネージャー招待用

## コーディング規約

### パスエイリアス

```ts
import { Foo } from "@/src/components/...";
import { bar } from "@/convex/...";
```

### Biome設定

- インデント: スペース2つ / 行幅: 120文字
- import自動整理有効（`organizeImports`）
- `convex/_generated`、`src/routeTree.gen.ts`は自動生成のため除外

### バリデーション

- Zodスキーマ + カスタムエラーマップ（日本語メッセージ）
- カスタムバリデータ: `src/helpers/validation/`（`betweenLength`, `time`, `select`等）

### Storybook

- `@storybook/react-vite`を使用（`@storybook/react`ではない）
- `@storybook/test`パッケージはインストールされていない。`fn()`は使わず、コールバックは `() => {}` で直接指定する
- stories は各コンポーネントと同階層に配置（`.stories.tsx`）

## デザイン

- `design.pen`: UIデザインファイル。Pencil MCPツール経由で読み書きする（`Read`や`Grep`では読めない）
- デザイン確認・編集には `batch_get`、`batch_design`、`get_screenshot` 等のPencil MCPツールを使用

## コーディング

- `pnpm lint`, `pnpm type-check`を必ず実行すること

## プラン

- planドキュメント保存時は参考ファイルのパスも記載すること

## ドキュメント

- `doc/ARCHITECTURE.md`: 全体構造、機能→ファイルマッピング、データフロー
- `doc/INDEX.md`: 機能仕様ドキュメントのインデックス
- `doc/features/`: 各機能の仕様
- `doc/plans/`: 実装計画
- `doc/claude/soul.md`: 設計判断の指針
- `convex/CLAUDE.md`: Convexアーキテクチャの詳細
