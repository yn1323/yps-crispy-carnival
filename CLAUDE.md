# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

店舗スタッフのシフト管理SaaSアプリケーション。React + Vite + Convex構成。

## コマンド

```bash
pnpm dev              # 開発サーバー起動 (port 3000)
pnpm dev:all          # dev + convex + storybook を並列起動
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
pnpm vitest --project=logic src/path/to/file.test.ts    # 特定ロジックテスト
pnpm vitest --project=logic -t "テスト名"                # 特定テスト名
pnpm vitest --project=ui                                 # UIテスト（Storybook必須）
pnpm e2e e2e/path/to/file.spec.ts                       # 特定E2Eファイル
```

- `logic`プロジェクト: `src/**/*.test.ts` のユニットテスト
- `ui`プロジェクト: Storybook + Playwright（ブラウザモード）でのインタラクションテスト

## ペルソナ

- あなたはUX、UI、エンジニアリングのプロです。UX駆動開発を行っていることを強く意識してください。

## 実装のルール

- 実装完了後、SubAgentで`pnpm lint`, `pnpm type-check`, `pnpm test` を実行すること（Context消費したくない）
- `lint`はwarningでも修正すること
- 次に`/review`を実行して、レビュー結果を要修正、不要で分けて提示してください。
- 上記完了後、SubAgentで`/simplify`を実行してリファクタを行うこと（Context消費したくない）
- SubAgentのModelは絶対にOpusにしてください！！

### フロントエンド（UIあり）

- コロケーションでファイルを作成する
   - index.tsx（必須）
   - index.stories.tsx（必須）
   - index.test.ts（ドメインよりでロジックを分離する必要がある場合のみ作成）
- UIパターンごとにindex.stories.tsxに記載すること（細かすぎないよう注意！）。後工程でVRTに利用します
- 複雑な動きがある場合、index.stories.tsxに操作テストを記載すること

### フロントエンド（UIなしロジック）

- テストファイルも合わせて作成すること

### 環境変数

- `.env`ファイルはGoogle Drive（`/g/マイドライブ/80_環境変数/yps-crispy-carnival/`）にシンボリックリンク
- `pnpm convex:env:setup`で環境変数を同期

## アーキテクチャ

### 技術スタック

React 19 / Vite 7 / TanStack Router / Chakra UI v3 / React Hook Form + Zod 4 / Jotai / Clerk(認証) / Convex(BaaS) / Biome(lint/format)

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

- **routes/**: TanStack Routerのファイルベースルーティング。ページコンポーネントの呼び出し**のみ**。`_auth/`（Clerk認証必須）と`_unregistered/`（ゲスト）でレイアウト分離
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

### フォーム開発

- react-hookform + zodResolverを利用
- index.tsに外出しし、index.test.tsにテストを書くこと
- 常にSubmitボタンはEnabledの状態にする。バリデーションエラーがあれば、Submitボタンは押せるが、エラーで次に進めないような実装方針にしたい。

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

- Zod v4スキーマ + カスタムエラーマップ（日本語メッセージ）
- **mutation引数のZodスキーマは `convex/{useCase}/schemas.ts` に配置し、フロントと共有する**
  - フロントからは `@/convex/{useCase}/schemas` でインポート
  - フォーム固有のラッパー（配列化、UI専用refinement等）は `src/` 側に残す
  - `schemas.ts` は純粋な Zod 定義のみ。DB アクセスや Convex API のインポート禁止
- カスタムバリデータ（フロント専用）: `src/helpers/validation/`（`betweenLength`, `time`, `select`等）
- 共通バリデータ（mutation共有）: `convex/_lib/validation.ts`（`optionalEmail`等）

### 日付操作

- フロントの日付操作は `src/components/features/Shift/ShiftForm/utils/dateUtils.ts`（dayjs）を使用
- `new Date()` + `toISOString()` による日付文字列生成はTZずれの原因になるため禁止
- Convexバックエンド（`convex/`）ではdayjsを使えないため、文字列比較（"YYYY-MM-DD"）で対応

### Select × モーダル/BottomSheet

- モーダルやBottomSheet内でSelectを使う場合は `usePortal={false}` を指定すること（Portalだとドロップダウンがモーダル背後に回る）
- BottomSheetの `overflowY="auto"` がドロップダウンをクリップする場合は `overflowY="visible"` を渡すこと

### Storybook

- `@storybook/react-vite`を使用（`@storybook/react`ではない）
- `@storybook/test`パッケージはインストールされていない。`fn()`は使わず、コールバックは `() => {}` で直接指定する
- stories は各コンポーネントと同階層に配置（`.stories.tsx`）

## デザイン

- デザイン関連のファイル・ルールは `design/` ディレクトリを参照（`design/CLAUDE.md`）。
- デザインをもとにモックを作成する場合、実装後にpencil MCP, Storybook MCP, Playwright MCPでスクショを取ってPencilのデザイン通り実装できているか確認すること（フォント差については許容）
- VRTは無料枠で毎月のキャプチャ数に限りがあります。小さなコンポーネントはVariants Storyを作成し、1つのStoryにまとめたいです。
  大きいコンポーネントはそのままでOK。
  操作用のStoryが必要なら、Interactive Storyを別途作成すること。（小さいコンポーネントのみ）

## コーディング

- `pnpm lint`, `pnpm type-check`を必ず実行すること
- 以下の自動生成ファイルは絶対に手動で編集しないこと（各ツールが自動再生成する）
  - `convex/_generated/` — Convex CLIが生成（`pnpm convex:dev`）
  - `src/routeTree.gen.ts` — TanStack Routerが生成（`pnpm dev`）
  - `pnpm-lock.yaml` — pnpmが管理

## プラン

- planドキュメント保存時は参考ファイルのパスも記載すること

## ドキュメント

- `doc/ARCHITECTURE.md`: 全体構造、機能→ファイルマッピング、データフロー
- `doc/INDEX.md`: 機能仕様ドキュメントのインデックス
- `doc/features/`: 各機能の概要（関連ファイル・画面一覧・API一覧）。詳細な仕様はコードを参照（Single Source of Truth）
- `doc/plans/`: 実装計画
- `doc/claude/soul.md`: 設計判断の指針
- `convex/CLAUDE.md`: Convexアーキテクチャ、実装観点の詳細
- `e2e/CLAUDE.md`: E2Eアーキテクチャ、実装観点の詳細

### ドキュメント運用ルール

- 新機能を実装したら `doc/features/` に概要ドキュメントを作成・更新する
- 機能概要には: 機能説明（1-2文）、関連ファイルパス、画面一覧、API一覧を含める
- 詳細な仕様・ロジックはコードに書く（ドキュメントとコードの二重管理を避ける）
- `doc/INDEX.md` に新規ドキュメントへのリンクを追加する

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

### テキストガイドライン
アプリケーション内で文章を作り際の好み

#### トーン

- ポジティブ寄り（ペイン訴求よりベネフィット）
- ドヤ感NG（「すごいでしょ？」より「ふつうにラクだよ」）
- 力の抜けた自然体（寄り添う > 売り込む）

#### 文体(タイトル、サブタイトルなどの時のみ)

- 句読点なし 改行でリズムを作る
- です/ます不要 でもタメ口すぎない中間トーン
- 体言止めOK（「提出」「ワンクリック」）
- ひらがな多め 漢字密度は低く

#### 内容のルール

- 嘘つかない（実態と違う「自動」「勝手に」はNG）
- 手段を推さない（メールはMVPの制約であって価値じゃない）
- プロセスの説明より体験を伝える
- 上から目線NG（「小さなお店」→「少人数のお店」）
- 短く 1行で複数の役割を持たせる（「誰向け」+「何をしてくれる」を合体）

#### 構造

- 情報は削る方向
- 被りは許さない（同じことを別セクションで繰り返さない）
- 不要なセクションは容赦なく切る
