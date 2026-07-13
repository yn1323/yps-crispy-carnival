# .github/AGENTS.md

CI/CDパイプラインの構成と運用ルール。

## ブランチ戦略

| ブランチ | 用途 | デプロイ先 | トリガー |
|---|---|---|---|
| `main` | 本番環境 | CF `yps-crispy-carnival` + Convex `yps-crispy-carnival` | `release:*` ラベル付き PR のマージ時のみ |
| `develop` | ステージング環境 | CF `dev-yps-crispy-carnival` + Convex `dev-yps-crispy-carnival` | push 毎 |
| PR → develop | プレビュー環境 | CF `dev-yps-crispy-carnival` (branch: pr-{N}) + Convex preview（一時的） | PR open/sync |

### リリースラベル

`main` への本番デプロイは PR に以下のいずれかのラベルを付けてマージしたときのみ実行される。

| ラベル | 挙動 |
|---|---|
| `release:major` | `npm version major`（例: 1.2.3 → 2.0.0） |
| `release:minor` | `npm version minor`（例: 1.2.3 → 1.3.0） |
| `release:patch` | `npm version patch`（例: 1.2.3 → 1.2.4） |
| `release:provider-canary-passed` | 隔離受信先でTurnstile、Resend、LINE、SlackのRC手動canaryを完了した証跡。`release:*`と併用する |

ラベルなしでマージした場合はデプロイされない（`release.yml` が skip される）。

`release:*`付きPRでも`release:provider-canary-passed`がなければ、本番デプロイ前のゲートで停止する。

canaryラベル付与前に、後述の構造化attestationをPRコメントへ残す。`provider-canary-approval.yml`はdefault branch上の信頼済み`pull_request_target`として、承認者のwrite以上の権限、exact head SHA、24時間以内の確認時刻、環境、証跡URL、全PASS項目を検証した後だけbot検証済みmarkerを記録する。不備時はラベルを削除する。追加push時もラベルを自動削除し、release時はbot検証済みmarkerと最終head SHAの一致を必須にする。

attestationは次の形式で、証跡を確認した本人がコメントする。`evidence-url`はGitHub上のアクセス制御済み証跡またはPR添付を使い、個人情報、token、Webhook URLを含めない。時刻はUTCのISO 8601とする。

```text
<!-- shiftori-provider-canary-attestation:v1 -->
head-sha: <40文字のhead SHA>
environment: production-rc
environment-url: https://<canary実行先>
verified-at: 2026-07-13T00:00:00Z
evidence-url: https://github.com/<owner>/<repo>/...
turnstile-contact: PASS
recruitment-email: PASS
recruitment-line: PASS
confirmation-email: PASS
confirmation-line: PASS
line-reply: PASS
contact-email: PASS
contact-slack: PASS
```

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

### Preview 環境（PRプレビュー、CI品質チェックで使用）

| シークレット | 用途 |
|---|---|
| `CONVEX_DEPLOY_KEY` | dev Convexプロジェクトのデプロイキー |
| `CONVEX_MANAGEMENT_TOKEN` | `deploy.yml`のPreviewデプロイ削除に使うManagement APIトークン |
| `VITE_CONVEX_URL` | dev Convexの永続URL |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk開発用Publishableキー |
| `VITE_TURNSTILE_SITE_KEY` | 問い合わせフォームのCloudflare Turnstile Site Key |
| `CLERK_SECRET_KEY` | Clerk開発用シークレットキー |
| `CLOUDFLARE_API_TOKEN` | CloudFlare APIトークン |
| `CLOUDFLARE_ACCOUNT_ID` | CloudFlareアカウントID |
| `VITE_GTM_ID` | Google Tag Manager ID |

### Develop 環境（developブランチのデプロイで使用）

| シークレット | 用途 |
|---|---|
| `CONVEX_DEPLOY_KEY` | dev Convexプロジェクトのデプロイキー |
| `VITE_CONVEX_URL` | dev Convexの永続URL |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk開発用Publishableキー |
| `VITE_TURNSTILE_SITE_KEY` | 問い合わせフォームのCloudflare Turnstile Site Key |
| `CLERK_SECRET_KEY` | Clerk開発用シークレットキー |
| `CLOUDFLARE_API_TOKEN` | CloudFlare APIトークン |
| `CLOUDFLARE_ACCOUNT_ID` | CloudFlareアカウントID |
| `VITE_GTM_ID` | Google Tag Manager ID |

### Production 環境（mainで使用）

| シークレット | 用途 |
|---|---|
| `CONVEX_DEPLOY_KEY` | prod Convexプロジェクトのデプロイキー |
| `VITE_CONVEX_URL` | prod Convexの永続URL |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk本番用Publishableキー |
| `VITE_TURNSTILE_SITE_KEY` | 問い合わせフォームのCloudflare Turnstile Site Key |
| `CLERK_SECRET_KEY` | Clerk本番用シークレットキー |
| `CLOUDFLARE_API_TOKEN` | CloudFlare APIトークン |
| `CLOUDFLARE_ACCOUNT_ID` | CloudFlareアカウントID |
| `VITE_GTM_ID` | Google Tag Manager ID |

## ワークフロー一覧

### デプロイ (`deploy.yml`)

| ジョブ | トリガー | 処理 |
|---|---|---|
| `deploy-preview` | PR to develop (open/sync) | Convex preview作成 → seed → ビルド → CF dev プレビューデプロイ → 公開URL Smoke |
| `cleanup-preview` | PR to develop (close) | CF dev プレビューと `pr-{N}-deploy` Convex previewを削除 |
| `deploy-develop` | push to develop | Convex devデプロイ → ビルド → CF dev メインデプロイ → 公開URL Smoke |

### リリース (`release.yml`)

| ジョブ | トリガー | 処理 |
|---|---|---|
| `release` | PR merged to main w/ `release:*` ラベル | provider canaryラベル確認 → version bump → commit + tag push → Convex prodデプロイ → ビルド → CF prodデプロイ → GitHub Release作成 |

バージョン bump コミットは `github-actions[bot]` が `main` に直 push する。`main` に branch protection がある場合は bot を bypass 許可するか PAT を用意する必要がある。

### テスト・品質チェック

| ワークフロー | トリガー | 内容 |
|---|---|---|
| `lint.yml` | 全push | Biome lint |
| `type-check.yml` | 全push | TypeScript型チェック |
| `test-logic.yml` | 全push | ロジックテスト（sharding 2分割） |
| `test-ui.yml` | 全push | UIテスト（sharding 2分割、Convex dev使用） |
| `build.yml` | 全push | ビルド確認（Convex dev使用） |
| `playwright.yml` | PR to develop (open/sync/reopen/edited) | Chrome系projectとPR専用Convex PreviewでFull Regression E2E、必須project/scenario・失敗・skip・flaky監査、通知FailureInbox・active dedupe監査、非公開artifact保存 |
| `pr-report-comments.yml` | Playwright / Preview Deploy / VRT完了 | default branchの信頼済み`workflow_run`からPRレポートコメントを更新 |
| `provider-canary-approval.yml` | main向けPRのcanaryラベル付与 / 追加push | 構造化attestationを検証してhead SHA markerを記録し、不備時と追加push時に承認ラベルを削除 |

### Storybook / VRT (`vrt.yml`)

| ワークフロー | トリガー | 内容 |
|---|---|---|
| `vrt.yml` | PR to develop/main、push to develop/main | Storycap testrunでPNG生成 → RegSuit比較 → hosting-pagesへレポート公開。main/developのみbaseline更新 |

## デプロイ順序

Convex deploy → Convex migrations → ビルド → CloudFlare の順で実行する。
- Convex を先にデプロイすることで、スキーマ変更がビルド時に反映される
- `convex deploy` 直後に `npx convex run migrations/index:run` を実行し、データのバックフィルを完了させてからビルドに進む（develop / release のみ、preview は実行しない）
- マイグレーションは `@convex-dev/migrations` で冪等に管理されるため、変更のない PR でも毎回走る（完了済みはスキップされる）
- ビルド時に `VITE_CONVEX_URL` を環境変数として埋め込む

## 注意事項

- `playwright.yml`が作るE2E専用Convex Previewは数日で自動消滅するため、明示的な削除は不要。`deploy.yml`が作るデプロイ用Previewは同workflowのclose処理で削除する
- `build.yml` と `test-ui.yml` は `npx convex dev` でコード生成を行うため Preview 環境のシークレットが必要
- E2E Full Regressionはdevelop向けPRのPreview環境でのみ実施し、developからmainへのPRと`release.yml`ではE2E自体を実行せず、成功checkも要求しない
- E2E専用Convex Previewは自動失効に任せ、cleanup workflowを作らない
- PR専用Convex previewは`preview/pr-{N}-e2e`参照で指定し、bare preview名を`--deployment`へ渡さない
- PRのコードをcheckoutして実行するworkflowの`GITHUB_TOKEN`はread-onlyにする。PRコメントはcheckoutせずartifact内容も実行しない信頼済み`workflow_run`に分離する
