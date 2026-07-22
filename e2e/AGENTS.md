# E2E テスト規約

## 目的

既存テスト層（convex-test / Vitest / Storybook+Chromatic）がカバーできない **「繋がり」の検証**。
画面遷移・認証・フロント⇔Convex結合・ハッピーパスが壊れていないことを保証する。
same-repositoryのopen PRでは、PR headに対する認証付きFull Regressionと、Cloudflare PR Previewの公開5route Smokeを実行し、それぞれの結果を対象PRへ返す。

### テストしないこと

- 外部サービスの動作（Resend、Clerkの認証画面）
- 例外フロー・エラーハンドリング（ユニットテストの責務）
- ピクセルパーフェクトなUI（Storybook+Chromaticの責務）
- LINE/メールの外部実到着（outbox受付・channel・CTA・不達回復は検証する）
- 全validation・DB状態の組合せ総当たり

## ディレクトリ構造

```
e2e/
├── pages/                                # POM（画面操作クラス）
│   ├── DashboardPage.ts                  #   セットアップ、スタッフ追加、募集作成
│   ├── ShiftBoardPage.ts                 #   シフト編集、保存、送信
│   └── StaffViewPage.ts                  #   マジックリンク閲覧、リンク再発行
├── scenarios/                            # テストファイル（ユーザーストーリー名で命名）
│   └── first-shift-delivery.test.ts
├── fixtures/
│   └── auth.setup.ts                     # Clerk認証セットアップ
├── .clerk/                               # 認証状態（storageState）
└── .tmp/                                 # テスト実行時の一時ファイル
```

## テスト設計

### Suiteタグ

- `@smoke`: PR Full Regressionに含める最小主導線
- `@release`: same-repositoryのdevelop向けPR headで実行するFull Regression
- `@notification`: 通知目的ごとのoutbox・channel・CTA
- `@security`: 保護ページ、失効token、対象外、削除済み、代表IDOR
- `@mobile`: スタッフ向け代表モバイル導線
- `@a11y`: axeによる主要ページ検査
- `@deployed`: Cloudflareへデプロイ済みPR Preview／Develop URLの公開route Smoke

`@notification` / `@security` / `@mobile` / `@a11y` は `@release` の部分集合として扱う。

### CIとブラウザ

- 認証付き`@release` Full Regressionはsame-repositoryのdevelop向けPRごとに専用Convex Preview `preview/pr-{N}-e2e`を作って実行する。同じworkflowがhosting-pagesへのreport公開とPRコメント更新を行う。fork PR、developからmainへのPR、`release.yml`では実行しない
- Cloudflare PR Preview公開後に、TOP、機能、FAQ、使い方、お問い合わせの公開5routeを`@deployed` Smokeする。Smoke自体は認証情報とstorageStateを使用しない
- credential付きPR workflowはbase repositoryとhead repositoryが同じ場合だけ実行する。same-repositoryへpushできるactorを信頼境界内とし、fork PRへEnvironment Secretsを渡さない
- ブラウザprojectはChrome系だけとし、Desktop ChromeとMobile Chromeの代表viewportを使う
- 認証状態は6ユーザー分を用意する。CIの通常projectは3 workerとし、各workerが2ユーザーを交互に使う。同じ認証状態を並行worker間で共有しない。ローカルは既定6 workerを維持し、`E2E_WORKERS`を指定する場合は6の正の約数に限定する
- 通常projectの`@notification`テストは並列実行時の通知probe負荷を考慮して150秒を上限とする。実行時間の評価にはタイムアウト値ではなくJSON reportのwall spanを使う
- CI 3 worker時の初回購読と描画を考慮し、expect/actionは10秒、navigationは15秒を上限とする。ローカルだけ短い上限へ戻さない
- 複数actorシナリオはuser index 0〜2をpool 0、3〜5をpool 1として2 workerへ固定対応させる。各poolのactor A、B、Cは独立したbrowser contextを使う
- `setup` → `multi-actor-chromium` → 通常projectのdependencyを維持する。DesktopとMobileは同時実行できるが、Playwrightのworker slotごとの`parallelIndex`で同じユーザーの重複利用を避ける
- PR Full Regression専用Convex Preview `preview/pr-{N}-e2e`はPR close時のcleanup対象とし、cleanup失敗時は自動失効で回収する
- CloudflareへデプロイしたURLの`@deployed` Smokeは、認証付きFull Regressionとは別にPR Preview／Developのdeploy workflowで実行する
- シフト提出方式は、全方式で初回提出と再提出、管理者の割当編集、下書き保存、reload、確定通知、スタッフ閲覧までを一気通貫で確認する

### POM + 1ファイル + `test.step`

- **Pageクラス**: 画面操作を最初から全てPageクラスに切り出す。シナリオ側には操作の詳細を書かない
- **テストファイル**: ユーザーストーリー名で命名。`test.step()` でステップを区切る
- 1ファイルにまとめることでシナリオ間のデータ受け渡し問題を回避する

### 通知E2E

- 通知確認のためにmagic link、LINE link token、outbox、FailureInboxを人工生成しない
- 不達Dashboardの復旧テストだけは、失敗発生そのものを前提fixtureとして作ってよい。検証対象の個別・一斉再通知と状態回復は実UI/本番APIを通す
- UI操作から本番と同じmutation/actionを通し、E2E限定のredacted testing APIで証跡を待つ
- LINE followは状態を直接書き換えず、本番Webhookと共通の`markFollowing`を通して法務案内とopen募集案内を確認する
- 正常通知は `notificationOutbox`、retry/fallbackは `notificationDeliveryEvents`、最終失敗だけ `notificationFailureInbox` を確認する
- 正常通知を待つhelperは`failed`を成功扱いせず、LINE CTAはfallback emailではなくLINE本文/Flex messageで検証する
- testing APIは `E2E_TESTING_ENABLED=true` でのみ動作する。redacted通知probeはPII、token、本文、provider error全文を返さず、画面遷移用token取得は専用helperへ分離する
- CIでは `NOTIFICATION_DELIVERY_MODE=dry-run` をpreflightし、実宛先へ配送しない

### 進化パス

テストファイルが長くなったら（目安: 200行超）ユーザーストーリー単位で分割する。
分割時の実行順序は `playwright.config.ts` の `projects.dependencies` で宣言的に制御する。ファイル名に番号を付けない。

## 認証

- `@deployed` PR Preview Smokeは認証を行わず、空のbrowser contextで公開routeだけを確認する。Clerk/Convexの共有credentialとstorageStateは使用しない
- `fixtures/auth.setup.ts` で `@clerk/testing` の `clerk.signIn` を利用し、6ユーザー分の storageState を作成
- Convex probeは`npx`を経由せず、依存解決したConvex CLIをNodeで直接起動して並列実行時のプロセス競合を抑える
- CIでは環境変数 `E2E_CLERK_USERS`（カンマ区切り6件） / `E2E_CLERK_PASSWORD`（6ユーザー共通）を使用
- scenario は `fixtures/e2eTest.ts` の `test` を import し、各テストへ割り当てられたユーザーの storageState を使う
- `E2E_CLERK_USERS`の各値とpasswordはworkflow開始時にmaskし、password入力を行うsetupではtraceを保存しない
- Playwrightの`webServer.env`へ`process.env`を設定しない。JSON reportへcredentialを直列化せず、artifact upload前のfail-closed gateでpassword、user identifier、secret、tokenの混入を検査する
- 通常シナリオの失敗trace・動画は認証済みtokenを含み得るため、Actionsの非公開artifactへ7日だけ保存する。storageStateファイル自体はartifactへ含めない

## PR Full Regressionの結果公開

- E2EとVRTは別々の専用markerを持つ固定コメントとして更新する
- E2Eコメントにはstatus、Passed / Failed / Skipped、失敗テスト、全テスト、Actions、`https://yn1323.github.io/hosting-pages/yps-crispy-carnival/{N}/`のreport URLを表示する
- `playwright.yml`はPlaywright HTML reportを`playwright-report` artifactへ30日保存し、同じ内容を`hosting-pages`へ直接pushする
- hosting-pagesへのpushには`Preview` Environmentの`HOSTING_PAGES_TOKEN`を使う
- 同じPRの過去コメントは削除し、最新の結果コメントを1件だけ作成する

## データ

- **CI**: テストごとに `convex/testing.ts` の専用seedでowner単位の独立状態を作る
- **ローカル**: 起動済みの `convex dev` + ローカルDBを使い、シナリオ開始時に対象ownerのデータをresetする
- DB seedは前提状態に限定し、検証対象の編集・保存・確定・通知は実UI/本番APIを通す

## セレクター

優先順位: `getByRole` / `getByText` > `getByTestId` > CSSセレクター

`data-testid` はセマンティックなセレクターで特定できない場合のみ付与する。

## ルール

- `page.waitForTimeout()` 禁止。`expect().toBeVisible()` 等で待機する
- CSSセレクター（`.chakra-button` 等）に依存しない
- ガントチャートのドラッグ操作はE2Eでは最小限の検証のみ（精密な時間検証はユニットテスト側）
- mutation成功はトーストや画面表示で判定する。通知受付・不達回復の結合契約だけはredacted testing APIで補助確認してよい
