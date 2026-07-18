# E2E Full Regression計画

## この文書の位置づけ

この文書は、本番リリース前に実行するE2E Full Regressionの到達点と、機能ごとの不足を管理する計画書である。

「実装済み」は、2026年7月18日時点の作業ツリーにテストまたは設定が存在することを表す。

「実装済み」は、CIでリリースゲートとして接続済みであることや、外部サービスへの実到着まで確認済みであることを意味しない。

## 目的

- シフトリの主要機能が、実ブラウザ、実フロントエンド、実Convex Previewを通して完了できることを確認する。
- 管理者操作からスタッフ操作、通知受付、再アクセス、復旧までのつながりを、本番リリース前の判定材料にする。
- 各機能をLogic、UI、Convex Function、Convex Scenario、E2E、VRT、手動確認、provider canaryへ割り当て、未検証領域を明示する。
- 通知目的ごとに、通知outbox、channel、対象、token、CTA、不達回復の検証状況を追跡する。
- 境界値の総当たりをE2Eへ集めず、最も速く安定するテスト層へ配置する。

## 非目的

- 通常E2Eから実利用者のメールアドレスやLINEアカウントへ通知しない。
- Resend、LINE、Slack、Clerkの外部サービス内部の動作を、通常E2Eだけで保証しない。
- すべての入力validation、認可分岐、DB状態の組み合わせをE2Eで総当たりしない。
- ピクセル単位の見た目差分をE2E assertionで保証しない。
- 本人だけが使う`apps/analytics-dashboard/`の内部BIを自動テストまたはFull Regressionの対象にしない。
- Stripe Checkout、Customer Portal、Webhook、支払い成功または失敗、プラン変更、請求書、課金通知を現行リリースのE2Eゲートへ含めない。
- `billingManager`が課金を操作する導線は対象外とする。
- 複数管理者、複数グループ、グループ削除、複数店舗は課金機能から分離し、`MM-P0-01`から`04`、`MG-P0-01`、`OD-P0-01`から`02`、`MS-P0-01`から`03`、`REG-P0-01`から`03`の13契約を現行リリースのE2Eゲートへ含める。
- E2E seedが作る固定entitlementは複数管理者と複数店舗を利用するための前提データであり、課金機能の検証結果として扱わない。

## テストスイートの定義

### PR Smoke

**PR Smoke**は、develop向けPRのFull Regressionに含めて実行する最小の結合確認である。

対象は、認証、公開ページ、募集作成、提出、下書き保存、確定、スタッフ閲覧、ログアウト後の保護ページ再アクセスに絞る。

Desktop Chromeを必須とし、スタッフ向け代表導線はMobile Chromeでも確認する。

目標実行時間は15分以内とする。

実行コマンドは`pnpm e2e:smoke`である。

現状は`@smoke`タグとコマンドが存在するが、`.github/workflows/playwright.yml`では`pnpm e2e:release`の部分集合として実行する。

### Full Regression

**Full Regression**は、本番リリース候補に対して実行する機能横断の回帰テストである。

`@release`に加え、`@notification`、`@security`、`@mobile`、`@a11y`を必須の部分集合として扱う。

Desktop ChromeとMobile Chromeを実行し、通知配送はdry-runで抑止する。

複数管理者、複数グループ、グループ削除の6シナリオは`multi-actor-chromium` projectで実行する。

user index 0〜2をpool 0、3〜5をpool 1として各poolを1 workerへ固定する。各worker内では認証済みactor A、B、Cを独立したbrowser contextで使用し、シナリオを直列実行する。

通常のDesktop ChromeとMobile Chromeは合計6 workerで実行する。通常projectの`@notification`テストは、6 worker時に通知probeのConvex CLI呼び出しが重なる実測を踏まえて、150秒をタイムアウト上限とする。性能はこの上限ではなくJSON reportのwall spanで判定する。

`setup`、`multi-actor-chromium`、通常projectのdependencyを維持し、通常projectは2 workerのmulti-actor projectが完了した後に実行する。DesktopとMobileは同時実行できるが、Playwrightのworker slotごとの`parallelIndex`で同じユーザーの重複利用を避ける。

実行コマンドは`pnpm e2e:release`である。

目標実行時間は60分以内とする。

現状はタグ、コマンド、ブラウザproject、通知dry-run preflightが存在する。

E2E seedは、`organizations`、`organizationPeople`、`organizationMembers`、店舗所属、固定entitlementを含むcanonical organization graphを作る。

resetはownerが管理する対象organization graphを回収し、複数actorの前回状態を次の実行へ持ち越さない。

develop向けPRで専用Convex Previewを作り、Full Regressionを実行する。

developからmainへのPRと`.github/workflows/release.yml`ではE2E自体を実行せず、`Playwright Tests`成功checkも要求しない。

E2E専用Convex Previewは数日で自動失効するため、cleanup workflowは設けない。

Full Regressionは、`E2E_TESTING_ENABLED=true`かつ`E2E_TESTING_DEPLOYMENT_URL=CONVEX_CLOUD_URL`のdeployment bindingが成立する非本番Convexだけへ接続する。URL不一致ならhelper自身が拒否する。

developへ取り込む前の専用Convex PreviewでFull Regressionを完了し、main向けPRではその確認を重複させない。

Previewにはrun単位の`ORGANIZATION_INVITATION_SIGNING_SECRET`を設定し、管理者招待tokenを実利用環境から分離する。

### Provider Canary

**Provider Canary**は、隔離したテスト用メールアドレスとLINEアカウントへ最小限の実配送を行う確認である。

#### Security Lens

- Actor: PRコードを実行する未信頼workflowと、provider canaryを確認するwrite以上の承認者。
- Asset: 本番リリースのprovider canary承認、PRラベル、bot検証済みmarker。
- Trust boundary: PR由来コードはread-only `GITHUB_TOKEN`で実行し、write権限はcheckoutとartifact内容の実行を行わないdefault branch workflowに限定する。
- Abuse case: PRがテスト実行中のwrite tokenを使い、canaryラベルまたはbot markerを偽造してrelease gateを迂回する。
- Server-side check: 信頼済み`pull_request_target`が承認者権限、exact head SHA、時刻、環境、証跡、全PASSを検証し、release workflowがbot markerと最終head SHAを再照合する。
- Rate limit / idempotency: 同一SHAの検証コメントは監査可能な証跡として扱い、追加pushでラベルを失効させる。
- Logs / PII: 証跡URLはGitHub上のアクセス制御済みリソースに限定し、個人情報、token、Webhook URLを記録しない。
- Regression test: workflow YAML、github-script構文、read-only権限、trusted workflowのcheckout不在、attestationの正常/異常fixtureを静的検証する。

通常E2Eの代わりではなく、ResendやLINEがリクエストを受理し、専用受信先で確認できることを補完する。

対象は募集通知、確定通知、問い合わせメールとSlack通知の代表ケースに限定する。

本番利用者の連絡先を使用せず、送信回数、対象環境、実行者、受信結果を記録する。

provider canaryはRC作成時または手動承認後に実行し、通常PRでは実行しない。

自動送信workflowは作らず、隔離受信先で手動実行した証跡として`release:provider-canary-passed`をRC PRへ付与する。

`release.yml`はこのラベルがない本番リリースを停止する。

本番と同じprovider設定を持つ隔離canary環境で、次の通知を手動確認する。

1. 募集通知をテストスタッフのメールとLINEへ1件ずつ送り、本文と提出CTAを確認する。
2. 確定通知を同じ受信先へ1件ずつ送り、本文と閲覧CTAを確認する。
3. テストLINEアカウントから通常メッセージを送り、定型replyを確認する。
4. 本番利用者が対象に含まれず、同じ目的の通知が重複していないことを確認する。

問い合わせは同じRCで、隔離した送信元と受信先を使って次を手動確認する。

1. `/contact`で必須項目とプライバシー同意を入力し、production Turnstileを完了する。
2. 送信後に受付完了画面へ遷移する。
3. 専用Resend受信先へ本文が届き、reply-toが入力したメールアドレスである。
4. 専用Slack channelへ同じrequest IDの通知が1件だけ届く。
5. Convexログに配送失敗がなく、本文、Turnstile token、Webhook URLが記録されていない。
6. ResendとSlackで同じrequest IDを記録する。

全項目の確認者、時刻、環境URL、個人情報を含まないGitHub上の証跡URL、受信結果を、`.github/AGENTS.md`の構造化attestation形式でRC PRへ残した後だけ`release:provider-canary-passed`を付ける。

ラベル付与時は、checkoutを行わない信頼済み`pull_request_target` workflowが、確認者のwrite以上の権限、exact head SHA、24時間以内の確認、環境、証跡、全PASS項目を検証する。検証後のhead SHAはbot markerとしてPRコメントへ自動記録し、不備時と追加push時はラベルを削除する。release時も検証済みmarkerと最終head SHAの一致を必須にする。

## リリースゲート

| ID | リリース条件 | 現状 | 判定 | 優先度 |
|---|---|---|---|---|
| G01 | develop向けPRで`@smoke`を必須実行する | Full Regressionの部分集合として実行する | 実装済み | P1 |
| G02 | develop向けPR専用Previewで`@release`を完了する | workflowは存在するが、2026-07-13確認時点でactive rulesetにPlaywright required checkがない | 一部実装 | P0 |
| G03 | skipped testを0件にする | JSON結果ゲートでskipを失敗させる | 実装済み | P0 |
| G04 | retryで成功したflaky testも失敗扱いにする | `failOnFlakyTests`とJSON結果ゲートを実装済み | 実装済み | P0 |
| G05 | `E2E_TESTING_ENABLED=true`を確認する | Previewのpreflightを実装済み | 実装済み | P0 |
| G06 | `NOTIFICATION_DELIVERY_MODE=dry-run`を確認する | Previewのpreflightを実装済み | 実装済み | P0 |
| G07 | PRごとにConvex Previewと実行concurrencyを分離する | PR番号を使うPreview名とconcurrencyを実装し、Previewの削除は自動失効に任せる | 実装済み | P0 |
| G08 | 主要通知のoutbox、channel、対象、CTAを確認する | 募集、催促、確定、再発行、手動再送、manager digestはemail/LINE双方でchannel排他、dedupe一意性、token/CTA整合を確認 | 実装済み | P0 |
| G09 | 全E2E管理者の店舗で、想定外のopen FailureInboxとactive dedupe重複が0件である | 同一runでは次のseedによるreset前に店舗単位で異常を検出する。終了時は設定された全管理者の一致・店舗所属を件数で検証してから現存店舗をbackend auditする。前回失敗runの状態だけはPlaywright setupでE2E管理者単位にforce cleanupし、共有devの他データは削除しない | 実装済み | P0 |
| G10 | Mobile Chromeの代表スタッフ導線を成功させる | 提出1本を実装済み | 一部実装 | P1 |
| G11 | 主要ページのaxe検査を成功させる | 3画面を実装し、既知の色コントラスト違反はnode完全一致で固定している | 一部実装 | P1 |
| G12 | CloudflareへデプロイしたURLでSmokeを成功させる | develop向けPreviewとDevelopのdeploy workflowへ接続済み。本番release workflowではE2Eを実行しない | 実装済み | P0 |
| G13 | provider canaryを必要なRCで成功させる | 手動手順と必須PRラベルによるrelease gateを実装済み。各RCで実行が必要 | 実装済み | P0 |
| G14 | Playwright HTML、JSON、trace、動画を保存する | PR workflowで実装済み | 実装済み | P1 |
| G15 | 今回追加するP0機能のトレーサビリティに未分類行を残さない | 複数管理者、複数グループ、グループ削除、複数店舗、既存影響機能の13契約を`MM`、`MG`、`OD`、`MS`、`REG`として分類し、test titleと結果ゲートへ接続した | 実装済み | P0 |
| G16 | P0通知目的をE2Eまたは安全な外部境界contract testへ分類する | N01-N21、N24、N27はE2E。N22は代表UIと目的別再通知contract、N23はoutbox Action/Scenario、N25はWebhook Functionで確認する。Playwright workflowにはE2E以外のテスト層を混在させない | 実装済み | P0 |
| G17 | develop統合後またはRCのexact SHAでFull Regressionを完了する | develop向けPRのhead SHAだけを実行し、統合後SHAとRC SHAは未実行 | 未実装 | P0 |
| G18 | production buildを対象に認証済み主要導線を確認する | 通常E2EはVite dev server、deployed Smokeは公開ページだけ | 未実装 | P0 |
| G19 | browser runtime errorと同一origin 5xxを失敗にする | 共通fixtureはClerk token設定だけで、pageerror、console.error、5xxを監視しない | 未実装 | P0 |
| G20 | 今回追加した13件の必須契約IDでFull Regressionの欠落を検知する | 必須scenario fileに加え、13件のP0契約IDがPlaywright JSONのtest titleに存在することを検査する。`REG-P0-03`はemail、LINE、複数管理者の3 specを個別に固定する | 実装済み | P0 |

必須project、scenario file、P0契約ID、最終失敗、non-passing expected status、skip、flaky、許可外project、6 user indexと2 actor poolの完全利用、通知dry-run、全E2E管理者のbackend audit、FailureInbox、active dedupe、デプロイ済みURLを確認する自動ゲートが存在する。

ただし、契約IDの存在は各assertionの妥当性まで保証しない。

統合後SHA、production build、runtime errorも検査していないため、現状を本番リリースのFull Regressionゲートとは扱わない。

自動Full Regression成功だけでは本番リリースを許可しない。

RCごとのprovider canary完了と`release:provider-canary-passed`付与を最終条件とする。

develop向けPreview／Developのdeployed Smokeはデプロイ後の検知であり、develop向けPRのFull Regressionを代替しない。

## 2026年7月18日の実行契約

6ユーザー対応後の結果ゲートは、最低合計77件を次のproject内訳で要求する。

- `setup`：6件。
- `multi-actor-chromium`：6件。
- `desktop-chromium`：64件。
- `mobile-chrome`：1件。

必須32 suite、13件のP0契約、15件のsuite/project/spec bindingを維持する。

通常projectの各テストは数値annotation `e2e-user-index`を持ち、結果ゲートは0から5までの完全利用を確認する。

multi-actor projectの各テストは数値annotation `e2e-actor-pool`を持ち、結果ゲートはpool 0と1の完全利用を確認する。

結果ゲートは各projectと全体について、最初のtest開始時刻から最後のtest終了時刻までのwall spanを出力する。テストdurationの合計は並列実行時間として扱わない。

#### 6ユーザー実行のSecurity Lens

- Actor: Preview環境でFull Regressionを実行するGitHub Actionsと、同じE2E設定を使うローカル開発者。
- Asset: 6ユーザー共通password、Clerk sessionを含むstorageState、ユーザーごとに分離したE2Eデータ。
- Trust boundary: GitHub Environmentまたはローカル環境変数からPlaywright workerへ認証情報を渡し、E2E専用Previewへ接続する境界。
- Abuse case: 複数workerが同じユーザーを同時利用して互いのseedを削除すること、認証情報をログへ含めること、通常projectとmulti-actor projectが同じsessionを同時利用すること。
- Server-side check: 既存のE2E Preview binding、`E2E_TESTING_ENABLED`、通知dry-run preflight、全6管理者のbackend auditを維持し、新しいpublic APIは追加しない。
- Lifecycle / recovery: storageStateはrunごとに再生成し、setup時のowner単位force resetと各multi-actorシナリオ終了時のpool単位resetで前回失敗runを回収する。
- Logs / PII: workflowは各emailとpasswordをmaskし、passwordを入力する認証setupと通常suiteのtraceを無効化する。Playwrightの`webServer.env`へ`process.env`を設定せず、JSON reportへcredentialを直列化しない。割当reportには数値のuser indexとactor poolだけを残し、artifact upload前のfail-closed gateでpassword、user identifier、secret、tokenの混入を検査する。その他の通常シナリオの認証済みtrace・動画はtokenを含み得るため、検査を通過した非公開artifactへ7日だけ保存し、storageStateファイル自体は含めない。
- Remaining operation: workflowはPreview Environment Secretを優先し、既存Variableを移行互換としてmaskして利用する。Secretへ移行後はVariable fallbackを削除する。
- Incident follow-up: 旧`webServer.env`設定で生成された有効なPlaywright artifactを削除し、少なくともE2E共通password、Clerk開発用secret、Convex deploy keyをローテーションする。外部artifactの削除とcredential更新は、リポジトリ差分とは別の権限付き運用として実施する。
- Regression test: 6ユーザーの一意性、2 poolの非重複、範囲外poolのfail-closedをLogic UTで保証し、結果ゲートで全user indexと両poolの実利用を確認する。

### 6ユーザー化後の暫定実測

2026年7月18日、6ユーザー、2 actor pool、6 worker構成の作業ツリーで`@release` 77件がすべて成功した。skip 0件、flaky 0件で、結果ゲートは必須32 suite、13件のP0契約、15件のbinding、全6 user index、両actor poolを確認した。

全体wall spanは450.0秒（7.5分）だった。project別は`setup` 28.0秒、`multi-actor-chromium` 111.1秒、`desktop-chromium` 309.8秒、`mobile-chrome` 6.7秒である。DesktopとMobileは重なるため、project別wall spanを合算して全体時間として扱わない。

6ユーザー化前の10.2分との単純比較では約26%短縮した。テスト総数は72件から77件へ増えているため、同一件数だけの速度比較ではない。また、setupとmulti-actorは通常projectより前に実行するため、ユーザー数を倍にしても全体時間は半分にならない。

この値はローカル作業ツリーでの1回の実測であり、同一commit・同一CI条件の3回中央値ではない。新しい性能基準やG17のexact SHA証跡には使用しない。

### 6ユーザー化前の過去実績

2026年7月18日、6ユーザー化前の作業ツリーに対する`pnpm e2e:release`は72件すべて成功した。

内訳は`setup` 3件、`multi-actor-chromium` 5件、`desktop-chromium` 63件、`mobile-chrome` 1件で、skip 0件、flaky 0件、所要時間10.2分だった。

`pnpm e2e:assert-release-results test-results.json`も成功し、必須30 suite、11件のP0契約、13件のsuite/project/spec bindingを確認した。

この72件には、現在の6本目のmulti-actorシナリオであるグループ削除フローが含まれていない。

この実績は6ユーザー、2 pool、6 worker構成の性能基準または、develop統合後・RCのexact SHAに対するG17の完了証跡として扱わない。

6ユーザー対応後は同じcommitとCI条件で3回実行し、全体とproject別wall spanの中央値を新しい基準値として記録する。

## 機能とテスト層のトレーサビリティ

表中の記号は次の意味を持つ。

- `✅`：現行リポジトリまたは今回の作業差分に対象テストがある。
- `△`：代表ケースだけを確認している、または一部経路だけを確認している。
- `□`：必要だが未実装である。
- `—`：その層では扱わない。

| 機能 | Logic | UI | Convex Function | Scenario | E2E | VRT | 手動 | Provider | 現在の不足 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 認証、redirect、logout | ✅ | ✅ | △ | — | ✅ | △ | △ | △ | Clerkメール確認と別端末本人確認はFull Regression未接続 |
| 初回セットアップ、店舗設定 | ✅ | ✅ | ✅ | ✅ | ✅ | △ | — | — | 文字数上限と大量データは下位層中心 |
| 複数管理者の招待、共同管理、権限解除、グループ削除 | △ | ✅ | ✅ | ✅ | ✅ | △ | — | □ | 3 actorの主要導線と権限境界はFull Regressionで成功。provider実到着は未確認 |
| Free管理者交代、複数グループ切替 | ✅ | ✅ | ✅ | ✅ | ✅ | △ | — | — | 送信前確認、連携前後の権限、前任者のスタッフ所属と別グループ管理権限、2グループ間の非混入を確認済み。同名データと緊急復旧は対象外 |
| 複数店舗の追加、切り替え、編集、データ分離 | △ | ✅ | ✅ | ✅ | ✅ | △ | — | — | 代表2店舗の主要導線は実装済み。店舗数上限と並行操作は下位層の担当 |
| Dashboardオンボーディング | ✅ | ✅ | ✅ | △ | ✅ | ✅ | — | — | 1/4以外の進捗永続化をE2Eで未確認 |
| Dashboard一覧、グルーピング、お知らせ | ✅ | ✅ | ✅ | △ | △ | ✅ | — | — | お知らせと全グループのE2Eが不足 |
| スタッフ情報タブ、編集、削除 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | 下書き後・確定後追加は確認済み。email変更時の旧linkと削除後の履歴表示が未達 |
| シフト対象外と復帰 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | 復帰時は手動再送する現行仕様を明示する必要がある |
| スタッフ参加申請、承認、却下 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | 承認後のLINE案内email、open募集outbox、submit CTAまで確認済み |
| 募集作成、一覧、削除 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | 募集期間62日の実ブラウザ容量ケースは未実装 |
| 希望提出、再提出、締切後提出 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | 時間指定、日付のみ、勤務区分は再提出まで一気通貫で確認済み。31件上限とtoken全状態は下位層のみ |
| ShiftForm編集、下書き、reload | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | 3方式すべて管理者編集とreload後の永続化を確認済み。200スタッフ、2000割当の容量E2Eは未実装 |
| シフト確定、変更通知、閲覧 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | □ | email/LINEの初回・変更再通知・再発行と非変更者除外を確認。実到着はcanary未達 |
| 法務同意、利用規約、プライバシー | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | △ | — | 無効、期限切れ、文書版だけ更新のE2Eが不足 |
| 通知outbox、retry、fallback | ✅ | △ | ✅ | ✅ | ✅ | ✅ | △ | □ | Quota fallbackはglobal状態を変えるためAction/Scenarioに配置。実到着はcanary |
| 通知不達Dashboard、個別、一斉再通知 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | □ | provider webhook由来の復旧をE2Eで未確認 |
| LINE連携、follow、unfollow、Webhook | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | △ | □ | followは本番共通mutationで法務・募集を確認。署名HTTP、OAuth、実到着は下位層/canary |
| 公開ページ、ヘルプ、記事、CTA | ✅ | ✅ | — | — | ✅ | ✅ | — | — | デプロイ済みSmokeは接続済みだが、自動rollbackは未実装 |
| 問い合わせ | ✅ | ✅ | ✅ | — | ✅ | △ | △ | □ | 公開route smokeは自動、実フォーム送信とprovider実到着はRC手動canary |
| 要望送信、分析一覧 | ✅ | ✅ | ✅ | ✅ | ✅ | △ | — | — | スタッフ提出画面からの要望E2Eが未実装 |
| 店舗削除と残存店舗への復旧 | △ | ✅ | ✅ | ✅ | ✅ | △ | — | — | 選択中店舗の削除、旧URLの汎用エラー、残存店舗への復旧をE2Eで確認する。最後の店舗と同時削除は下位層の担当 |
| 課金、Stripe、課金操作を行う`billingManager` | △ | △ | ✅ | △ | — | △ | — | — | 課金機能自体は今回のFull Regression対象外。複数管理者と複数店舗の固定entitlementとは分離する |

この表は「機能名にテストがあるか」だけを示す表ではない。

スタッフ追加のように後続画面と通知へ影響する機能は、操作、状態遷移、通知、再アクセスを同じシナリオIDで追跡する。

## 今回の作業差分で追加または強化したE2E

次の行は、2026年7月18日時点の作業ツリーに存在する。

未マージのため、既存ブランチや本番環境に反映済みとは限らない。

表の「現在確認する範囲」は実装されたassertionの契約を示し、今回のFull Regression全件成功を示さない。

| ID | シナリオ | ファイル | 現在確認する範囲 | 現在確認しない範囲 |
|---|---|---|---|---|
| CORE-01 | 時間指定方式の初回提出、再提出、管理者編集、下書き、reload、確定、スタッフ閲覧 | `e2e/scenarios/first-shift-delivery.test.ts` | 募集/確定email outbox、匿名submit/view token、再提出の追加・取り消しを管理画面と確定後閲覧で確認、ShiftForm時間編集と永続化 | LINE実到着、容量上限 |
| CORE-02 | 日付のみ方式の提出、再提出、管理者編集、確定、閲覧 | `e2e/scenarios/date-only-shift-full-flow.test.ts` | 募集email outboxとsubmit token、日付割当、下書き永続化、確定email outboxとview token | LINE実到着、容量上限 |
| CORE-03 | 勤務区分方式の提出、再提出、管理者編集、確定、閲覧 | `e2e/scenarios/shop-settings-submission-pattern-flow.test.ts` | 定休日、再提出と管理者編集の勤務区分置換、下書き永続化、募集/確定email outboxとtoken | LINE実到着、4区分上限 |
| NOTIFY-01 | 募集開始通知から提出、再提出、ShiftForm反映 | `e2e/scenarios/notification-submit-flow.test.ts` | email/LINE outbox、submit token、CTA | provider実到着 |
| NOTIFY-02 | 自動催促から提出、未提出表示解消 | `e2e/scenarios/notification-reminder-flow.test.ts` | email/LINE outbox、submit token、CTA | provider実到着 |
| NOTIFY-03 | 確定通知、変更再通知、使用済みlink、再発行、再閲覧 | `e2e/scenarios/notification-confirmation-view-flow.test.ts` | email/LINE outbox、isResend、view/reissue token、CTA | provider実到着 |
| NOTIFY-04 | open募集へのスタッフ追加 | `e2e/scenarios/open-recruitment-added-staff-notification.test.ts` | 法務email、LINE案内email、募集email、提出CTA | provider実到着 |
| NOTIFY-05 | LINE follow後の法務・open募集通知 | `e2e/scenarios/open-recruitment-added-staff-notification.test.ts` | 本番共通follow mutation、法務/募集LINE outbox、legal/submit token | 実Webhook署名、実LINE到着 |
| NOTIFY-06 | LINE連携URL発行と案内再送 | `e2e/scenarios/line-link-token-flow.test.ts`、`e2e/scenarios/notification-release-matrix.test.ts` | 管理者UIからtoken発行、手動案内email outbox | OAuth完了、provider実到着 |
| NOTIFY-07 | 初期設定、email変更、現在/募集手動再送、unfollow振分、manager digest | `e2e/scenarios/notification-release-matrix.test.ts` | email/LINE outbox、channel排他、対象、token、4種のmanager通知 | 実cron時刻、provider実到着 |
| RECOVERY-01 | 不達通知の個別再通知と一斉再通知 | `e2e/scenarios/notification-failure-recovery.test.ts` | Dashboard、outbox、FailureInbox状態 | Resend webhookからの実発生 |
| STAFF-01 | 下書き後追加、対象外、古いlink失効、復帰、個別再送 | `e2e/scenarios/staff-shift-target-impact.test.ts` | 既存draft保持、新規行、追加時3通知、session境界、新token | 自動復帰通知は現行仕様に存在しない |
| STAFF-02 | 確定後追加、割当、変更者限定再通知、閲覧 | `e2e/scenarios/staff-after-confirmed-shift.test.ts` | 既存割当保持、open募集通知なし、新規スタッフだけisResend、view CTA | provider実到着 |
| AUTH-01 | logout後の保護ページ再アクセス | `e2e/scenarios/release-support-auth-onboarding.test.ts` | Clerk logoutとAuthGuard redirect | Clerk管理画面内部 |
| ONBOARD-01 | オンボーディング終了状態のreload永続化 | `e2e/scenarios/release-support-auth-onboarding.test.ts` | 1/4の手動終了とDB反映 | 2/4から4/4の全遷移 |
| REQUEST-01 | 管理ユーザーの要望送信 | `e2e/scenarios/release-support-feature-request.test.ts` | Dialog、mutation、成功Toast | 本人用内部BIへの表示はFull Regression対象外 |
| CONTACT-01 | 公開問い合わせ | `e2e/scenarios/release-support-public-contact.test.ts` | 問い合わせページのroute smoke | 実フォーム送信、production challenge、provider実到着はRC手動canary |
| PUBLIC-01 | 公開10ルートと主要CTA | `e2e/scenarios/release-support-public-contact.test.ts` | 管理者/スタッフ向け法務ページを含むローカルrouteとCTA | Cloudflare配信状態 |
| DEPLOY-01 | デプロイ済み公開URL Smoke | `e2e/scenarios/deployed-smoke.test.ts` | develop向けPreview／DevelopでHTTP成功とTOP、機能、FAQ、ヘルプ、問い合わせ固有h1 | 本番releaseでは実行しない |
| MOBILE-01 | Mobile Chromeの希望提出 | `e2e/scenarios/release-support-staff-submit.mobile.test.ts` | 日付のみ提出の完了 | 閲覧、法務同意、登録、時間指定、勤務区分 |
| A11Y-01 | axeによる主要画面検査 | `e2e/scenarios/release-support-accessibility.test.ts` | TOP、Dashboard、スタッフ提出、既知違反node完全一致 | 既知の`color-contrast`違反そのものは未解消 |
| MM-P0-01 | 管理者招待と共同管理 | `e2e/scenarios/multiActor/manager-invitation-collaboration.test.ts` | AがBを招待し、Cの本人不一致で招待を消費せず、Bが連携後に全店舗を切り替えてB店を共同管理する | 招待取消、期限境界、provider実到着 |
| MM-P0-02 | 管理者権限だけの解除 | `e2e/scenarios/multiActor/manager-role-removal.test.ts` | AがBの管理者権限を外し、Bの主グループ管理画面を失効させ、A店のスタッフ所属を維持する | 最後の管理者、並行解除 |
| MM-P0-03 | グループからの人物削除 | `e2e/scenarios/multiActor/organization-person-removal.test.ts` | AがBを主グループから削除し、主グループへの再アクセスを拒否し、Bの別グループ所属を維持する | 将来シフトなど削除を妨げる全制約の組み合わせ |
| MM-P0-04 | Free管理者交代 | `e2e/scenarios/multiActor/free-manager-exchange.test.ts` | Aが送信前の影響を確認して既存スタッフBへ交代案内を送り、連携前はA、連携後はBだけが対象グループを管理する。Aのスタッフ所属と別グループ権限は維持する | 緊急復旧、外部後任、前任者への完了通知、provider実到着 |
| MG-P0-01 | 複数グループ切替と非混入 | `e2e/scenarios/multiActor/multiple-organization-switching.test.ts` | 同じAが無関係な2グループをDashboardとグループ設定で往復し、URL、reload、表示、店舗名更新を選択グループだけへ反映する | 同名グループ・店舗、複数tab、Mobile E2E |
| MS-P0-01 | 店舗追加、切り替え、編集 | `e2e/scenarios/organization-shop-lifecycle.test.ts` | B店の追加と編集をreload後も維持し、A店設定へ混入させない | 店舗数上限、並行追加、request ID境界 |
| MS-P0-02 | グループ内の他店舗スタッフ再利用 | `e2e/scenarios/open-recruitment-added-staff-notification.test.ts` | A店スタッフをB店へ追加し、A店所属を維持したままB店の募集通知CTAから希望を提出する | 人物documentと通知対象集合のDB完全一致 |
| MS-P0-03 | 選択中店舗の削除と復旧 | `e2e/scenarios/shop-deletion-flow.test.ts` | B店削除後にA店へ復旧し、B店専属スタッフを「店舗所属なし」で利用人数へ含め続け、旧URLでは汎用エラーを表示する | 最後の店舗、同時削除、cleanup詳細 |
| REG-P0-01 | B店でのシフト主導線 | `e2e/scenarios/shop-settings-submission-pattern-flow.test.ts` | B店で初回提出、再提出、管理者編集、下書きreload、確定通知、別context閲覧まで完了し、A店へ混入させない | 容量上限、provider実到着 |
| REG-P0-02 | B店でのスタッフ登録申請 | `e2e/scenarios/staff-registration-review.test.ts` | B店の登録linkから申請し、A店へ要対応表示を出さず、B店だけで承認してB店の通知CTAへ進む | 重複メールなど既存の負系分岐の再網羅 |
| REG-P0-03 | canonical organization上の管理者通知 | `e2e/scenarios/notification-release-matrix.test.ts`、`e2e/scenarios/multiActor/manager-invitation-collaboration.test.ts` | 4種digestの代表channelと、複数管理者A/Bへの代表digestおよびB店CTAを確認する | 実cron時刻、provider実到着。4種digestの対象完全一致はScenario Testの担当 |

## 境界値の配置

境界値は、値そのものの許否をLogicまたはConvex Functionで確認し、業務結果が変わる代表値だけをScenarioまたはE2Eへ上げる。

| 境界 | 定義 | LogicまたはFunction | ScenarioまたはE2E | 現在の不足 |
|---|---|---|---|---|
| スタッフ一括追加 | 50件まで | 50件受理、51件拒否 | 代表追加と一覧反映 | 50件追加のブラウザ容量確認なし |
| 募集期間 | 62日まで | 62日受理、63日拒否 | 代表期間の作成、削除 | 62日表示とShiftForm容量確認なし |
| 勤務区分 | 4件まで | 4件受理、5件拒否 | 代表2区分の提出と反映 | 4区分のE2Eなし |
| 1提出の希望枠 | 31件まで | 31件受理、32件拒否、拒否後も既存31件を保持 | 複数日の提出と再提出 | 31件のブラウザ容量確認なし |
| ShiftBoardスタッフ | queryが200人で打ち切る | hard validationなし | 通常人数の編集、確定 | 201人目が静かに欠落するため仕様決定が必要 |
| 希望枠と割当 | queryが各2000件で打ち切る | hard validationなし | 通常件数のScenario | silent truncationの仕様決定と境界テストが必要 |
| open募集通知 | queryが50募集で打ち切る | 50件境界テスト未確認 | 1募集への追加通知 | 51件目の扱いの仕様決定が必要 |
| 承認待ち申請 | queryが20件で打ち切る | 20件境界テスト未確認 | 代表申請の承認、却下 | 21件目の表示/digest仕様が未決定 |
| manager通知対象 | 各queryが20人で打ち切る | 20件境界テスト未確認 | 代表manager A/Bと4種digestの対象変化 | 20件と21件の境界、切り捨て時の仕様決定が必要 |
| 氏名と店舗名 | 80文字まで | 80文字受理、81文字拒否 | 代表入力 | 長文表示はVRT中心でE2Eなし |
| メールアドレス | 254文字まで | 254文字受理、超過拒否 | 代表入力と通知対象 | 変更時の旧link失効仕様が未決定 |
| 要望 | 200文字まで | 200文字受理、201文字拒否 | 管理者から代表送信 | スタッフからのE2Eなし |
| 問い合わせ本文 | 2000文字、HTTP body 16KiB | 2000文字はschema testあり。16KiB境界テストは未確認 | 代表入力の実HTTP受付 | 16KiB直前/超過のFunction Testなし |
| Magic Link | 標準24時間 | 期限直前、期限後、使用済み、用途違い | 使用済みview linkと再発行 | submit側の期限切れE2E不足 |
| スタッフsession | 14日 | 期限、失効、対象外、削除 | 対象外時の失効 | 期限境界のE2Eなし |
| LINE連携token | 72時間 | 期限、再発行、失効 | token発行 | OAuthと期限切れ画面のE2Eなし |
| 法務同意token | 30日 | 期限、使用済み、version | 代表同意 | 期限切れと文書版だけ更新のE2Eなし |
| 日付と締切 | JST暦日の直前、当日、直後 | タイムゾーンと比較境界 | 締切後初回提出と再アクセス | 締切直前と当日の実ブラウザ確認不足 |
| outbox retry | 実装上最大5attempt | retry/fallbackの代表testはあるが、4/5/6境界は未確認 | 不達から手動再通知 | attempt境界、processing lease回復、長時間backlogが未達 |
| 二重操作 | 同一request、dedupeKey、短時間連打 | 冪等性とrate limit | 確定や通知の代表操作 | 全Submit系ボタンの二重操作E2Eなし |

## 通知目的別の検証状況

この表の「E2E実装済み」は、実配送ではなく、UIまたは実triggerからoutboxとtokenを確認できることを表す。

Resend、LINE、Slackの実到着は通常自動スイートでは扱わず、RCの手動provider canaryと必須ラベルで判定する。

| ID | 通知目的 | Trigger | Channel | E2E | 他のテスト層 | 判定と不足 |
|---|---|---|---|---|---|---|
| N01 | 初回セットアップ後の管理者LINE連携案内 | 店舗セットアップ | email | 実装済み | Setup、LINE Function | provider canary未達 |
| N02 | 手入力スタッフの法務同意依頼 | スタッフ追加 | email | 実装済み | Legal Function、staffManagement Scenario | provider canary未達 |
| N03 | 手入力スタッフのLINE連携案内 | スタッフ追加 | email | 実装済み | LINE Function、staffManagement Scenario | provider canary未達 |
| N04 | 登録申請承認後のLINE連携案内 | 申請承認 | email | 実装済み | staffRegistration Scenario | provider canary未達 |
| N05 | 登録申請承認後のopen募集案内 | 申請承認 | email | 実装済み | staffRegistration Scenario | LINE未連携者のsubmit CTAまで確認、provider未達 |
| N06 | 募集開始通知 | 募集作成 | emailまたはLINE | 両channel実装済み | notificationDelivery Scenario | provider未達 |
| N07 | 未提出者への自動催促 | 自動催促時刻 | emailまたはLINE | 両channel実装済み | notificationDelivery Scenario、Function | 実scheduled時刻とprovider未達 |
| N08 | 初回シフト確定通知 | シフト確定 | emailまたはLINE | 両channel実装済み | shiftBoardConfirmation、notificationDelivery Scenario | provider未達 |
| N09 | 確定後の変更者のみ再通知 | 確定済みシフト変更 | emailまたはLINE | 両channel実装済み | shiftBoard Function、Scenario | 複数スタッフの非変更者除外もSTAFF-02で確認、provider未達 |
| N10 | 閲覧link再発行 | 使用済みまたは無効view link | emailまたはLINE | 両channel実装済み | shiftViewReissue Scenario | provider未達 |
| N11 | open募集へのスタッフ追加通知 | 募集中のスタッフ追加 | email | 実装済み | staffManagement Scenario | 下書き保存後追加と既存draft保持まで確認 |
| N12 | メール変更後のopen募集追送 | スタッフemail変更 | email | 実装済み | staffManagement Scenario | 新tokenは確認済みだが旧link失効仕様が未達 |
| N13 | LINE連携またはfollow後のopen募集追送 | 連携完了またはfollow | LINE | 実装済み | lineNotification Scenario | 実Webhookと実到着が未達 |
| N14 | スタッフ詳細からopen募集を個別再送 | 管理者の手動操作 | emailまたはLINE | 両channel実装済み | notificationDelivery Scenario | provider未達 |
| N15 | スタッフ詳細から現在シフトを個別再送 | 管理者の手動操作 | emailまたはLINE | 両channel実装済み | notificationDelivery Scenario | view token発行まで確認、provider未達 |
| N16 | LINE連携案内の手動再送 | 管理者の手動操作 | email | 実装済み | LINE Function、FailureInbox Function | UI、outbox、新tokenを確認、provider未達 |
| N17 | 未同意スタッフへのLINE法務案内 | LINE連携またはfollow | LINE | 実装済み | legal、lineNotification Scenario | 本番共通follow mutationから法務CTAを確認。実Webhook署名と実到着は下位層/canary |
| N18 | スタッフ登録申請の日次digest | 日次cron | emailまたはLINE | 両channelと複数管理者A/Bの代表契約を実装済み | notificationDelivery、staffManagerInvitation Scenario、Function | 実cron時刻とprovider実到着は対象外 |
| N19 | 締切翌日のシフト確定催促 | scheduled action | emailまたはLINE | 両channel実装済み | shiftConfirmationReminder Function | 実scheduled時刻とprovider実到着は対象外 |
| N20 | 店舗登録7日後の本番募集催促 | scheduled action | emailまたはLINE | 両channel実装済み | shopActivationReminder Function | 実scheduled時刻とprovider実到着は対象外 |
| N21 | 通知不達の日次digest | 日次cron | emailまたはLINE | 両channel実装済み | failureReminder Function | 実cron時刻とprovider実到着は対象外 |
| N22 | 不達通知の個別、一斉再通知 | Dashboard操作 | 元通知に応じる | 募集emailの個別/一斉を実装 | 目的別分類、募集/催促/LINE案内再通知、provider webhookをFunction/Scenarioで確認 | 確定・再発行はFailureDashboardではなく、手動現在シフト通知とlink再発行E2Eを復旧導線とする |
| N23 | LINE Quota超過fallback | outbox worker | LINEからemail | E2E対象外 | outbox Action、Scenario | global Quotaを変えるためCI必須のConvex testへ配置 |
| N24 | LINE unfollow時のemail振り分け | 通知trigger | email | 実装済み | lineNotification Scenario、Function | 手動募集でemail選択を確認、実Webhook未達 |
| N25 | LINE通常メッセージへの定型reply | LINE Webhook | LINE reply | E2E対象外 | Webhook、署名Function | contractはCI必須Convex test、実replyはprovider canary |
| N26 | 問い合わせ受付 | 公開フォーム | emailとSlack | route smokeのみ | contact HTTP Action Function | 実フォーム送信とprovider到着はRC手動canary |
| N27 | 管理者本人へのスタッフ通知 | 募集、催促、確定 | emailまたはLINE | canonical organization seed上で両channel実装済み | notification Scenario | provider実到着のみ未確認 |

N17は本番Webhookと共通の`markFollowing`までE2Eで確認する。

N23はglobal Quota状態を並列E2Eから変更しないためoutbox Action/Scenario、N25は署名付きHTTP/Webhook Functionで保証し、実provider経路は隔離canaryへ分離する。

N23、N24は目的ではなくchannel選択条件、N22は復旧lifecycle、N27はrecipient属性である。

最終的な網羅判定は、この一覧だけでなく「目的/trigger × email・LINE/follow・unfollow・quota × manager-staff・通常staff × accepted・fallback・final failure・retry・provider」の直交表で行う。

## 既知の未達と優先順位

### P0

1. Playwright、VRT、Logic、frontend-unit、UI、Convex、lint、type-check、buildを同一SHAのrequired checkにする。
2. develop統合後またはRC exact SHAでFull Regressionを再実行する。
3. E2Eをproduction build後のpreviewへ接続し、`pageerror`、allowlist外`console.error`、同一origin 5xxを失敗にする。
4. VRT baseline欠落と未承認差分を失敗にする。
5. `CORE`、`AUTH`、`NOTIFY`など既存P0にも安定した契約IDとsuite/project/spec bindingを追加する。
6. 各RCで隔離provider canaryを実行し、証跡を残して`release:provider-canary-passed`を付ける。
7. スタッフemail変更時に、旧メールへ送付済みのlinkを失効させるかを決定し、E2Eへ追加する。
8. シフト対象外スタッフが募集、催促、確定通知の全triggerから除外されることをE2Eへ拡張する。
9. develop向けPreview／Developのdeployed Smoke失敗時の通知と停止判断を決定する。
10. 200スタッフ、2000件、50募集、20申請のsilent truncationを仕様化し、境界テストを追加する。

### P1

1. Mobile Chromeで確定閲覧、法務同意、スタッフ登録を追加する。
2. 200スタッフ、2000割当、50件追加、62日募集の容量ジョブをFull Regressionとは別の`@capacity`として追加する。
3. TOP、Dashboard、スタッフ提出画面の既知の`color-contrast`違反を修正し、axe除外を削除する。
4. スタッフ提出画面からの要望送信と、保存された要望が管理用queryの対象になることをE2EとScenarioで確認する。
5. 法務文書の文書版だけ更新、同意要求版更新、期限切れ、用途違いを代表E2Eへ追加する。
6. PR workflowを`@smoke`中心へ分離し、Full Regressionの実行時間と責務を分ける。

### P2

1. Dashboardお知らせの公開期間、sanitize、最新1件表示をE2Eへ追加する。
2. 課金、Stripe、課金操作を行う`billingManager`をE2E対象へ追加する場合は、複数管理者と複数店舗とは別のP0トレーサビリティ行を作る。

## 実装順序

1. required check、exact SHA、production build、runtime error、VRT baselineのゲートを成立させる。
2. canonical organization seed、owner単位reset、multi-actor project、13件のP0契約IDゲートを維持する。
3. 今回の作業差分を安定させ、`@smoke`と`@release`の実行結果を基準値として保存する。
4. P0通知不足を目的別かつchannel別に追加する。
5. スタッフ追加、email変更、対象外復帰の仕様を確定し、状態遷移E2Eを追加する。
6. Mobile Chrome、容量、法務、アクセシビリティの不足を解消する。
7. provider canaryを隔離環境で実行し、RCの承認ラベルへ証跡を残す。
8. 各リリースでこのトレーサビリティ表を更新し、未分類の新機能を残さない。

## 参考ファイル

- `doc/INDEX.md`
- `doc/rules/testing-strategy.md`
- `doc/rules/security-strategy.md`
- `doc/plans/2026-07-13-frontend-test-vrt-refactor.md`
- `doc/plans/2026-07-18_複数管理者_複数店舗_E2E実装計画.md`
- `doc/plans/2026-07-18_Free管理者交代_複数グループ_追加実装計画.md`
- `e2e/AGENTS.md`
- `playwright.config.ts`
- `playwright.deployed.config.ts`
- `package.json`
- `scripts/assertPlaywrightReleaseResults.mjs`
- `scripts/assertPlaywrightReleaseResults.test.ts`
- `scripts/assertPlaywrightArtifactSafety.mjs`
- `scripts/assertPlaywrightArtifactSafety.test.ts`
- `scripts/playwrightConfigSecurity.test.ts`
- `scripts/e2eUsers.test.ts`
- `.github/actions/playwright/action.yml`
- `.github/workflows/playwright.yml`
- `.github/workflows/pr-report-comments.yml`
- `.github/workflows/provider-canary-approval.yml`
- `.github/workflows/deploy.yml`
- `.github/workflows/release.yml`
- `e2e/helpers/notificationProbe.ts`
- `e2e/helpers/notificationTokens.ts`
- `e2e/helpers/managerInvitationProbe.ts`
- `e2e/helpers/convex.ts`
- `e2e/helpers/e2eUsers.ts`
- `e2e/helpers/scenarioSeeds.ts`
- `e2e/helpers/accessibility.ts`
- `e2e/fixtures/e2eTest.ts`
- `e2e/fixtures/multiActorTest.ts`
- `e2e/pages/OrganizationSettingsPage.ts`
- `e2e/pages/ManagerInvitationPage.ts`
- `e2e/scenarios/first-shift-delivery.test.ts`
- `e2e/scenarios/date-only-shift-full-flow.test.ts`
- `e2e/scenarios/shop-settings-submission-pattern-flow.test.ts`
- `e2e/scenarios/notification-submit-flow.test.ts`
- `e2e/scenarios/notification-reminder-flow.test.ts`
- `e2e/scenarios/notification-confirmation-view-flow.test.ts`
- `e2e/scenarios/notification-release-matrix.test.ts`
- `e2e/scenarios/open-recruitment-added-staff-notification.test.ts`
- `e2e/scenarios/notification-failure-recovery.test.ts`
- `e2e/scenarios/staff-shift-target-impact.test.ts`
- `e2e/scenarios/release-support-auth-onboarding.test.ts`
- `e2e/scenarios/release-support-public-contact.test.ts`
- `e2e/scenarios/release-support-feature-request.test.ts`
- `e2e/scenarios/release-support-staff-submit.mobile.test.ts`
- `e2e/scenarios/release-support-accessibility.test.ts`
- `e2e/scenarios/deployed-smoke.test.ts`
- `e2e/scenarios/organization-shop-lifecycle.test.ts`
- `e2e/scenarios/shop-deletion-flow.test.ts`
- `e2e/scenarios/multiActor/manager-invitation-collaboration.test.ts`
- `e2e/scenarios/multiActor/manager-role-removal.test.ts`
- `e2e/scenarios/multiActor/organization-person-removal.test.ts`
- `convex/constants.ts`
- `convex/testing.ts`
- `convex/notification/actions.ts`
- `convex/notification/reminderActions.ts`
- `convex/notificationOutbox/`
- `convex/_scenario/notificationDelivery.test.ts`
- `convex/_scenario/staffManagement.test.ts`
- `convex/_scenario/staffRegistration.test.ts`
- `convex/_scenario/lineNotification.test.ts`
- `convex/_scenario/staffManagerInvitation.test.ts`
- `doc/features/auth-pages.md`
- `doc/features/dashboard-onboarding.md`
- `doc/features/shop-settings.md`
- `doc/features/shift-recruitment-management.md`
- `doc/features/shift-submission.md`
- `doc/features/shift-exclusion.md`
- `doc/features/staff-registration.md`
- `doc/features/legal-consent.md`
- `doc/features/line-notification.md`
- `doc/features/notification-outbox.md`
- `doc/features/notification-failure-dashboard.md`
- `doc/features/shift-confirmation-reminder.md`
- `doc/features/shop-activation-reminder.md`
- `doc/features/contact.md`
- `doc/features/feature-requests.md`
- `doc/features/public-pages.md`
