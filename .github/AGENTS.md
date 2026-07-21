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
- `dev-yps-crispy-carnival` — 開発DB（永続） + develop merge後のFull Regression用preview（数日で自動消滅）

### Clerk

1アプリ・2モード:
- 本番環境 → Clerk本番キー（Production環境シークレット）
- 開発/プレビュー環境 → Clerk開発キー（Preview環境シークレット）

## GitHub Environments

シークレットはGitHub Environmentsで環境別に管理する。同じキー名で環境ごとに異なる値を設定。

### Preview 環境（trusted publisher、develop Full Regressionで使用）

| シークレット | 用途 |
|---|---|
| `CONVEX_DEPLOY_KEY` | dev Convexプロジェクトのデプロイキー |
| `CONVEX_MANAGEMENT_TOKEN` | `cleanup-pr-preview.yml`が旧形式のConvex previewを削除する移行用Management APIトークン |
| `VITE_CONVEX_URL` | dev Convexの永続URL |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk開発用Publishableキー |
| `VITE_TURNSTILE_SITE_KEY` | 問い合わせフォームのCloudflare Turnstile Site Key |
| `CLERK_SECRET_KEY` | Clerk開発用シークレットキー |
| `CLOUDFLARE_API_TOKEN` | CloudFlare APIトークン |
| `CLOUDFLARE_ACCOUNT_ID` | CloudFlareアカウントID |
| `HOSTING_PAGES_TOKEN` | trusted VRT publisherが`hosting-pages`へreportをpushするtoken |
| `REG_SUIT_CLIENT_ID` | trusted VRT publisherのRegSuit notify client ID |
| `VITE_GTM_ID` | Google Tag Manager ID |

PR headをcheckoutするjobはPreview Environmentを指定せず、secretを一切参照しない。静的PR previewのbuildに必要なbrowser公開値は、同名のRepository Variables（`VITE_CONVEX_URL`、`VITE_CLERK_PUBLISHABLE_KEY`、`VITE_TURNSTILE_SITE_KEY`、`VITE_GTM_ID`）として設定する。これらは成果物へ埋め込まれる公開値だけに限定する。

Preview Environmentのdeployment branchはdefault branchの`develop`だけに制限し、可能ならrequired reviewerを設定する。`vrt-approval` Environmentにはrequired reviewerを設定し、公開用secretは置かない。producerは差分があるPRのmerge gate、trusted VRT publisherは全PRの公開実行で、それぞれ独立したEnvironment承認を必須にする。publisherは承認後にPreview Environmentの公開ジョブを実行する。これらのGitHub上の設定はworkflowファイルだけでは保証できないため、repository settingsで別途確認する。

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
| `pr-preview.yml` | PR to develop (open/sync) | PR headをsecretlessでビルド・prerenderし、`dist` data artifactを保存 |
| `publish-pr-preview.yml` | `PR Preview Artifact`完了 | default branchのtrusted codeでsource metadataとartifactを検査し、Cloudflareへ静的dataだけを公開してPRへコメント |
| `cleanup-pr-preview.yml` | PR to develop (close) | `pull_request_target`のbase SHAにあるtrusted codeでCF previewと旧Convex previewを削除 |
| `deploy.yml` | push to develop | Convex devデプロイ → migration → ビルド → CF devメインデプロイ → 公開URL Smoke |

trusted publisherはsource workflow名・event・conclusion・same-repository・PR current head SHA・artifact名/個数/宣言sizeを検証する。download後はdefault branchの`assertStaticArtifactSafety.mjs`でregular file、path、拡張子、実size、symlink、Pages control fileをfail closedで検査し、artifact内のscriptを実行しない。Cloudflare credentialの直前でPRがopenかつ同じhead SHAであることとartifact setを再検証する。publisherとclose cleanupはPR番号単位の同じconcurrency groupを使い、close時は実行中のpublisherを停止してから削除する。

`assertNoSensitiveArtifacts.mjs`はさらに`.env`、source map、private key、access log、認証済みbrowser storage state、secret prefix / identifier、JWT、placeholder以外のemailを検査する。PR producerの検査だけを信頼せず、credentialを持つconsumerでtrusted copyのscannerを再実行する。

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
| `playwright.yml` | push to develop | merge済みdevelop commitだけをcheckoutし、一時Convex PreviewでFull Regression E2E、結果gate、backend audit、非公開artifact保存 |
| `provider-canary-approval.yml` | main向けPRのcanaryラベル付与 / 追加push | 構造化attestationを検証してhead SHA markerを記録し、不備時と追加push時に承認ラベルを削除 |
| `claude.yml` | `@claude`を含む作成済みissue/comment/review | secretなしjobでoriginal senderのlive repository permissionを検証し、write/maintain/adminだけをturn上限付きClaude jobへ渡す |
| `security.yml` | PR to develop/main、push to develop/main、週次 | Git履歴secret scan、`public`/`dist`漏洩scan、dependency review/audit、zizmor、trusted branch CodeQL |

### Storybook / VRT (`vrt.yml`)

| ワークフロー | トリガー | 内容 |
|---|---|---|
| `vrt.yml` | PR to develop/main、push to develop/main | secretlessでStorycap PNGを生成し、公開baselineを匿名readしてRegSuit比較。artifactはPNG dataだけを保存 |
| `publish-vrt-report.yml` | `VRT Artifact`完了 | default branchのtrusted codeでsource metadataと4 PNG artifactを検査し、PRは`vrt-approval`承認後だけtrusted RegSuitでreportを再生成してhosting-pagesへ公開。push時だけbaseline更新 |

secretless producerは`hosting-pages`を匿名readし、差分があるPRでは`approve` jobをbranch protectionのmerge gateとして使う。trusted publisherはsource runをPRまたはpushへ分類した結果だけを使い、producerの`approve`が存在・成功したことを公開承認として信用しない。producer側で承認jobが削除またはskipされても、publisher側の独立した`approve-pr-publication`なしには公開できない。承認後はPR番号単位でpublisherを直列化し、credentialを使う直前とreportをpushする直前にlive PRまたはbranchのcurrent head SHAを再検証する。repositoryをprivate化した場合はbaseline取得がfail closedで停止するため、public readを維持するか、credentialなしで取得できる別のbaseline storeへ移行する。

`vrt-approval`の承認対象は、検査済みPNGからtrusted codeでreportを生成して公開する実行そのものであり、生成後のvisual diffを人がレビューした証跡ではない。このためPRコメントは差分を「approved」と表記しない。生成済みtrusted reportを見て差分単位で承認する契約が必要になった場合は、trusted compare jobのreport artifactと差分outputを承認jobへ渡し、その後のpublish jobだけを許可する三段構成へ変更する。

差分があるPRではproducerのmerge gateとpublisherの公開実行で二回のEnvironment承認が発生する。前者はrequired checkを止めるため、後者はcredential付き公開をproducerから独立させるために必要であり、同じ承認証跡としてまとめない。branch protectionではproducerのcheck名、Environment履歴では両workflow runの承認者と時刻を確認する。

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

- `playwright.yml`がdevelop merge後に作るE2E専用Convex Previewは数日で自動消滅するため、明示的な削除は不要
- `build.yml`はcredentialを渡せるdevelop pushだけで実行する。`test-ui.yml`はConvex / ClerkのStorybook mockを使い、PRにcredentialを渡さない
- E2E Full Regressionはdevelop merge後に実施する。PR headへ共有Clerk/Convex credentialを渡して実行しない
- E2E専用Convex Previewは自動失効に任せ、cleanup workflowを作らない
- PR static previewはdevelop Convexを参照するため、未mergeのConvex変更はpreviewへ反映されない。backend変更はFunction/Scenario Testとmerge後Full Regressionで検証する
- PRのコードをcheckoutして実行するjobの`GITHUB_TOKEN`はread-onlyにし、secret、write token、secret-backed local actionを渡さない
- credentialを持つ`workflow_run` consumerはdefault branch SHAをcheckoutし、source runとcurrent PR headを照合する。PR artifactは許可済みdataとして検査するまでcredential stepへ進めず、artifact内のcode、HTML、shell、package scriptを直接実行しない
