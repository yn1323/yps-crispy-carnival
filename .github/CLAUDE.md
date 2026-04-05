# .github/CLAUDE.md

CI/CDパイプラインの構成と運用ルール。

## ブランチ戦略

| ブランチ | 用途 | デプロイ先 |
|---|---|---|
| `main` | 本番環境 | CF `yps-crispy-carnival` + Convex `yps-crispy-carnival` |
| `develop` | ステージング環境 | CF `dev-yps-crispy-carnival` + Convex `dev-yps-crispy-carnival` |
| PR → develop | プレビュー環境 | CF `dev-yps-crispy-carnival` (branch: pr-{N}) + Convex preview（一時的） |

## 外部サービス構成

### CloudFlare Pages

2プロジェクト体制:
- `yps-crispy-carnival` — 本番専用（mainブランチのみデプロイ）
- `dev-yps-crispy-carnival` — 開発用（developのメインデプロイ + PRプレビュー）

### Convex

2プロジェクト体制:
- `yps-crispy-carnival` — 本番DB
- `dev-yps-crispy-carnival` — 開発DB（永続） + PRプレビュー環境（数日で自動消滅）

### Clerk

1アプリ・2モード:
- 本番環境 → Clerk本番キー（Production環境シークレット）
- 開発/プレビュー環境 → Clerk開発キー（Preview環境シークレット）

## GitHub Environments

シークレットはGitHub Environmentsで環境別に管理する。同じキー名で環境ごとに異なる値を設定。

### Preview 環境（develop + PRプレビューで使用）

| シークレット | 用途 |
|---|---|
| `CONVEX_DEPLOY_KEY` | dev Convexプロジェクトのデプロイキー |
| `VITE_CONVEX_URL` | dev Convexの永続URL |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk開発用Publishableキー |
| `CLERK_SECRET_KEY` | Clerk開発用シークレットキー |
| `CLOUDFLARE_API_TOKEN` | CloudFlare APIトークン |
| `CLOUDFLARE_ACCOUNT_ID` | CloudFlareアカウントID |

### Production 環境（mainで使用）

| シークレット | 用途 |
|---|---|
| `CONVEX_DEPLOY_KEY` | prod Convexプロジェクトのデプロイキー |
| `VITE_CONVEX_URL` | prod Convexの永続URL |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk本番用Publishableキー |
| `CLERK_SECRET_KEY` | Clerk本番用シークレットキー |
| `CLOUDFLARE_API_TOKEN` | CloudFlare APIトークン |
| `CLOUDFLARE_ACCOUNT_ID` | CloudFlareアカウントID |

## ワークフロー一覧

### デプロイ (`deploy.yml`)

| ジョブ | トリガー | 処理 |
|---|---|---|
| `deploy-preview` | PR to develop (open/sync) | Convex preview作成 → seed → ビルド → CF dev プレビューデプロイ |
| `cleanup-preview` | PR to develop (close) | CF dev プレビュー削除 |
| `deploy-develop` | push to develop | Convex devデプロイ → ビルド → CF dev メインデプロイ |
| `deploy-production` | push to main | Convex prodデプロイ → ビルド → CF prod メインデプロイ |

### テスト・品質チェック

| ワークフロー | トリガー | 内容 |
|---|---|---|
| `lint.yml` | 全push | Biome lint |
| `type-check.yml` | 全push | TypeScript型チェック |
| `test-logic.yml` | 全push | ロジックテスト（sharding 2分割） |
| `test-ui.yml` | 全push | UIテスト（sharding 2分割、Convex dev使用） |
| `build.yml` | 全push | ビルド確認（Convex dev使用） |
| `playwright.yml` | PR to develop | E2Eテスト（Convex preview使用） |

### Storybook (`chromatic_*.yml`)

| ワークフロー | トリガー | 内容 |
|---|---|---|
| `chromatic_pr_on_push.yml` | PR push（draft/renovate除外） | 変更コンポーネントのみChromatic公開 |
| `chromatic_pr_on_ready.yml` | PR ready for review | 同上 |
| `chromatic_merged.yml` | push to main/develop | ベースライン自動承認 |

## デプロイ順序

Convex → ビルド → CloudFlare の順で実行する。
- Convexを先にデプロイすることで、スキーマ変更がビルド時に反映される
- ビルド時に `VITE_CONVEX_URL` を環境変数として埋め込む

## 注意事項

- PRプレビューのConvex環境は数日で自動消滅するため、明示的な削除は不要
- `build.yml` と `test-ui.yml` は `npx convex dev` でコード生成を行うため Preview 環境のシークレットが必要
- E2Eテストはプレビュー環境（PR）でのみ実施
