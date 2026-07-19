# フロントエンド単体テスト、Storybook、VRTリファクタ計画

## 目的

大規模なフロントエンドリファクタ後も、画面の見た目だけでなく、操作、状態遷移、データ変換、認証境界、モバイル表示の退行を検知できるテスト構成へ整理する。

テスト件数は維持目標にしない。

同じ契約を複数層で重複検証せず、壊れた契約に最も近い層が失敗する構成を目標にする。

## 対象と非対象

対象は`src/`、Storybook、VRT設定、フロントエンドに接続するCIとFull Regressionゲートである。

`apps/analytics-dashboard/`は本人だけが使う内部BIのため、自動テストとFull Regressionの対象外にする。

`vitest.config.ts`の`analytics-dashboard` projectと同アプリ配下の6テストは削除する。

本体と共有するConvex HTTP action、認証secret、集計処理の契約は、本体側のConvex Function TestまたはScenario Testに残す。

## 監査時点の構成

- `src/**/*.test.ts`：50ファイル、411ケース。
- `*.stories.tsx`：105ファイル、約367 Story export。
- Storybook `play`：88件。
- `chromatic.disableSnapshot: true`：46 Story export。
- `assertText`による独自文言確認：31箇所。
- `waitUntil`による独自polling：7箇所。
- `apps/analytics-dashboard/src/**/*.test.ts`：6ファイル。

現状はテスト総数が不足しているわけではない。

共有Convex schemaの再テストと静的文言のBehavior assertionが多い一方、シフト編集の中核変換、DOM依存hook、production build、VRT baseline、ブラウザruntime errorの保証が不足している。

## テスト層の契約

| 壊したもの | 失敗させる層 |
|---|---|
| 日付、時刻、割当、並び順、入力と保存値の変換 | Logic UT |
| hook、DOM API、Visual Viewport、同期ガード | Frontend Unit（jsdom、`pnpm test:logic`） |
| 入力、step、tab、dialog、callback、二重送信 | Storybook Behavior Test |
| 静的文言、空状態、エラー状態、長文、PCとモバイルのレイアウト | VRT |
| public query/mutationの認証、認可、token、冪等性 | Convex Function Test |
| 複数操作後の永続状態、通知、集計 | Convex Scenario Test |
| production bundle、実frontendと実Convexの接続、runtime error | E2E Full Regression |

`getByRole(..., { name })`で操作対象を選ぶことは、静的文言の重複assertとは扱わない。

URL、status、error code、JSON-LD、検索対象データ、法務version、sanitize結果、個人情報の非露出とマスキングは、文字列自体が機械契約またはセキュリティ契約なのでVRTだけに委ねない。

## P0：テスト実行環境を整理する

### analytics-dashboardを除外する

次を実施する。

1. `vitest.config.ts`から`analyticsDashboardProject`を削除する。
2. `apps/analytics-dashboard/src/domains/analytics/*.test.ts`の6ファイルを削除する。
3. `pnpm test`とCIの対象に同アプリが含まれないことを確認する。
4. 本体側の`convex/analytics/**/*.test.ts`は削除しない。

### Frontend Unitの実行環境を明示する

Logic projectで、純粋ロジックとFrontend Unitを実行する。

テストファイル名は`*.test.ts`または`*.test.tsx`に統一する。

jsdomが必要なテストは、ファイル先頭の`// @vitest-environment jsdom`で実行環境を指定する。

次の4ファイルにjsdom環境を指定する。

- `src/hooks/useSingleFlight.test.ts`
- `src/hooks/useStaffSession.test.ts`
- `src/helpers/gtm/index.test.ts`
- `src/components/features/Dashboard/DashboardAnnouncement/sanitizeAnnouncementHtml.test.ts`

`.github/workflows/test-logic.yml`では、`pnpm test:logic`によって純粋ロジックとFrontend Unitをまとめて必須実行する。

次の純粋関数はReact componentから切り離し、NodeのLogic UTへ残す。

- `ShiftBoardPage/index.tsx`の`buildShiftData`
- `SubmitFormView/index.tsx`の`buildInitialEntries`
- `ShiftEditSheet`の時間選択肢生成

## P0：低価値テストを高価値テストへ置き換える

### 共有schemaの再テストを統合する

次のフロントエンドテストは、Convex側schemaを再exportして同じ境界を再検証している。

- `src/components/features/Dashboard/AddStaffForm/index.test.ts`
- `src/components/features/Dashboard/EditStaffForm/index.test.ts`
- `src/components/features/Dashboard/EditShopForm/index.test.ts`
- `src/components/features/Dashboard/SetupModal/SetupStep1/index.test.ts`
- `src/components/features/Dashboard/SetupModal/SetupStep2/index.test.ts`
- `src/components/features/Dashboard/CreateRecruitmentForm/index.test.ts`内の`createRecruitmentSchema`

共有schemaの境界値は、schema定義元のテストまたは対応するConvex Function Testへ一度だけ置く。

フロントエンド側には次のresolver接続契約だけをBehavior Testとして残す。

- 不正入力ではsubmit callbackが呼ばれない。
- 正常入力では期待するpayloadでsubmit callbackが1回呼ばれる。
- step遷移、確認状態、server errorがユーザー操作に応じて切り替わる。
- high-risk submitでは短時間の連続操作でもcallbackが1回だけ呼ばれる。

`createRecruitmentFormSchema`の当日と翌日の制約、`deriveShopClosedDatesFromRegularDays`はフロント固有なのでLogic UTに残す。

日付境界テストは`vi.setSystemTime`で固定し、実行時刻の深夜0時をまたいでも結果が変わらないようにする。

### 静的な日本語文言assertを削る

次は日本語の完全一致ではなく、状態、code、path、callback、順序を検証する。

- `OnboardingCallout/index.test.ts`：`kind`、stage、dismiss対象、tour target。
- `assignmentIssues.test.ts`：code、date、staff、key、order、dedupe。
- `assignmentWarningSummary.test.ts`：code、count、order。
- `assignmentWarnings.test.ts`：code、date、staffId。
- `createRecruitmentErrors.test.ts`：error種別。
- `Dashboard/types.test.ts`：group種別と並び順。
- 各フォームschema test：`success`、issue path、error code。

次の文字列テストは機械契約なので維持する。

- `loginVerification`の個人情報マスキング。
- `sanitizeAnnouncementHtml`の危険要素除去と安全な内容保持。
- SEO、JSON-LD、canonical、`target`、`rel`。
- 法務文書のversionと対象audience。
- 検索indexとFlex Messageのデータ契約。
- 未知の英語errorを利用者へ露出しないfallback。

### 未使用helperを削除する

本番参照がないことを再確認したうえで、次は実装とテストを同時に削除する。

- `src/helpers/utils/array/`
- `src/helpers/utils/number/`
- `src/helpers/utils/string/`
- `src/helpers/utils/zod/`
- `src/helpers/utils/async/`
- `src/helpers/validation/`
- `Dashboard/types.ts`の未使用sort helper。
- `shiftTypeAssignments.ts`、`operations.ts`、`hitTesting.ts`の未使用export。

将来利用する可能性だけを理由に未使用APIのテストを維持しない。

## P0：シフト編集の中核を追加する

### paintPositionとresizePosition

`src/domains/shift/operations.test.ts`へ次を追加する。

- 順方向と逆方向のdrag。
- 完全上書き、左端trim、右端trim、中央分割。
- 最小時間幅とdraggable単位への丸め。
- 対象なしのno-op。
- 他スタッフと他日付を変更しない不変条件。
- `requestedTime`と`requestedTimes`の保持。
- positionIdとoptionIdの保持または再生成規則。
- 隣接境界のresizeと非隣接区間の非変更。

`hitTesting.ts`には境界ぴったり、threshold内外、共有境界、wrong staff/date、空shiftを追加する。

### buildShiftData

`ShiftBoardPage/index.tsx`から純粋変換を独立ファイルへ抽出し、次を追加する。

- time、dateOnly、shiftTypeの3方式。
- 店休日では希望と確定割当を消す。
- 永続化済み割当をpreviewより優先する。
- 複数時間希望の外枠と`requestedTimes`を保持する。
- optionId対応と旧データの時間範囲fallback。
- draft時点提出済みとdraft後提出を区別する。
- 希望なし、割当なし、position未設定。
- staffとdateの出力順を決定的にする。

### 提出初期値と保存payloadの往復

`SubmitFormView/index.tsx`から`buildInitialEntries`を抽出し、次を追加する。

- timeの既存希望。
- dateOnlyのworkingDates。
- shiftTypeの複数選択。
- 廃止済みoptionId、店休日、募集期間外日付の除外。
- 入力日付順の維持。
- `初期値 → buildSubmissionInput`で意味的に元へ戻る往復契約。

`timeOptions.ts`の`buildEntries`と`previousWeeklyPattern.ts`のdateOnly復元も同じ不変条件で補う。

## P0：Frontend Unitの不足を追加する

### useShopMutation

`src/hooks/useShopMutation.test.ts`を追加し、shopId注入、店舗変更、未選択、入力非破壊を確認する。

認可とIDOR防止はConvex Function Testで保証し、Frontend Unitでは引数生成だけを保証する。

### Visual Viewport

`useDialogVisualViewportStyle.ts`に対して、listener登録、初期値、`innerHeight` fallback、resize、scroll、丸め、cleanup、enabled切り替えを確認する。

モバイルキーボードによるVisual Viewport変化は通常VRTで再現しにくいため、Frontend Unitで扱う。

### useStaffSession

既存テストへjsdom環境を指定し、`recruitment_deleted`、`submission_closed`、検証中のtoken削除、malformed JSON、access kind別の`clearSession`を追加する。

statusとreasonは認証とセキュリティの機械契約なので、文言テストとして削除しない。

### 通知再送

`resendOpenNotificationFailures.test.ts`へ最大batch、`hasRemainingFailures`、複数pageのID集約、API rejection伝播を追加する。

## P0：StorybookとVRTの責務を分ける

### 固定表示だけのplayを削除する

次のplayは削除し、Story自体はVRTへ残す。

- `ArticleConversionCta.Mobile`
- `ContactForm.Default`
- `DashboardContent.OnboardingBeforeRecruitment`
- `DashboardContent.OnboardingAfterRecruitmentCreated`
- `DashboardContent.OnboardingAfterSubmission`
- `DashboardContent.OnboardingAfterShiftConfirmed`
- `DashboardContent.OnboardingStaffAdded`
- `DashboardContent.NotificationFailuresShowNextActionDuringOnboarding`
- `RecruitmentBoard.WithPastEntryButtonBeforeQueryStarts`
- `RecruitmentBoard.MultipleGroupsMobile`
- `RecruitmentBoard.PastLoadedCanLoadMore`
- `DemoLauncherFab.Default`
- `DemoShiftBoardPage.PC`
- `ShiftoriDemoFlow.SubmitStepDefaultRestBehavior`
- `Header.UserWithAction`
- `Header.StaffWithAction`
- ShiftFormの`TimeOvernight`、`TimeTwoWeeks`、PCとSPのoverviewにある固定表示play。

夜勤、期間、勤務区分の算出はLogic UTで保証し、描画結果はVRTで保証する。

### 初期状態と操作後状態を分離する

現在はplay実行後だけが撮影され、初期状態を失うStoryがある。

次を静的VRT StoryとBehavior専用Storyへ分ける。

- `DashboardContent.WithNotificationFailures`
- `DashboardContent.Empty`
- `ContactForm.TroubleGuidance`
- `ContactForm.SuccessfulSubmission`
- `NotificationFailureDialog.Normal`と`Mobile`
- `StaffDetailDialog`のbasic、notification、LINE、settings、mobile full screen。
- `ShiftBoardPage.SP`
- `Tour.Interactive`
- `InfoGuide.MultiPage`
- `ValidationErrorPanel.SPCompactExpanded`

Behavior専用StoryはVRTを無効化し、操作後状態は別の静的Storyで撮影する。

production componentへテスト専用propを追加せず、Story用harnessで代表状態を固定する。

### モバイルVRTの選択漏れを直す

次のStoryへ`vrt-mobile1`または`vrt-mobile2` tagを追加する。

- `HeroSummary.AllTasksMobile`
- `HeroSummary.MetaItemsMobile`
- `HeroSummary.WelcomeMobile`
- `NotificationFailureDialog.Mobile`
- `RecruitmentBoard.MultipleGroupsMobile`
- `RecruitmentBoard.PastLoadedCanLoadMore`
- `StaffRegistrationRequests.MobileDialogOpen`

`parameters.viewport`または`globals.viewport`だけでは`vitest.vrt.config.ts`のmobile projectに選択されない。

mobile tagとviewport指定を同時に返す型付きhelperを用意し、片方だけの指定を防ぐ。

### VRTへ戻す

次のsnapshot無効化を解除する。

- `StaffGuideContent.Default`。PCとモバイルを用意する。
- `StaffRegistration.Confirm`
- `StaffRegistration.Submitted`
- `StaffRegistration.Expired`

`ShiftoriLoading.Animated`のsnapshot無効化は維持する。

### 手動pollingを削る

次のStoryでは、独自`waitUntil`、`requestAnimationFrame` loop、直接`.click()`を`within`、`userEvent`、`findByRole`、`findByText`、`waitFor`、`expect`へ置き換える。

- `DashboardContent/index.stories.tsx`
- `SetupModal/index.stories.tsx`
- `CreateRecruitmentForm/index.stories.tsx`
- `EditShopForm/index.stories.tsx`
- `Tour/index.stories.tsx`
- `ShiftBoardPage/index.stories.tsx`
- `StaffRegistration/index.stories.tsx`
- `StaffSubmit/SubmitFormView/index.stories.tsx`
- `ErrorBoundary/index.stories.tsx`
- `Dialog/toast-interaction.stories.tsx`
- `ShiftoriDemoFlow/index.stories.tsx`

二重送信を同一task内で再現する同期`.click()`は例外として残し、理由をコメントで示す。

module-global counterはStoryごとのharnessへ閉じ込める。

### Behaviorとして維持する

次はVRTへ移さない。

- resend、back、submit、route navigation。
- validation後のinvalid状態とsubmit抑止。
- step、tab、dialog、popoverの遷移。
- callback payloadと呼び出し回数。
- disabled、loading、二重送信防止。
- 日付選択、締切、定休日、確認画面。
- 個人情報のマスクと操作前の非露出。
- destructive actionと通知操作の制御。

`AuthPage.LoginVerification`と`DashboardContent.PendingRequestsShowNextActionDuringOnboarding`の個人情報非露出は、静的文言ではなくセキュリティ契約として維持する。

## P0：Full Regressionゲートを有効にする

### VRT baseline欠落を失敗にする

`.github/workflows/vrt.yml`はbaselineがない場合にassertをskipし、`has_diff=false`で成功する。

PRではbaseline欠落と未承認差分を失敗にする。

初回baseline作成は明示的なbootstrap操作だけに限定する。

### production buildと同一SHAを検査する

PRでは高速層とSmokeを実行する。

develop統合後またはRC exact SHAでは、lint、type-check、production build、Logic（Frontend Unitを含む）、UI、Convex Function、Convex Scenario、VRT、E2Eを同じSHAで実行する。

Full Regressionは`pnpm dev`だけを対象にせず、最低でも`pnpm build`後のpreviewを検査する。

最終的にはCloudflare PreviewとE2E Convex Previewを接続し、認証済み主要導線もデプロイ済み成果物で確認する。

### runtime errorを失敗にする

`e2e/fixtures/e2eTest.ts`で次を収集し、テスト終了時に失敗させる。

- `pageerror`。
- allowlist外の`console.error`。
- 同一originのHTTP 5xx。
- 主要resourceの予期しないrequest failure。

third-party由来の既知ノイズは、理由と対象を完全一致でallowlist化する。

### E2E件数ゲートを契約IDへ置き換える

`scripts/assertPlaywrightReleaseResults.mjs`のdesktop 61件、mobile 1件、必須23ファイルという件数ゲートを廃止する。

`AUTH-01`、`SHIFT-01`、`MOBILE-01`のような安定した契約IDをmanifest化し、project、tag、実行結果、skip、重複を検証する。

これにより、同じ契約を短いscenarioへ統合しても通り、重要assertだけを削除した場合は失敗する。

### high-risk submitの利用箇所を守る

既存の`useSingleFlight`単体テストだけでは、componentからhookが外れた退行を検知できない。

既存のStaff Registration、募集作成、Setupに加え、ShiftBoard確定と通知一括再送へ代表Behavior Testを追加する。

短時間に2回操作してもcallbackまたはmutationが1回であることを確認する。

通知と確定のbackend側ではdedupeまたは冪等性もFunction Testで保証する。

## P1：不足状態を追加する

次の状態を追加する。

1. `DashboardContent`のNormal、Empty、WithNotificationFailuresの代表モバイルVRT。
2. `StaffDetailDialog`の各tab、mobile full screen、主要callback。
3. `CreateRecruitmentForm`と`SetupModal`の休日、締切、確認、time、shift-type各step。
4. `StaffSubmit`の3方式について、入力から確認、submit、payloadまでのBehavior。
5. `FeatureRequestDialog`のopen、server error、loading、二重submit。
6. `ContactForm`のserver error、verification error、loading、submitted。
7. `NotificationFailureDialog`の一括再送中、行loading、再送不可、全accepted。
8. `RecruitmentBoard`の過去募集表示と追加読込callback。
9. mobile E2Eの確定閲覧、法務同意、スタッフ登録。
10. ShiftBoard、登録、確定閲覧、主要Dialog、validation error状態のa11y。

容量境界は通常Full Regressionへ混ぜず、200スタッフ、2000割当、31日募集などを定期実行の`@capacity`へ分ける。

## 実装順序

1. analytics-dashboard projectとテストを除外する。
2. mobile tagとVRT baselineを直し、見た目の保護を先に成立させる。
3. DOM依存テストを標準のテストファイル名へ統一し、ファイル単位でjsdom環境を指定する。
4. 静的StoryとBehavior Storyを分離する。
5. 固定文言だけのplayとschema再テストを削る。
6. paint、resize、buildShiftData、提出往復契約を追加する。
7. pollingをTesting Libraryへ置き換える。
8. runtime error、production build、exact SHA、契約IDのFull Regressionゲートを有効にする。
9. 不足するmobile、a11y、error、loading、二重送信状態を追加する。

## 完了条件

- `apps/analytics-dashboard/`の自動テストとVitest projectが0件である。
- Logic projectが純粋ロジックとFrontend Unitを必須実行する。
- テストファイル名が`*.test.ts`または`*.test.tsx`に統一され、DOM依存テストにjsdom環境指定がある。
- VRT対象の初期静的文言だけを確認するplayが0件である。
- viewport指定だけでmobile VRTから漏れるStoryが0件である。
- PRのVRT baseline欠落と未承認差分が失敗する。
- Full Regressionがproduction buildとexact SHAを検査する。
- `pageerror`、allowlist外`console.error`、同一origin 5xxがE2Eを失敗させる。
- 同期ガード削除、シフト変換破壊、token権限交換、mobile tag削除、baseline削除、必須契約削除を意図的に行うと、それぞれ対応する層が失敗する。
- `pnpm lint`、`pnpm type-check`、`pnpm test:logic`、`pnpm test:ui`、`pnpm test:convex`、`pnpm vrt`、`pnpm e2e:release`が成功する。

## 参考ファイル

- `AGENTS.md`
- `src/AGENTS.md`
- `.github/AGENTS.md`
- `e2e/AGENTS.md`
- `.agents/skills/test-strategy/SKILL.md`
- `.agents/skills/test-strategy/references/test-writing-rules.md`
- `.agents/skills/shiftori-coding/SKILL.md`
- `doc/rules/testing-strategy.md`
- `doc/rules/security-strategy.md`
- `doc/plans/2026-07-13-e2e-full-regression.md`
- `vitest.config.ts`
- `vitest.vrt.config.ts`
- `.storybook/preview.tsx`
- `.storybook/vitest.setup.ts`
- `.storybook/vitest.vrt.setup.ts`
- `.github/workflows/test-logic.yml`
- `.github/workflows/test-ui.yml`
- `.github/workflows/vrt.yml`
- `.github/workflows/playwright.yml`
- `playwright.config.ts`
- `playwright.deployed.config.ts`
- `scripts/assertPlaywrightReleaseResults.mjs`
- `e2e/fixtures/e2eTest.ts`
- `src/domains/shift/operations.ts`
- `src/domains/shift/hitTesting.ts`
- `src/components/features/ShiftBoard/ShiftBoardPage/index.tsx`
- `src/components/features/StaffSubmit/SubmitFormView/index.tsx`
