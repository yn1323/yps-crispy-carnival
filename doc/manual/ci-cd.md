# CI/CD運用

## この文書の範囲

この文書は、GitHub Actionsによる検証、プレビュー、リリースを人が確認するときの手順をまとめる。
実行条件、権限、環境変数、コマンドの現在値は `.github/workflows/` と `package.json` を正本とする。
この文書へsecretの値を記録しない。

## Pull Request

`develop` 向けPull Requestでは、ロジック、UI、Convex、型、lint、VRTなどの検証結果を確認する。
workflowの一覧と起動条件は `.github/workflows/` を確認する。

workflowの対象条件を満たす同一リポジトリからのPull Requestでは、`.github/workflows/deploy.yml` がConvex PreviewとCloudflare Pagesのプレビューを作成し、URLをPull Requestへ通知する。
Preview buildは、Preview GitHub Environmentに設定した`STRIPE_SECRET_KEY`、`STRIPE_STANDARD_PRICE_ID`、`STRIPE_PRO_PRICE_ID`を使い、ローカルと同じStripe Sandboxから販売条件を取得する。  二つのPrice IDは明示設定を必須とし、欠損、不正、重複時はbuildを失敗させる。  外部forkにはこのcredentialを渡さず、Previewを作成しない。
`pnpm build`はTanStack Startで公開HTMLとCSR shellを生成し、`dist/client/`だけをCloudflare Pagesへdeployする。
deploy後は`pnpm smoke-test:deployed`が実URLの代表公開route、末尾スラッシュ、CSR shell、Capability shell、404、代表ページのhydrationを確認する。
全公開route、静的metadata、sitemap、Cloudflare配信ルールの生成物は`pnpm build`が検証し、FAQやデモの状態操作はBehaviorまたは通常E2Eが検証する。
Pull Requestを閉じると、同workflowがプレビューの後処理を行う。

認証付きE2Eは `.github/workflows/playwright.yml` が専用Convex Previewで実行する。
外部forkにはリポジトリのcredentialを渡さないため、同じ条件では実行されない。

認証付きE2Eの必須gateは`pnpm e2e:ci`である。
このcommandは、実ブラウザ境界を持つ次の16契約だけを実行し、JSON resultから契約ID、project、初回成功、skipなしを検証する。

- `E2E-AUTH-01`：匿名利用者の保護route redirect。
- `E2E-AUTH-02`：専用actorのlogout後に、同じ保護routeへ再アクセスしたときのredirect。
- `E2E-SETUP-01`：`/dashboard`から1組織、1店舗、管理者本人、2か月のPro相当Trialを作る初期設定。
- `E2E-STAFF-01`：スタッフの追加、情報変更、再読み込み、組織からの削除。
- `E2E-SHIFT-01`：募集、匿名提出、確定、匿名閲覧の代表導線。
- `E2E-EXPORT-01`：保存済みシフトから別タブを開き、PDF・Excelをダウンロードし、再読み込み後も出力する。
- `E2E-EXPORT-02`：匿名で出力URLを開いたときのログイン誘導と復帰先の保持。
- `E2E-TENANT-01`：同じ管理者による2組織の切り替え。
- `E2E-MEMBERSHIP-01`：対象店舗へのスタッフ所属追加と解除、再読み込み、元店舗の所属維持。
- `E2E-SHOP-01`：既存組織への店舗追加、切り替え、店舗名と定休日の変更、再読み込み、追加店舗の削除、既存店舗への復帰。
- `E2E-ORGANIZATION-01`：2組織目の作成、改名、再読み込み、組織の往復切り替え。
- `E2E-ORGANIZATION-02`：組織の削除、残存組織の店舗への復帰、再読み込み、削除組織の不在確認。
- `E2E-MANAGER-01`：組織設定から管理者設定を開き、既存スタッフへの招待を発行し、再読み込み後も招待中であることを確認して取り消し、スタッフタブへ戻る。
- `E2E-MANAGER-02`：別のClerk actorによる招待受諾、管理者設定への到達、権限解除後のアクセス拒否、スタッフ所属の維持。
- `E2E-NAV-01`：組織scopeを保った新appのメインナビゲーションと現在地表示。
- `E2E-MOBILE-01`：Mobile Chromeでの代表提出。

通常実行はE2E用Clerk user 0から2を`parallelIndex`へ固定し、最大3 workerで動かす。
logoutと管理者招待受諾の別actor境界はuser 3から5を`parallelIndex`へ固定し、各反復で専用の新しいbrowser contextへ認証する。
desktop完了後にmobileを実行するため、異なるprojectが同じユーザーを同時に操作しない。

同じPull Requestの新しいrunが始まると、古いテストjobをcancelする。
R2の公開・削除は共通のconcurrencyで直列化し、実行中の変更をcancelしない。
cancel済みのテストrunからレポートを公開しない。

Playwright reportおよびJSON resultは、upload前にprivacy gateで検査する。
privacy gateがtoken、credential、非placeholder email、認証storage、検査不能なartifactを検出した場合は、reportを公開しない。
Playwright本体、result gate、privacy gate、R2への転送・公開確定の失敗はworkflowを失敗させる。
テストが失敗した場合も、レポート生成とprivacy検査が成功していれば結果を公開する。
公開確定後のHTTP到達確認とPRコメントの失敗はwarningとして分け、公開URLを確認できない場合はActionsのArtifactで結果を確認する。
PRコメントは同じレポート種別の既存Botコメントを削除してから新規投稿する。VRTコメントには対象runの承認画面へのリンクを付ける。

flake調査はretryを無効にした次のcommandで行う。

```bash
pnpm e2e:burn-in
```

このcommandはdesktop 15契約を各10回（計150回）実行した後、mobile 1契約を依存projectなしで10回実行する。
Playwrightのproject dependencyを含む一括`repeat-each`では依存側のdesktopが1回しか反復されないため、2段階を直列実行する。
各段階は次の段階が`test-results.json`とreportを上書きする前に、contract ID別の反復数、project、初回成功、skip、flakyを結果ゲートで確認し、artifact privacy検査を通す。
Full Regressionは認証付きE2Eだけで担わず、Logic、Frontend Unit、Behavior、VRT、Convex Function、Convex Scenario、Deployed Smokeへ分担する。

Playwright用Convex Previewでも、追加組織、店舗追加、管理者招待、課金を通常artifactと同じ常時公開の経路で検証する。  Previewの成功をProductionへのartifact反映済み証跡へ流用しない。
Playwright用Previewは`DEBUG_MODE=true`かつ`DEBUG_NOTIFICATION_DELIVERY_MODE=dry-run`とし、通知providerを呼ばない。
Debug設定の契約は[デバッグ環境変数の運用](debug-mode.md)を参照する。
`E2E-MANAGER-01`は招待の発行・再読込・取消というアプリ内状態を検証し、受取人による招待受諾を成功条件にしない。
`E2E-MANAGER-02`は予約済みの別Clerk actorが招待を受諾し、管理者権限を取得した後に権限を外され、管理画面へ戻れなくてもスタッフ所属が残ることを検証する。
招待capability、Clerk session、氏名、メールアドレスを扱うscenarioはtrace、screenshot、videoを無効にする。
メールproviderへの実配送は、どちらの管理者契約でも成功条件にしない。

VRTの差分とレポート公開は `.github/workflows/vrt.yml` が管理する。
差分承認の条件と承認環境はworkflowを確認し、レポートURLだけを根拠に成功扱いしない。
baseline取得、build、全capture、比較、R2への転送・公開確定の失敗はblockingのまま維持する。
PRではマージ先のbaselineと比較し、`develop`から`main`へのPRは`main`基準を使う。
基準画像はPRの承認時には更新せず、`develop`／`main`へのpushで正常に撮影できた全画像を使って更新する。
差分がある場合は既存の`vrt-approval`を待機させ、公開レポートまたはArtifactで差分を確認してから承認する。

Story間の通知はStorybook共通の開始・終了処理で破棄し、操作中に表示する通知はそのStory内で検証する。
非同期デコードを使うHero画像は、Storyのplayでデコード完了を待ってから撮影する。
撮影時はブラウザ本体とStoryのiframeを同じviewportに揃える。
全ページ撮影の末尾が重複する問題には、`@storycap-testrun/browser`のpnpm patchで実際のスクロール位置に応じた撮影範囲の補正を適用している。依存更新でpatchを外す際は、viewportを超える高さと端数のある高さで末尾・境界・透明領域を確認する。

## VRT・E2EレポートのR2運用

公開先はR2 Standardの一つのバケットとし、Public Development URL（`r2.dev`）を使う。
VRT・E2Eレポート、全基準画像のZIP、公開完了の管理情報はログインなしで取得できる。
カスタムドメイン、配信用Worker、読み取り専用キーは使用しない。
CIは確定済みの基準画像ZIPだけを匿名で取得し、checksum・件数・展開先を確認する。

| 対象 | 公開内容・削除 | 完全版Artifact |
|---|---|---|
| PRのVRT | 変更・追加・削除の確認に必要な画像とレポート。変化なし画像の一覧を省き、省略件数とArtifactへの案内を表示。close／mergeで削除 | 撮影した全画像と比較レポートを3日保持 |
| PRのE2E | 動画本体と動画参照を除いたレポート。close／mergeで削除 | privacy検査済みの完全版を30日保持 |
| branchのVRT | `develop`／`main`それぞれの最新レポートと基準画像ZIP | 撮影画像と比較レポートを3日保持 |

今回の移行ではE2Eの録画を新たに有効にしない。
生成された動画がある場合は完全版Artifactに残す。
公開レポートは世代ごとの`index.html`へリンクし、PRの再open後は新しいCIで作り直す。
PR終了時の削除はR2へ適用し、Artifactの保存期限は変更しない。

公開、接続確認、初期移行、削除は共通の`hosted-reports-r2-write`で直列化する。
`cancel-in-progress: false`と`queue: max`を使い、書き込み途中の自動cancelを防ぐ。
日次処理は全対象を同じjobで順に確認し、matrixを使わずに削除漏れと不要な世代を回収する。
現在のbaselineは保持し、参照を外れた時刻から24時間経過した旧ZIPを削除する。

### R2の設定と初回導入

R2の設定はrepositoryの **Settings → Secrets and variables → Actions** に登録する。
R2を変更するjobのGitHub Environmentは`Preview`を維持し、既存の環境保護を適用する。
Environment側に同名の古い値があるとrepository設定より優先されるため、設定不一致を調べるときは両方の登録先を確認する。

| 区分 | 名前 | 設定内容 |
|---|---|---|
| Repository secret | `REPORT_R2_ACCESS_KEY_ID` | 対象バケットのObject Read & WriteキーのAccess Key ID |
| Repository secret | `REPORT_R2_SECRET_ACCESS_KEY` | 同じキーのSecret Access Key |
| Repository variable | `REPORT_R2_ENDPOINT` | R2のS3 API endpoint。バケット名を末尾に付けない |
| Repository variable | `REPORT_R2_PUBLIC_BUCKET` | 公開用バケット名 |
| Repository variable | `REPORT_PUBLIC_BASE_URL` | 有効にした`https://pub-….r2.dev`。末尾スラッシュなし |

公開・削除helperは、レビューした固定commitへworkflowのcheckoutをpinする。
依存install、Artifactの展開・選別にはR2キーを渡さず、R2操作stepだけへ設定する。
helperを更新した場合は検証済みcommitへ参照を更新し、PRのheadを資格情報付きで実行しない。

1. helperと対象テストをcommit・pushし、その固定SHAをVRT・E2E・maintenanceのcheckoutへ指定する。
2. workflowの変更を同じ導入branchへpushし、PR作成前に`Maintain hosted report retention`をそのbranchで手動実行する。`operation`は`check`を選び、認証付き保存・確認・削除、公開URLの取得・削除後404、匿名更新の拒否を確認する。
3. `check`が成功した後、同じworkflowで`operation: bootstrap`を実行する。旧保存先のsnapshotを固定し、`develop`／`main`の元runと全capture成功を確認して既存baselineをR2へ移す。既に確定済みのR2 baselineは上書きしない。
4. baseline移行を確認してからPRを作成する。最新headのCIでVRT・E2Eの公開とArtifact保持を確認し、切替後にclose／merge削除と再openを確認する。
5. 導入後は日次処理を使い、必要時だけ同じworkflowの`operation: cleanup`を手動実行する。実環境の確認結果は[リリース状態](release-status.md)へ証跡付きで記録する。

初期移行だけは旧保存先を読む`REPORT_PUBLISHER_HOSTING_PAGES_TOKEN`を使う。
通常のレポート公開・削除に旧hosting先への書き込みは発生しない。
移行経路を撤去するときにシフトリ側の旧token登録を整理し、他用途と共有しているtoken自体は無条件に失効させない。

### 接続失敗時

R2設定の不足、認証・バケット権限、公開URLの不一致を検出した場合は、移行・公開作業を止めて設定者へ知らせる。
CIからsecretを自動変更したり、別のバケットへ切り替えたりしない。
`r2.dev`の429、一時的な5xx、通信timeoutによるbaseline取得は上限付きで再試行し、回復しなければVRTを失敗させる。
baselineの欠落・破損を空画像へ置き換えず、確認済みの旧baselineとArtifactを復旧元にする。

無料枠を目安にし、少額の超過を許容する。
利用量は公開jobの件数・byte数とR2管理画面で確認し、制限による失敗が続く場合にカスタムドメインへの変更を検討する。

## `develop` への反映

`develop` へのpushでは、`.github/workflows/deploy.yml` がDevelop環境のTanStack Start build、Convex deploy、migration、Cloudflare Pages deployを順に実行する。  buildはDevelopのConvex deploymentと同じSandbox用`STRIPE_SECRET_KEY`でStandard・Proの販売条件を取得し、失敗した場合はdeploymentを変更しない。
ビルド単体の確認は `.github/workflows/build.yml` も実行する。

失敗した場合は、失敗したjobとstepを特定し、同じcommit SHAに対する結果かを確認する。
環境のapproval待ち、secret不足、外部サービス障害と、コードの失敗を分けて扱う。

## Productionリリース

Productionリリースは、`main` 向けPull Requestをmergeしたときに `.github/workflows/release.yml` が判定する。
release label、version更新、ローカルrelease commit、TanStack Start build、Convex deploy、固定migration、Cloudflare Pages deploy、tagとpush、GitHub Releaseの順序はworkflowを正とする。  m041 LINE共通link migrationはrelease workflowへ含めず、事前検証と明示承認の後にConvex Dashboardから手動実行する。  release commitとtagはすべてのdeploymentが成功した後に同時にremoteへpushする。

buildがStripeの販売条件を取得または検証できない場合、release commitとtagをremoteへpushせず、ConvexとCloudflareも変更しない。  Convex deploy以降で失敗した場合、それ以前に完了したProduction変更は自動では戻らないが、`Tag and push`が始まるまではrelease commitとtagをremoteへ公開しない。

再実行前は、Productionとremote refの現在状態を確認する。

- `Tag and push`より前で失敗し、remoteの`main`とrelease元のlabelが変わっていない場合は、同じversionを再試行できる。  migration失敗時は完全修飾deploymentを指定して`lib:getStatus`の完了状態とcursorを確認し、series全体をresetしない。
- `Tag and push`で失敗した場合は、remoteの`main`と対象tagが両方更新済みか両方未更新かを確認する。  両方未更新で`main`も変わっていない場合だけworkflow全体を再実行する。
- `Create GitHub Release`で失敗した場合はdeploymentとrefが確定済みである。  workflow全体を再実行せず、既存tagからGitHub Releaseだけを復旧し、`Merge Main into Develop`を手動実行する。

merge前に次を確認する。

- 変更に対応する必須checkが成功している。
- 選択したrelease labelが意図するsemantic versioningの区分と一致する。
- Production環境のapprovalと必要なsecretが設定されている。
- Production Environment Variablesに、特定商取引法表記の`VITE_COMMERCIAL_TRANSACTIONS_NAME`、`VITE_COMMERCIAL_TRANSACTIONS_ADDRESS`、`VITE_COMMERCIAL_TRANSACTIONS_PHONE_NUMBER`が設定されている。所在地を改行する場合は値に`\n`を含める。
- Production Environmentに、ProductionのConvex deploymentと同じ`STRIPE_SECRET_KEY`、`STRIPE_STANDARD_PRICE_ID`、`STRIPE_PRO_PRICE_ID`がEnvironment Secretとして設定されている。二つのPrice IDは異なる値にする。
- schemaまたは保存済みデータ形式を変更した場合は、migration計画と復旧手順がある。
- m041が未完了の場合は、LINE共通化exportと全ページreadinessで、m041対象のcanonical counterpart欠損以外の異常が0件であることを手動実行の承認前に確認する。

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
- 認証済み画面のCSR shellはcanonicalな`/dashboard`、`/account`、`/actions`、`/manage*`、`/shifts*`、`/staff*`で返す。公開の`/shifts/submit*`、`/shifts/view`、`/shifts/reissue`、`/staff/register`も同じ安全なshell headerを維持する。
- `/app`は`/dashboard`へreplaceし、旧`/app/actions`、`/app/manage*`、`/app/shifts*`、`/app/staff*`は許可済みsearchだけを保って対応するcanonical routeへreplaceする。
- 削除した`/app/home`、`/app/account`、旧`/settings*`、`/users/*`、`/shops/*`、`/shiftboard/*`は互換redirectを返さず`404`になる。
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
