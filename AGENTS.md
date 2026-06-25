# AGENTS.md

This file provides guidance to Codex and other coding agents when working with code in this repository.

## プロジェクト概要

店舗スタッフのシフト管理SaaSアプリケーション。
React + Vite + TanStack Router + Chakra UI v3 + Convex 構成。

## 必読ドキュメント / スキル

- 作業開始時に必ず `doc/rules/testing-strategy.md` を読み、テスト種別・粒度・Convex Scenario Test の配置方針に従うこと。
- コード実装・修正・レビュー時は `.agents/skills/shiftori-coding/SKILL.md` を読み、配置判断・技術スタック別の書き方・自己修復ルールに従うこと。
- `src/` 配下を扱う場合は `src/AGENTS.md` を読むこと。
- Convexコードを扱う場合は、`convex/_generated/ai/guidelines.md` と `convex/AGENTS.md` を必ず読むこと。
- E2Eを扱う場合は `e2e/AGENTS.md`、CI/CDを扱う場合は `.github/AGENTS.md` を読むこと。
- UI/UXや文言は `ui-architect`、テスト設計は `test-strategy`、Convex migration は `convex-migration-helper` を併用すること。

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

## Git Worktree運用

- 同じブランチは複数のworktreeで同時にcheckoutできないため、作業ごとに `codex/...` などの専用ブランチを切ること。
- worktreeごとに `node_modules` は別管理になるため、新しいworktreeでは必要に応じて `pnpm install` を実行すること。
- `.env` はGoogle Driveへのシンボリックリンクなので、新しいworktree側でも `ls -l .env` でリンクが正しいか確認すること。
- `pnpm dev` はport 3000、`pnpm storybook` はport 6006を使う。複数worktreeで同時起動する場合は、片方を `pnpm exec vite --port 3001` や `pnpm exec storybook dev -p 6007` のように明示的にずらすこと。
- `pnpm convex:dev` は同じConvex deploymentに対して関数を同期するため、複数worktreeで同時起動すると別ブランチのbackend変更が押し合う可能性がある。基本は1つのworktreeだけで起動し、必要な時だけ切り替えること。
- 不要になったworktreeは `git worktree remove <path>` で削除し、状態確認には `git worktree list` を使うこと。

## ペルソナ

- あなたはUX、UI、エンジニアリングのプロです。UX駆動開発を行っていることを強く意識してください。

## 実装の強いルール

- Submit系ボタンは二重送信に注意すること。UIのloading/disabledだけに依存せず、短時間の連続クリックでも同じ処理が複数回走らないよう、フロントの同期ガードやバックエンドの冪等性を必要に応じて設計すること。
- 実装変更に合わせた自動テストの追加・更新・削除は、`doc/rules/testing-strategy.md` と `test-strategy` に従うこと。
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
- `doc/rules/testing-strategy.md`: テスト種別、粒度、Convex Scenario Test の設計方針
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

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->
