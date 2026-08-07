# CI/CD運用

## この文書の範囲

この文書は、GitHub Actionsによる検証、プレビュー、リリースを人が確認するときの手順をまとめる。
実行条件、権限、環境変数、コマンドの現在値は `.github/workflows/` と `package.json` を正本とする。
この文書へsecretの値を記録しない。

## Pull Request

`develop` 向けPull Requestでは、ロジック、UI、Convex、型、lint、VRTなどの検証結果を確認する。
workflowの一覧と起動条件は `.github/workflows/` を確認する。

workflowの対象条件を満たす同一リポジトリからのPull Requestでは、`.github/workflows/deploy.yml` がConvex PreviewとCloudflare Pagesのプレビューを作成し、URLをPull Requestへ通知する。
`pnpm build`はTanStack Startで公開HTMLとCSR shellを生成し、`dist/client/`だけをCloudflare Pagesへdeployする。
deploy後は`pnpm smoke-test:deployed`が実URLの代表公開route、末尾スラッシュ、CSR shell、Capability shell、404、代表ページのhydrationを確認する。
全公開route、静的metadata、sitemap、Cloudflare配信ルールの生成物は`pnpm build`が検証し、FAQやデモの状態操作はBehaviorまたは通常E2Eが検証する。
Pull Requestを閉じると、同workflowがプレビューの後処理を行う。

認証付きE2Eは `.github/workflows/playwright.yml` が専用Convex Previewで実行する。
外部forkにはリポジトリのcredentialを渡さないため、同じ条件では実行されない。

認証付きE2Eの必須gateは`pnpm e2e:ci`である。
このcommandは、実ブラウザ境界を持つ次の5契約だけを実行し、JSON resultから契約ID、project、初回成功、skipなしを検証する。

- `E2E-AUTH-01`：匿名利用者の保護route redirect。
- `E2E-SETUP-01`：認証済み管理者の初期設定。
- `E2E-SHIFT-01`：募集、匿名提出、確定、匿名閲覧の代表導線。
- `E2E-TENANT-01`：同じ管理者による2グループの切り替え。
- `E2E-MOBILE-01`：Mobile Chromeでの代表提出。

通常実行はE2E用Clerk user 0から2を`parallelIndex`へ固定し、最大3 workerで動かす。
desktop完了後にmobileを実行するため、異なるprojectが同じユーザーを同時に操作しない。

同じPull Requestの新旧runはworkflowの`concurrency`で直列化し、古いrunをcancelする。
cancel済みrunはreport upload、Pages公開、Pull Requestコメントを行わない。

Playwright reportと`test-results.json`は、公開前にprivacy gateで検査する。
privacy gateがtoken、credential、非placeholder email、認証storage、検査不能なartifactを検出した場合は、reportを公開しない。

flake調査はretryを無効にした次のcommandで行う。

```bash
pnpm e2e:burn-in
```

このcommandはdesktop 4契約を各10回実行した後、mobile 1契約を依存projectなしで10回実行する。
Playwrightのproject dependencyを含む一括`repeat-each`では依存側のdesktopが1回しか反復されないため、2段階を直列実行する。
各段階は次の段階が`test-results.json`とreportを上書きする前に、contract ID別の反復数、project、初回成功、skip、flakyを結果ゲートで確認し、artifact privacy検査を通す。
Full Regressionは認証付きE2Eだけで担わず、Logic、Frontend Unit、Behavior、VRT、Convex Function、Convex Scenario、Deployed Smokeへ分担する。

VRTの差分とレポート公開は `.github/workflows/vrt.yml` が管理する。
差分承認の条件と承認環境はworkflowを確認し、レポートURLだけを根拠に成功扱いしない。

## `develop` への反映

`develop` へのpushでは、`.github/workflows/deploy.yml` がDevelop環境のConvex deploy、migration、TanStack Start build、Cloudflare Pages deployを順に実行する。
ビルド単体の確認は `.github/workflows/build.yml` も実行する。

失敗した場合は、失敗したjobとstepを特定し、同じcommit SHAに対する結果かを確認する。
環境のapproval待ち、secret不足、外部サービス障害と、コードの失敗を分けて扱う。

## Productionリリース

Productionリリースは、`main` 向けPull Requestをmergeしたときに `.github/workflows/release.yml` が判定する。
release label、version更新、tag、Convex deploy、migration、TanStack Start build、Cloudflare Pages deploy、GitHub Releaseの順序はworkflowを正とする。

merge前に次を確認する。

- 変更に対応する必須checkが成功している。
- 選択したrelease labelが意図するsemantic versioningの区分と一致する。
- Production環境のapprovalと必要なsecretが設定されている。
- schemaまたは保存済みデータ形式を変更した場合は、migration計画と復旧手順がある。

リリース後は、GitHub Release、production deployment、migration結果、主要導線を確認する。

`Release to Production` が成功すると、`Merge Main into Develop` が `main` と `develop` の履歴・treeを比較する。
`main` がまだ `develop` に含まれていない場合、`develop` を起点に `main` を逆マージした1コミットを専用ブランチへpushし、`develop` 向けPull Requestを作成または更新する。
このPRにはリリースversionの更新だけでなく、`main` に先行して入ったhotfixなどの変更も含める。
同期workflowを手動で再実行する場合も、同じ履歴・tree比較と既存Pull Requestの更新を行う。
この処理には、通常のPull Request検証を起動できる権限を持つrepository secret `RELEASE_SYNC_TOKEN` が必要である。

## 旧308 cacheからの移行確認

公開URLは、ルート以外を末尾スラッシュなしで正規化する。
新しい静的artifactは、既知の公開URLについて末尾スラッシュの有無を問わず`200`を返す。
端末に旧no-slashからslashへの308が残っていても、移動先のslash URLが`200`を返すためredirect loopは終端する。

Pull RequestのPreviewでは、まず自動テストで次を確認する。

- 公開URLのslashあり・なしが`200`で、`Location`を返さない。
- canonicalは両方とも本番originのno-slash URLである。
- 認証routeとCapability routeは`no-store`、`noindex`、`no-referrer`のCSR shellを返す。
- 未知URLと未知の記事slugは`404`である。
- `/cache-reset`は`Clear-Site-Data: "cache"`だけを返し、cookieとstorageを消さない。

旧308を実際に保持した端末で確認する場合は、同じCloudflare Pages branch aliasと同じChrome profileを使う。
旧deploymentで308を保存した後にaliasを新deploymentへ更新し、profileを閉じずにno-slash URLを開く。
slash URLの`200`で表示できることを確認してから`/cache-reset`を開き、再びno-slash URLがnetworkから`200`で取得されることを確認する。
commitごとに変わるhash URLではoriginが変わるため、このcache移行確認の代わりにはならない。

公開artifactのrollbackはCloudflare Pagesのdeployment履歴から行う。
ただし、rollback先がslash URLで3xxを返す場合は旧308とのloopを再発させるため、そのdeploymentへ戻さない。
その場合は、公開slash URLを`200`で終端する`_redirects`を維持したforward fixを優先する。

## 依存更新のsupply-chainポリシー

pnpm 11は`minimumReleaseAge`の既定値が1440分であり、公開から24時間以内のversionを含むlockfileは`pnpm i --frozen-lockfile`で拒否される。
このため依存更新branchのCIが `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` で失敗することがある。

対応は、公開から24時間経過後にjobを再実行することである。
`pnpm-workspace.yaml`の`minimumReleaseAgeExclude`へ個別versionを追加して通さない。
このlistは恒久的な除外であり、待てば解消する失敗の回避策にすると、検査対象から外れたversionが残り続ける。

## 失敗時の確認順

1. Pull Requestまたはcommitの最新SHAに対するjobか確認する。
2. 最初に失敗したstepとログを確認する。
3. 再現コマンドが `package.json` にある場合は、対象範囲を絞ってローカルで実行する。
4. Preview、Develop、Productionのどのenvironmentを使ったか確認する。
5. migration、deploy、report公開のような外部状態を伴う処理は、再実行前に現在状態を確認する。
6. workflowの修正が必要な場合は `.github/AGENTS.md` の安全制約に従う。

## 参照先

- `.github/workflows/`：workflowの実行条件、権限、job、step
- `.github/actions/`：共有setup Action
- `package.json`：ローカル検証コマンド
- `doc/rules/testing-strategy.md`：テスト層の責務
- `.github/AGENTS.md`：CI/CD変更時の常設制約
