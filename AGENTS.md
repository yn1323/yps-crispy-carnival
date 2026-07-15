# AGENTS.md

This file provides guidance to Codex and other coding agents when working with code in this repository.

# Review language

All pull request review comments must be written in Japanese.
Keep explanations concise.

## プロジェクト概要

店舗スタッフのシフト管理SaaSアプリケーション。
React + Vite + TanStack Router + Chakra UI v3 + Convex 構成。

## 必読ドキュメント / スキル

- `src/` 配下のコードを扱う場合は、作業開始時に `doc/rules/frontend-architecture.md` を読み、ディレクトリ、依存方向、ファイル責務に従うこと。
- テスト層や配置を選ぶ、既存のカバレッジ契約を変える、または大規模回帰を扱う場合は、作業開始時に `doc/rules/testing-strategy.md` を読み、テスト種別・粒度・Convex Scenario Test の配置方針に従うこと。同じ層の近い既存テストを追従更新するだけなら、その既存パターンを優先する。テスト方針を変えない文書編集では必須にしない。
- コード実装・修正・レビュー時は `.agents/skills/shiftori-coding/SKILL.md` を読み、配置判断・技術スタック別の書き方・自己修復ルールに従うこと。
- セキュリティ、認証、認可、IDOR、magic link、Capability lifecycle、招待、Webhook、LINE、Resend、billing、個人情報ログ、retention/redactionの境界または状態遷移を新設・変更する相談、プラン、設計、実装、レビューでは、プラン確定前に `shiftori-security-review` を使い、`doc/rules/security-strategy.md` を読むこと。
- Convex public query/mutation/action、staff token/session、manager/billing権限、外部HTTP Action、service credential/replay、通知配送、Outbox lease/fanout recovery、登録/招待導線の公開範囲、認証・認可、tenant境界、入力制約、データ露出、lifecycle、外部副作用を変更する場合も同様に扱うこと。既存wrapperとこれらの安全契約を変えない内部実装、並び順、配置変更だけでは自動的に発動しない。
- `src/` 配下を扱う場合は `src/AGENTS.md` を読むこと。
- Convexコードを扱う場合は、`convex/_generated/ai/guidelines.md` と `convex/AGENTS.md` を必ず読むこと。
- ユーザーがConvexの横断レビューを求めた場合、または複数use caseをまたいでpublic API境界、Capability、非同期workflow、データ保持、運用設計を変更する場合は、`doc/rules/convex-design-strategy.md` を読み、`convex-design-review` を使うこと。既存境界内の局所的なquery / mutation / action実装では発動しない。
- E2Eを扱う場合は `e2e/AGENTS.md`、CI/CDを扱う場合は `.github/AGENTS.md` を読むこと。
- UI/UXや文言を変更する場合は `ui-architect`、テスト層・配置・新しい検証契約を設計する場合は `test-strategy`、persisted shapeの変更やbackfillが必要な場合は `convex-migration-helper` を併用すること。

## 実装スコープ

- 通常の変更は、近い既存実装と同じ境界に置く最小差分をデフォルトにする。
- 規約やスキルに並ぶリスク項目は適用判定のチェックリストであり、すべてを実装対象にしない。変更に関係しない設計、監視、運用、テスト層へ広げない。
- 新しいtable、job、queue、state machine、service、helper、wrapper、registry、runner、監視基盤は、依頼の契約または確認できた現在の問題に必要な場合だけ追加する。将来の可能性や一般論だけを根拠に作らない。
- 認証、認可、店舗境界、入力検証、migration、外部副作用の冪等性など、変更に直接関係する安全契約は省略しない。既存wrapper、policy、共通基盤を優先して最小限に実装する。
- テストは変更契約を直接検証する主担当層を一つ選び、別の失敗境界を検知する場合だけ他層を追加する。局所変更へ全テスト層やFull Regressionを一律に要求しない。
- ユーザーが明示していないrepo全体の監査、汎用基盤化、大規模リファクタへ広げない。必要なら理由と追加範囲を先に説明する。

## コマンド

```bash
pnpm dev              # 開発サーバー起動 (port 3000)
pnpm dev:all          # dev + convex + storybook を並列起動
pnpm build            # ビルド (vite build && tsc)
pnpm lint             # Biomeでlint
pnpm format           # Biomeでフォーマット (--write)
pnpm type-check       # TypeScriptの型チェック
pnpm test             # 全テスト (vitest: logic + ui + convex)
pnpm test:logic       # ロジックテストのみ (src/**/*.test.ts)
pnpm test:ui          # UIテスト (Storybook + Playwright browser)
pnpm test:convex      # Convexテスト (Function Test + Scenario Test)
pnpm e2e              # E2Eテスト (Playwright)
pnpm storybook        # Storybook起動 (port 6006)
pnpm scaffdog         # コンポーネントの雛形生成
pnpm convex:dev       # Convex開発サーバー
```

### Codex sandboxで失敗しやすいコマンド

- `pnpm lint` は `tsx scripts/check-convex-timezone.ts` が IPC pipe を作るため、Codex sandbox内では `EPERM: operation not permitted ... tsx-*.pipe` で失敗しやすい。Codexで実行する場合は最初から権限付きで実行すること。
- `pnpm test:ui` / `pnpm e2e` / `pnpm vrt` など Playwright / ブラウザ起動を伴う検証は、Codex sandbox内ではブラウザ起動・IPC・ローカルサーバー接続で失敗しやすい。Codexで実行する必要がある場合は最初から権限付きで実行すること。
- これらはテスト・lintの失敗とは区別する。`EPERM`、ブラウザ起動不可、IPC/listen失敗など実行環境由来のエラーは、コード修正ではなく実行権限の問題として扱う。

### 単一テスト実行

```bash
pnpm vitest --project=logic src/path/to/file.test.ts
pnpm vitest --project=logic -t "テスト名"
pnpm vitest --project=ui
pnpm vitest --project=convex convex/path/to/file.test.ts
pnpm e2e e2e/path/to/file.spec.ts
```

## Git作業運用

- 新しいworktreeは作成せず、現在checkoutしている作業ディレクトリをそのまま使用すること。
- 現在のブランチに今回の作業とは別のコミットが含まれていても、新しいブランチの作成や切り替えは行わず、現在のブランチで作業すること。

## ペルソナ

- あなたはUX、UI、エンジニアリングのプロです。UX駆動開発を行っていることを強く意識してください。

## 実装の強いルール

- Submit系ボタンは二重送信に注意すること。UIのloading/disabledだけに依存せず、短時間の連続クリックでも同じ処理が複数回走らないよう、フロントの同期ガードやバックエンドの冪等性を必要に応じて設計すること。
- 実装変更に合わせてテスト層、配置、新しい検証契約を設計・変更するときは、`doc/rules/testing-strategy.md` と `test-strategy` に従うこと。同じ層の近い既存テストを追従更新するだけなら、その既存パターンを優先すること。
- `apps/analytics-dashboard/` は本人だけが使う内部BIのため、自動テストとFull Regressionの対象外とする。新しいLogic/UI/Storybook/VRT/E2Eテストを追加・維持せず、変更時は`pnpm analytics:lint`、`pnpm analytics:type-check`、`pnpm analytics:build`で確認すること。
- VRT対象Storyの初期表示に含まれる静的な見出しや文言は、存在確認だけを目的としたplay functionで重複検証しないこと。操作後に初めて現れるエラー、確認状態、送信結果など、状態遷移の契約だけをBehavior Testで検証すること。
- Full Regressionは、実装詳細や静的文言の総当たりではなく、大規模リファクタ後も主要導線、状態遷移、認証境界、通知、永続化、モバイル、アクセシビリティの退行を検知できる契約を守ること。
- ブラウザをAI Agentが動かしてやるテストは不要。必要な確認は自動テストとして設計すること。
- Convex起動、Storybook起動、Vite起動はユーザーが実施しています。新規でコマンドを叩かないでください。
- `.env`ファイルはGoogle Drive（`/g/マイドライブ/80_環境変数/yps-crispy-carnival/`）にシンボリックリンク。環境変数同期は `pnpm convex:env:setup` を使う。

## 実装完了後

- 変更範囲に応じて `pnpm lint`, `pnpm type-check`, `pnpm test` を実行すること。
- `lint`はwarningでも修正すること。
- 実装後にコードレビュー観点で自己確認し、要修正の指摘があれば修正すること。
- 最後に不要な複雑さや重複を見直し、必要な範囲で簡素化すること。
- 最後にCodexのレビューを実施し、指摘があれば修正してから完了すること。
- レビュー結果をユーザーに伝える場合は、日本語で説明すること。

## 自動生成ファイル

以下の自動生成ファイルは絶対に手動で編集しないこと。

- `convex/_generated/` — Convex CLIが生成（`pnpm convex:dev`）
- `src/routeTree.gen.ts` — TanStack Routerが生成（`pnpm dev`）
- `pnpm-lock.yaml` — pnpmが管理

## プラン

- planドキュメント保存時は参考ファイルのパスも記載すること。

## ドキュメント

- `doc/ARCHITECTURE.md`: 全体構造、機能→ファイルマッピング、データフロー
- `doc/INDEX.md`: 機能仕様ドキュメントのインデックス
- `doc/features/`: 各機能の概要（関連ファイル・画面一覧・API一覧）。詳細な仕様はコードを参照（Single Source of Truth）
- `doc/plans/`: 実装計画
- `doc/rules/frontend-architecture.md`: フロントエンドのディレクトリ、依存方向、ファイル責務
- `doc/rules/testing-strategy.md`: テスト種別、粒度、Convex Scenario Test の設計方針
- `doc/rules/security-strategy.md`: セキュリティ設計、認証/認可境界、token/通知/billing レビュー方針
- `doc/rules/convex-design-strategy.md`: Convexの認証境界、公開API、Capability、durable workflow、データ保持、運用契約
- `doc/claude/soul.md`: 設計判断の指針
- `convex/AGENTS.md`: Convexアーキテクチャ、実装観点の詳細
- `e2e/AGENTS.md`: E2Eアーキテクチャ、実装観点の詳細

### ドキュメント運用ルール

- 新機能を実装したら `doc/features/` に概要ドキュメントを作成・更新する。
- 機能概要には、機能説明（1-2文）、関連ファイルパス、画面一覧、API一覧を含める。
- 詳細な仕様・ロジックはコードに書く（ドキュメントとコードの二重管理を避ける）。
- `doc/INDEX.md` に新規ドキュメントへのリンクを追加する。

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
