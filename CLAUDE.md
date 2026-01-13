# CLAUDE.md

このファイルは、Claude Code (claude.ai/code) がこのリポジトリで作業する際のガイダンスを提供します。

## 参照ドキュメント
- @doc/claude/basic.md
- @doc/claude/self.md
- @doc/ARCHITECTURE.md
- @doc/INDEX.md

## 🚨 核心制約

### NEVER（絶対禁止）
- NEVER: data-testidをテストで使用

### YOU MUST（必須事項）
- YOU MUST: 質問をする場合は、1つずつ質問してください。チャットなので。。。
- YOU MUST: ユーザーの指示で不明瞭な箇所は必ず聞き返してください。これすごく重要！！ぜひ一緒に仕様をつくっていきましょう！
- YOU MUST: コードの確認は下記のコマンドを利用してください。
   - `pnpm format` - Biomeフォーマット（作業完了前に必ず実行）
   - `pnpm lint` - Biomeリンティング（作業完了前に必ず実行）
   - `pnpm type-check` - TypeScript型チェック（作業完了前に必ず実行）
   - `pnpm test` - Vitestテスト（ロジック、UI修正時のみ）
   - `pnpm e2e` - Playwright E2Eテスト（E2E作成・修正時のみ）
- YOU MUST: 機能実装後（新機能追加、API追加、画面追加、スキーマ変更等）はドキュメント更新を確認してください。スキル `/doc-update` を使用。

### IMPORTANT（重要事項）
- IMPORTANT: Chakra UI v3 Modern API準拠
- IMPORTANT: 3ステップ以上でTodoWrite使用
- IMPORTANT: 作業開始前に計画することを好む
- IMPORTANT: バレルエクスポート禁止
- IMPORTANT: utf-8を利用すること
- IMPORTANT: TypeScriptの型は推論を利用すること
- IMPORTANT: 定数化は2箇所以上で利用しているときのみとする
- IMPORTANT: 開発者の指摘が誤っているときは、根拠を示して反論すること
- IMPORTANT: UIX/UX方向性を決めるときは、skill frontend-design, skill ux-designerを利用して検討すること
- IMPORTANT: E2Eテスト実装時はskill playwright-skillを利用すること（E2Eテストは現段階では不要）
   - ブラウザ起動後のログインはこちらで行うので、playwright mcp利用時は一声かけてください
- IMPORTANT: リリース前につきソースコードの修正時のマイグレーション考慮は不要。でも警告くらいは出してね
- IMPORTANT: 3ステップ以上の実装計画を立てたら、`doc/plans/yyyy-mm-dd_<機能名>.md` に保存すること
   - コンテキスト圧縮後も参照できるようにするため
   - skill save-plan を使用、または直接 Write で保存
   - コンテキスト圧縮から復帰後はドキュメントを見て、実装計画を再度考えること
- IMPORTANT: コンテキスト圧縮からの復帰時・セッション再開時は、まず `doc/plans/` を確認すること
   - 作業中の計画ファイルがあれば、必ず読み込んでから作業を再開
   - 「8. 現在の進捗」セクションを確認し、次にやるべきことを把握
   - 計画ファイルがなければ、ユーザーに状況を確認

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
- **日付**: dayjs

### プロジェクト構造

#### ソースコード（`src/`）
- `routes/` - TanStack Routerのルート定義（ファイルベースルーティング）、pagesの呼び出し。state管理はしない
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

### デザイン
- アイコンは react-iconsのLucideセットを利用すること(Chakraの Iconタグで呼び出すこと<Icon as={SomeIcon}>)
- `"@storybook/react"`; は、 ` "@storybook/react-vite";`で呼び出すこと

### 汎用コンポーネント
- Selectボックス：@yps-crispy-carnival/src/components/ui/Select/index.tsx  
- Formのカード：@yps-crispy-carnival/src/components/ui/FormCard/index.tsx
- ページタイトル：@yps-crispy-carnival/src/components/ui/Title/index.tsx
- モーダルダイアログ：@yps-crispy-carnival/src/components/ui/Dialog/index.tsx
   - ビジネスロジック側で利用する場合、○○Modal/でディレクトリを切り、index.tsx, index.stories.tsxを切り出すこと

### Formバリデーション
- react-hook-form x zodを利用。schemaはコロケーションでschema.tsとして切り出すこと

### 全体バリデーション方針
- @src/configs/zod/zop-setup.ts にメッセージは集約し、専用のメッセージなしでも通じるようにする
- 個別のschemaでは可能な限り専用メッセージなしにしたい
- バリデーションの定数は @src/constants/validations.ts に集約

## DBについて
- convexはバックエンドとしてアップロードするため、./convexにすべてのコードが入っている必要があります
- 定数などは @convex/constants.ts に集約する


## エラーハンドリング戦略
- Formのエラー以外は、toastで成功・失敗をユーザーに通知するようにしてください

## コンポーネントの責務（大事！）
1. routes/
   - page配下のコンポーネント呼び出しのみ
   - それ以外は禁止！
2. src/components/pages
   - useQueryの呼び出し
   - APIに応じたエラー、ローディング、正常ケースのコンポーネント呼び出し
   - useMutationの定義は禁止
   - 正常系ケースのコンポーネント呼び出し時はエラー、ローディングなどの判定は終わっているものとしたい！
3. src/components/features
   - 主にレイアウト、ドメインロジックを持つ
   - useMutationの定義
   - index.tsx内に正常系、エラー、ローディングのコンポーネントを持ち、これらは適宜src/components/pagesで呼び出される

## Claude Code Web(Claude Code Desktop)のE2E実行
- スキル `e2e-execution` を参照（`.claude/skills/e2e-execution/SKILL.md`）