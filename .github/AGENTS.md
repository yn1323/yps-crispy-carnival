# .github/AGENTS.md

CI/CDパイプラインの構成と運用ルール。

## ブランチ戦略

| ブランチ | 用途 | デプロイ先 | トリガー |
|---|---|---|---|
| `main` | 本番環境 | CF `yps-crispy-carnival` + Convex `yps-crispy-carnival` | `release:*` ラベル付き PR のマージ時のみ |
| `develop` | ステージング環境 | CF `dev-yps-crispy-carnival` + Convex `dev-yps-crispy-carnival` | push 毎 |
| PR → develop | 静的プレビュー環境 | CF `dev-yps-crispy-carnival` (branch: pr-{N}) + develop Convex | PR open/sync |

### リリースラベル

`main` への本番デプロイは PR に以下のいずれかのラベルを付けてマージしたときのみ実行される。

| ラベル | 挙動 |
|---|---|
| `release:major` | PR内で`package.json`をmajor更新（例: 1.2.3 → 2.0.0）して本番releaseを要求する |
| `release:minor` | PR内で`package.json`をminor更新（例: 1.2.3 → 1.3.0）して本番releaseを要求する |
| `release:patch` | PR内で`package.json`をpatch更新（例: 1.2.3 → 1.2.4）して本番releaseを要求する |
| `release:provider-canary-passed` | 隔離受信先でTurnstile、Resend、LINE、SlackのRC手動canaryを完了した証跡。`release:*`と併用する |

ラベルなしでマージした場合はデプロイされない（`release.yml` が skip される）。

`release:*`付きPRでも`release:provider-canary-passed`がなければ、本番デプロイ前のゲートで停止する。

canaryラベル付与前に、後述の構造化attestationをPRコメントへ残す。`provider-canary-approval.yml`はdefault branch上の信頼済み`pull_request_target`として、承認者のwrite以上の権限、exact head SHA、24時間以内の確認時刻、環境、証跡URL、全PASS項目を検証した後だけbot検証済みmarkerを記録する。不備時はラベルを削除する。追加push時もラベルを自動削除し、release時はbot検証済みmarkerと最終head SHAの一致を必須にする。releaseはPRの`merge_commit_sha`を直接checkoutし、そのtreeがcanary承認済みheadのtreeと完全一致する場合だけ続行する。mainの前進やmerge時の内容変化でtreeが変わった場合は停止し、更新後のheadでcanaryをやり直す。

version更新はcanary前のrelease PRへ含める。release workflow内ではsourceを変更せず、`package.json`のversionからtagを作る。同名tagが別commitを指す場合は停止し、同じmerge commitを指す場合だけ再実行を許可する。release後にversionをdevelopへ戻す同期workflowは使用しない。

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
- `dev-yps-crispy-carnival` — 開発DB（永続） + PR Full Regression用preview（数日で自動消滅）

### Clerk

1アプリ・2モード:
- 本番環境 → Clerk本番キー（Production環境シークレット）
- 開発/プレビュー環境 → Clerk開発キー（Preview環境シークレット）

## GitHub Environments

シークレットはGitHub Environmentsで環境別に管理する。同じキー名で環境ごとに異なる値を設定。

### Preview 環境（same-repository PRのPreview / Full Regressionで使用）

| シークレット | 用途 |
|---|---|
| `CONVEX_DEPLOY_KEY` | dev Convexプロジェクトのデプロイキー |
| `CONVEX_MANAGEMENT_TOKEN` | `deploy.yml`のPR close cleanupがPR用Convex Previewを削除するManagement APIトークン |
| `VITE_CONVEX_URL` | dev Convexの永続URL |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk開発用Publishableキー |
| `VITE_TURNSTILE_SITE_KEY` | 問い合わせフォームのCloudflare Turnstile Site Key |
| `CLERK_SECRET_KEY` | Clerk開発用シークレットキー |
| `CLOUDFLARE_API_TOKEN` | CloudFlare APIトークン |
| `CLOUDFLARE_ACCOUNT_ID` | CloudFlareアカウントID |
| `VITE_GTM_ID` | Google Tag Manager ID |

browserへ埋め込まれる`VITE_*`はRepository Variablesではなく同EnvironmentのSecretsから参照する。`Preview`にはhosting-pages公開用credentialを置かない。

credential付きPR workflowは、base repositoryとhead repositoryが同じsame-repository PRだけを対象にする。fork PRへEnvironment Secretsを渡さず、外部contributorのPRではPreviewとFull Regressionを実行しない。この運用ではsame-repositoryのbranchへpushできるactorを信頼境界内とみなすため、repository write権限を最小化し、workflow変更を通常のコード変更と同様にレビューする。`pull_request_target`でPR headをcheckoutして実行してはならない。VRT producerはsecretlessでPR / pushに対して実行し、公開credentialを持たない。

Environmentのdeployment branch policyを使う場合、`Preview`はsame-repository PRのhead branchを許可する。`vrt-approval` Environmentにはrequired reviewerを設定し、公開用secretは置かない。VRT publisherはtrusted reportをhosting-pagesへ公開してPRコメントから確認できる状態にした後、差分がある場合だけこのEnvironmentの`approve` jobで人の承認を待つ。publisherはPR head SHAの固定commit status `shiftori/vrt-approval`を承認待ち中は`pending`、差分なしまたは承認後は`success`、失敗時は`failure`へ更新する。branch protection / rulesetではこのstatus contextをrequired checkにし、strict required status checks（Require branches to be up to date）も有効化する。base更新後はPR branchのupdateによる`synchronize`でVRTを再比較し、旧baselineに対するsuccessを再利用しない。これらのGitHub上の設定はworkflowファイルだけでは保証できないため、repository settingsで別途確認する。

### Report Publisher 環境（trusted `workflow_run` publisherで使用）

| シークレット | 用途 |
|---|---|
| `REPORT_PUBLISHER_HOSTING_PAGES_TOKEN` | 検査済みE2E / VRT reportとVRT baselineを`hosting-pages`へpushするtoken |

`Report Publisher`はdefault branch上の`publish-playwright-report.yml`と`publish-vrt-report.yml`だけで使用する。deployment branch policyはdefault branchだけを許可し、PR headを許可しない。publisherはPR codeを実行せず、source run、repository、open PR、exact head SHA、最新run、artifact名・個数・容量を再検証してからcredentialを有効にする。bootstrapは、Environment作成とdefault branch限定、`REPORT_PUBLISHER_HOSTING_PAGES_TOKEN`追加、repository-levelの旧`HOSTING_PAGES_TOKEN`削除の順で行う。専用secret未設定時はpublisherのpushを失敗させ、旧secretへfallbackさせない。

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

### デプロイ

| ワークフロー | トリガー | 処理 |
|---|---|---|
| `deploy.yml` | same-repository PR to develop、push to develop | PRでは専用Convex Preview → ビルド → CF branch `pr-{N}`へデプロイ → 公開URL Smoke。PR closeでは実行中のPreviewとFull Regressionを止めてCF / Convex Previewを削除。develop pushではmigrationを含むdevメインデプロイ |

PR Previewはartifact producer / `workflow_run` publisherへ分割せず、same-repositoryの`pull_request` workflowからCloudflareへ直接デプロイする。PR番号単位のconcurrency groupを使い、close cleanupは実行中のPreviewを停止してから削除する。credentialを使う前とPRコメントを書き込む前に、PRがopenでhead SHAが現在の値と一致することを確認する。

PRのissue commentを作成・更新するjobは、`issues: write`と`pull-requests: write`の両方をそのjobだけに付与する。テスト、ビルド、capture、report公開jobの`GITHUB_TOKEN`はread権限に限定し、publisherのcomment / PR-head status jobだけへ必要なwrite権限を付与する。

VRTとE2Eの結果は、一つの総合コメントへまとめず、それぞれ専用markerを持つ独立した固定コメントとしてpublisherから更新する。open PRのE2Eコメントはstatus、Passed / Failed / Flaky / Skipped、失敗テスト、全テスト、Actions、Cloudflare PR Preview、`yps-crispy-carnival-e2e/pr-{N}`のhosting-pages URL、実行した`preview/pr-{N}-e2e`を表示する。VRTコメントはChanged / New / Deleted / Passed、差分レポート、Actions、差分がある場合の`vrt-approval`導線を表示する。未公開または現在runとの一致を確認できていない状態では予定URLであることを明示し、公開成功後だけcache-busting queryを付ける。

Cloudflare公開後の`@deployed` Smokeは`deploy.yml`で実行し、認証付き`@release` Full Regressionは`playwright.yml`でPR headに対して専用Convex Preview `preview/pr-{N}-e2e`を作って実行する。producerは機密検査済みの固定入力artifact `playwright-public-input-{run_attempt}`と、raw reportを含む非公開`playwright-report-{run_attempt}` artifactをuploadする。publisherはcurrent source attemptと完全一致するartifactだけを採用し、raw artifactはActionsへ7日だけ保存する。

`publish-playwright-report.yml`はdefault branchの信頼済みcodeで固定入力artifactを再検査し、固定schemaのsanitized summaryだけを生成・検査してhosting-pagesへpushする。raw Playwright report、trace、動画、screenshot、console/error詳細、認証情報、storageStateは公開しない。`assertNoSensitiveArtifacts.mjs`は`.env`、source map、private key、access log、認証済みbrowser storage state、secret prefix / identifier、JWT、placeholder以外のemailも検査する。

### リリース (`release.yml`)

| ジョブ | トリガー | 処理 |
|---|---|---|
| `release` | PR merged to main w/ `release:*` ラベル | merge SHAとcanary承認済みtreeを照合 → package versionのtagをmerge SHAへ作成 → Convex prodデプロイ → ビルド → CF prodデプロイ → GitHub Release作成 |

release workflowは`main`へsource commitを追加しない。release PRにversion更新を含め、canary対象とmerge後のdeploy対象を同一content treeに保つ。

### テスト・品質チェック

| ワークフロー | トリガー | 内容 |
|---|---|---|
| `lint.yml` | 全push | Biome lint |
| `type-check.yml` | 全push | TypeScript型チェック |
| `test-logic.yml` | 全push | ロジックテスト（sharding 2分割） |
| `test-ui.yml` | PR / push | Storybook mockと決定的な公開dummy値で行うsecretless UIテスト（sharding 2分割） |
| `build.yml` | push to develop | credential付きビルド確認（Convex dev使用） |
| `playwright.yml` | same-repository PR to develop | exact PR headをcheckoutし、専用Convex Preview `preview/pr-{N}-e2e`で認証付きFull Regression E2E、結果gate、backend audit、機密検査済み固定入力artifact、非公開raw artifactを生成 |
| `publish-playwright-report.yml` | `Playwright Tests`の`workflow_run: completed` | default branchの信頼済みcodeでsource / artifactを再検証し、sanitized reportだけをhosting-pagesへ公開してE2E専用PRコメントを更新 |
| `provider-canary-approval.yml` | main向けPRのcanaryラベル付与 / 追加push | 構造化attestationを検証してhead SHA markerを記録し、不備時と追加push時に承認ラベルを削除 |
| `claude.yml` | `@claude`を含む作成済みissue/comment/review | secretなしjobでoriginal senderのlive repository permissionを検証し、write/maintain/adminだけをturn上限付きClaude jobへ渡す |
| `security.yml` | PR to develop/main、push to develop/main、週次 | Git履歴secret scan、`public`/`dist`漏洩scan、dependency review/audit、zizmor、trusted branch CodeQL |

### Storybook / VRT

| ワークフロー | トリガー | 内容 |
|---|---|---|
| `vrt.yml` | PR to develop/main、push to develop/main | secretlessでStorycap PNG生成と公開baseline比較を行い、固定artifactをupload |
| `publish-vrt-report.yml` | `VRT Artifact`の`workflow_run: in_progress / completed` | default branchの信頼済みcodeでsource / artifactを再検証し、PRではVRT report公開とコメント更新後、差分時だけ`vrt-approval`を待つ。pushではbaselineもhosting-pagesへ公開 |

VRT producerはPR / pushのsource treeでsecretlessにbuild・capture・compareし、公開済みbaselineも匿名cloneで読む。PR screenshot artifactは未信頼入力として扱い、publisherがsource workflowの固定path / ID、current head、latest run、artifact形式と機密情報不在を検査し、default branchのcodeでreportを生成してから公開する。差分reportと件数をPRコメントへ返した後だけ、publisherの`approve-pr-publication`（表示名`approve`）を`vrt-approval` Environmentで待ち、承認後に同じコメントを承認済みへ更新する。`workflow_run` job自体はdefault branch SHAに紐づくためrequired checkにはせず、publisherがexact PR head SHAへ書く固定commit status `shiftori/vrt-approval`をmerge gateにする。publisherはcurrent head / latest run以外のreport、status、コメントで上書きせず、hosting-pagesへの並行pushをretry付きrebaseで処理する。

`workflow_run` publisherは、そのworkflowファイルがdefault branchに存在するときだけproducerのrunから起動する。publisher導入PR自体はbootstrap対象のため、merge前のrunではreport公開、publisherコメント、`shiftori/vrt-approval` statusが動かない。default branchへの導入後に、PRの再実行または追加pushでproducerを再起動してstatus contextを一度作成し、その後branch protection / rulesetのrequired checkへ登録してstrictを有効化する。

## Security scan失敗と例外

`security.yml`は次をfail closedにする。

- TruffleHogのverified / unknown credentialまたはscan error
- 公開artifactのsecret、顧客email、`.env`、source map、認証済みstorage state
- 新規依存または全依存のHigh / Critical脆弱性
- high severity / high confidenceのGitHub Actions指摘
- trusted branchのCodeQL指摘

TruffleHogはPRでbase SHAからexact head SHAまでを検査し、push・週次・手動実行では`base` を空にしてexact `github.sha`から到達可能な全Git履歴を検査する。scanner自体とversionはcommit SHA / 固定versionへ束縛し、scan errorも成功扱いしない。

すべての外部GitHub Actionはmajor tagだけではなく40文字のcommit SHAへ固定する。更新時は公式repositoryのtagが指すSHAを照合し、zizmorのHigh / high-confidence finding 0件を確認する。

修正またはupgradeを優先し、workflow上の`continue-on-error`や包括的なignoreで迂回しない。修正できない指摘を一時受容する場合は、指摘ID、影響範囲、代替策、承認者、期限をaccess-controlledなissueに記録し、指摘ID単位の最小例外だけを別PRで追加する。

## デプロイ順序

Convex deploy → Convex migrations → ビルド → CloudFlare の順で実行する。
- Convex を先にデプロイすることで、スキーマ変更がビルド時に反映される
- `convex deploy` 直後に `npx convex run migrations/index:run` を実行し、データのバックフィルを完了させてからビルドに進む（develop / release のみ、preview は実行しない）
- マイグレーションは `@convex-dev/migrations` で冪等に管理されるため、変更のない PR でも毎回走る（完了済みはスキップされる）
- ビルド時に `VITE_CONVEX_URL` を環境変数として埋め込む

## 注意事項

- PR Full RegressionとCloudflare Previewが作るConvex PreviewはPR close時のcleanup対象とし、cleanup失敗時は自動失効で回収する
- Full Regression producerは専用Convex Preview `preview/pr-{N}-e2e`で実行し、trusted publisherがopen PRのE2E専用固定markerコメントへ結果、Actions、Cloudflare Preview、sanitized hosting-pages reportを返す
- `build.yml`はdevelop pushだけで実行する。`test-ui.yml`はConvex / ClerkのStorybook mockを使い、credentialを渡さない
- credential付きPR workflowはsame-repository PRだけに限定し、fork PRを対象にしない。PR headのworkflowとpackage scriptを実行するため、same-repositoryへpushできるactor自体を信頼境界に含める
- `GITHUB_TOKEN`のwrite権限はコメント / PR-head status jobだけに限定する。Cloudflare、Convex、Clerkのcredentialは必要なPR jobの`Preview` Environment Secrets、hosting-pages credentialはtrusted publisherの`Report Publisher` Environment Secretからだけ参照する
- PR close cleanupはsame-repository PRだけを対象にし、base SHAのcodeをcheckoutする。PR headのcode、shell、local action、package scriptをcleanup credentialと組み合わせない
