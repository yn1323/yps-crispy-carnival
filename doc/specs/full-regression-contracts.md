# Full Regression横断契約表

> 文書種別: 検証契約（テストトレーサビリティ）
>
> コード照合日: 2026-09-01
>
> 対象: シフトリ本体、公開サイト、Convex backend、通知、関連CI

この文書は、シフトリの主要な業務要件と現行機能を一つの主担当テスト層へ対応付ける検証契約である。
個別機能の現在仕様はコード・設定と`doc/features/`、業務要件は`doc/specs/organization-billing-business-flow.md`、テスト層の責務は`doc/rules/testing-strategy.md`、実環境の公開状態は`doc/manual/release-status.md`を正とする。

Full Regressionは一つのE2E suiteではない。
Logic、Frontend Unit、Behavior、VRT、Convex Function、Convex Scenario、E2E、Deployed Smokeが、それぞれ異なる失敗境界を担当し、主要契約に未分類がない状態を指す。

## 現在の判定

現在の判定は**一部成立**である。
認証・tenant、課金、Capability、主要通知、削除、全public HTTP routeは契約IDと主担当層へ分類済みであり、P0に主担当未定または根拠テスト未指定の行はない。

一方、通知種別`other`のID直接指定再送と問い合わせの同一`requestId` replayは期待契約未決である。  AIシフトたたき台作成は業務要件にあるが、機能契約の詳細とコードがなく未実装である。  プロモーションコードの事前照合は、直接呼出しを制限するserver-side rate limitがなく一部成立である。
これらを既存実装の挙動だけから保証済みにしない。

| 状態 | 判定方法 |
|---|---|
| 実装済み | 現行契約がコードにあり、主担当層の根拠テストを特定できる |
| 一部 | 契約の主要部分は守られるが、明記した失敗境界またはCI実行条件が不足する |
| 未実装 | 契約は確定しているが、実装または主担当テストがない |
| 対象外 | Full Regressionへ含めない理由、再評価条件、代替確認を明記している |

`実装済み`はProductionへのartifact反映やproviderへの実到着を意味しない。

### 外部実行証跡の境界

| 対象 | コードとローカル検証 | 外部実行の確認状態 |
|---|---|---|
| 組織管理・課金経路 | 認証、組織境界、管理者状態、契約状態、上限、Stripe設定のFunction・Scenario Testと課金・Stripe Testで検証する | 実Convex deploymentへの反映、実Stripe API、Stripe Productionの顧客メール設定、Preview / Production、CIはいずれも未確認 |
| Deployed Smoke | HTTP / browser各1契約を`--list`で確認し、VRT baselineと合わせたgateのLogic Test 15件が成功 | 実PreviewへのSmokeは未実行。Production Smokeは対象外 |
| VRT baseline gate | 欠落、directory以外、画像0件、bootstrap条件をLogic Testで確認 | GitHub Actions上のPR比較とdevelop / main bootstrap、VRT capture / compareは未実行 |
| Analytics Dashboard CI | 専用lint、type-check、buildと、secret / URLなしのbuildが成功 | GitHub Actions上の実行とrequired check設定は未確認 |

## 更新方法

機能、public Convex function、HTTP route、通知purpose、認証方式、Capability lifecycle、主要routeを追加または変更した場合は、対応する契約行とsurface表を同じ変更で更新する。
既存E2Eを削除または統合する場合は、契約IDの主担当を先に移し、browserにしかない失敗境界を残す。

各契約には主担当層を一つだけ選ぶ。
根拠欄に複数層がある場合も、補助層は実接続、見た目、複数API後の永続状態など別の失敗境界だけを担当する。

## テスト層の現行配置

| 層 | 現行の入口 | この表で担当する境界 |
|---|---|---|
| Logic | `vitest.config.ts`の`logic` project | 純粋関数、schema、adapter、静的生成物、結果gate |
| Frontend Unit | 同じ`logic` projectの`src/**/*.test.tsx` | hook、form、route、表示分岐をDOMなしまたはjsdomで検査 |
| Behavior | `vitest.config.ts`の`ui` project | Storybook上の操作、状態遷移、Dialog、戻る・再試行 |
| VRT | `vitest.vrt.config.ts`のdesktop / mobile1 / mobile2 project | 代表状態のlayout。文言・全状態の総当たりはしない |
| Convex Function | `vitest.config.ts`の`convex(logic)` project | 単一functionの認証・tenant・入力・副作用0・冪等性 |
| Convex Scenario | `vitest.config.ts`の`convex(scenario)` project | 複数function、scheduler、provider代替をまたぐ永続状態と復旧 |
| E2E | `playwright.config.ts`と`e2e/scenarios/` | 認証・frontend・Convexを実接続するdesktop 13契約とmobile 1契約 |
| Deployed Smoke | `playwright.deployed.config.ts` | build済みPreviewのHTTP配信とhydrationの2契約。業務操作は重ねない |

Analytics Dashboardの専用build、VRT baseline、E2E / Deployed Smokeの結果件数はCI gateとして別に扱う。
UI test数や静的文言を契約数に数えず、上表のどの失敗境界を守るかで分類する。

## P0のSecurity Lens

| 境界 | Actor / Asset | Trust boundaryとabuse case | Server-side enforcement | 主担当 |
|---|---|---|---|---|
| 管理画面とtenant | Clerkで認証した管理者 / 組織・店舗・人物・シフト・課金状態 | URLやIDを差し替えたIDOR、removed主体による更新 | identityからuser、active membership、対象店舗と組織を毎回解決し、拒否時は副作用を作らない | Convex Function、代表E2E |
| スタッフCapability | 匿名スタッフ / 希望シフトの提出、確定シフト、法務同意、LINE連携 | tokenの用途交換、期限切れ・旧token・削除済み対象の利用、試行連打 | digestまたは保存済みtoken、scope、access kind、TTL、used/revoked、staff・shop・募集の再確認、rate limit | Convex Function、Scenario |
| 匿名HTTP | 問い合わせ・参加申請・削除依頼の利用者 / 個人情報、外部送信コスト、アカウント状態 | CORS迂回、過大body、bot、replay、列挙 | method、Origin、content type、body上限、schema、TurnstileまたはBearer session、rate limit、一般化response | HTTP Function |
| Provider Webhook | LINE、Resend、Stripe / 連携状態、配送状態、課金状態 | 偽造署名、event replay、古いeventによる巻き戻し、mode混在 | raw body署名、event ID dedupe、provider timestampまたはversion、保存済みobjectとの照合 | HTTP Function、Scenario |
| Service HTTP | 内部BIのWorker / 全tenantの集計・要望 | credential不一致、任意query、rate limit回避、過大response | service credential、固定request union、size上限、rate limit、最小DTO、安全なlog | HTTP Function |
| 通知workflow | manager、cron、worker / 宛先、本文、外部コスト | 二重enqueue、stale worker、削除後配送、誤channel、PII残留 | dedupe、lease、operation generation、送信直前再確認、retentionとredaction | Function、Scenario |
| 課金workflow | 組織管理者、Stripe / Subscription、entitlement、請求状態 | 他組織操作、request replay、test/live混在、provider成功後のlocal失敗 | 組織・権限・状態の再解決、object対応とlivemode、operationとidempotency key、recovery | Function、Scenario |
| 削除workflow | 組織管理者、本人、worker / access、PII、業務履歴 | 権限外削除、部分cleanup、削除後の再enqueue、stale lease | 受付時の論理停止、bounded job、lease回収、外部処理前再確認、保持とredactionの分離 | Function、Scenario |

## 認証、法務、利用開始

| 契約ID | 優先 | Actor / 完了 | 起点・状態遷移 | 永続化 | 下流影響 | 負の契約 | 通知 | 主担当層 | 端末 | 状態 | 根拠 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `AUTH-MANAGER-01` | P0 | 匿名利用者が管理画面へ安全にログインし、ログアウトできる | 公開認証画面 → Clerk session → 保護route。logout後は同じrouteから認証画面へ戻る | Clerk session。アプリDBを認証正本にしない | `AuthGuard`、全manager API | 未認証で保護画面を描画しない。元の遷移先以外へ権限を広げない | Clerkの認証通知は外部provider契約であり、アプリ通知に数えない | E2E | Desktop Chrome | 実装済み | `e2e/scenarios/auth-pages.test.ts`（`E2E-AUTH-01`）、`e2e/scenarios/auth-logout.test.ts`（`E2E-AUTH-02`）、`src/components/features/AuthenticatedApp/AuthGuard.test.tsx` |
| `AUTH-TENANT-01` | P0 | 管理者が利用可能な組織・店舗だけを操作する | `/dashboard?org&shop`またはapp routeの`org` → canonical所属と対象を照合 → 有効context | URL。browser storageはHome店舗のhintだけ | Dashboard、管理、人物、シフトの全manager API | 他tenant、候補外URL、removed所属、削除済み店舗を拒否し、別tenantへ暗黙fallbackしない | なし | Convex Function | Desktop ChromeをE2Eで補助 | 実装済み | `convex/organization/access.test.ts`、`convex/dashboard/queries.test.ts`、`src/components/features/AuthenticatedApp/AppOrganizationScope/`、`e2e/scenarios/tenant-switching.test.ts`（`E2E-TENANT-01`） |
| `AUTH-ACCOUNT-METHODS-01` | P1 | 認証済み本人がGoogle、メール、パスワードのログイン方法を変更する | 最新Clerk User確認 → 本人再確認 → 単一変更 → reloadで確定 | Clerk User resource | 次回ログイン。シフト連絡先・請求先には影響させない | 別Userへ副作用を送らない。single-flight。passwordやraw provider errorを保存・表示しない | Clerkによる確認コードだけ。Outbox対象外 | Frontend Unit | Desktop / Mobile | 実装済み | `src/components/features/LoginMethods/index.test.tsx`、`src/components/features/LoginMethods/useLoginMethodsController.test.tsx`、`src/components/features/LoginMethods/index.stories.tsx`、`src/pages/account-security/index.test.tsx` |
| `AUTH-ACCOUNT-EMAIL-COMPAT-01` | P2 | rolling release中の旧clientを安全に停止させる | 旧API呼出し → fail-closed stub → 変更なし | 変更なし | 旧clientだけ | Clerk、user、person、staffを更新しない | なし | Convex Function | 非該当 | 実装済み | `convex/accountEmail/actions.test.ts`、`convex/accountEmail/mutations.test.ts` |
| `LEGAL-CONSENT-01` | P0 | 管理者とスタッフが必要な法務文書へ同意する | 同意要否 → 文書表示 → 明示同意 → versionとevent保存 | managerまたはstaffの同意状態とevent | 管理画面、スタッフ提出 | 未同意、期限切れ・不整合token、他staffを拒否。二重送信しない | 未同意staffにはemail / LINE。既に同意済みなら送らない | Convex Scenario | Mobile影響あり。Behaviorで補助 | 実装済み | `convex/legal/mutations.test.ts`、`convex/legal/queries.test.ts`、`convex/_scenario/legalConsent.test.ts`、`src/components/features/StaffLegalConsent/index.test.tsx`、`src/components/features/StaffLegalConsent/ConsentView/index.stories.tsx` |
| `SETUP-ORGANIZATION-01` | P0 | 所属のない認証済み管理者が最初の1組織、1店舗を作る | `/dashboard` → 認証済み・所属0件 → 店舗、person、manager、staff、position、同意を一transactionで作成。プロモーションコード空欄なら2か月のTrial、有効なら`complimentary.pro` → `/dashboard?org&shop` | 組織、店舗、人物、所属、初期設定、Pro相当・上限50名のTrialとTrial期限、または期限なしの支払い不要Pro相当 | Dashboard、募集作成、通知、課金上限 | 再実行、既存所属、形式不正・設定不備・不一致のコード、途中状態を副作用なしで拒否し、コード値とStripe Customer、Subscription、課金operationを保存しない。事前照合public mutationにはserver-side rate limitがなく、frontendの同一tab制限は直接呼出しで回避できる | 初回LINE連携案内と7日後リマインダーを必要条件で一度だけ予約。Trial期限処理はコード空欄のTrialだけに予約 | Convex Function | Desktop Chromeをコード空欄のTrial経路で補助 | 一部 | `convex/setup/mutations.test.ts`、`convex/_scenario/managerSetup.test.ts`、`e2e/scenarios/manager-setup.test.ts`（`E2E-SETUP-01`） |
| `DASHBOARD-ONBOARDING-01` | P1 | 初回管理者が店舗登録後の4段階案内を完了する | setup済み → 募集・提出確認・スタッフ追加の案内 → dismiss | DBのdismiss状態。3/4確認だけsessionStorage | Dashboardの通常TODO表示 | 破損storageを安全に無視し、pending申請時の自動dismissと手動dismissを重複させない | 2/4は既存メールを開く案内だけ | Frontend Unit | Desktop / Mobile | 実装済み | `src/components/features/Dashboard/DashboardOnboarding/index.test.tsx`、`src/components/features/Dashboard/DashboardOnboarding/OnboardingCallout/index.stories.tsx`、`convex/dashboard/mutations.test.ts` |

## 組織、店舗、人物、権限

| 契約ID | 優先 | Actor / 完了 | 起点・状態遷移 | 永続化 | 下流影響 | 負の契約 | 通知 | 主担当層 | 端末 | 状態 | 根拠 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `ORG-CONTEXT-01` | P0 | 管理者が現在の組織・店舗と利用可否を確認する | 選択店舗 → 組織・課金・権限を解決 → 最小DTO | 既存の組織・所属・課金状態を読む | Header、Dashboard、設定、書込可否 | clientの組織ID・role・capabilityを認可にしない | なし | Convex Function | Desktop / Mobile | 実装済み | `convex/dashboard/queries.test.ts`、`convex/organization/queries.test.ts`、`src/components/features/Dashboard/OperationContext/index.test.tsx` |
| `ORG-CREATE-01` | P1 | 既存管理者が別のFree組織を作る | 作成上限内 → 本人profileだけsnapshot → `active.free`組織作成 | 新組織、最初の店舗、person、manager、staff、Free枠の選択対象 | 店舗選択、組織設定、利用人数 | 別人物・既存シフトを複製せず、同一request、上限、rate limit、日次budget、参照元店舗の所属を再確認 | 初回LINE連携案内、7日後リマインダーを必要条件で予約。Trial期限処理は予約しない | Convex Scenario | Desktop / Mobile | 実装済み | `convex/setup/mutations.test.ts`、`convex/_scenario/organizationCreation.test.ts`、`src/components/features/OrganizationSettings/controllers.test.tsx`、`src/pages/dashboard/index.stories.tsx`、`src/components/features/OrganizationSettings/OrganizationCreation/OrganizationCreationDialog.stories.tsx` |
| `ORG-PROFILE-01` | P0 | 管理者が組織名と人物のシフト連絡先を更新する | 対象解決 → 同一組織・person・staff整合性確認 → 一括更新 | organization、organizationPerson、同組織のactive staff | 一覧、通知宛先、請求先とは独立 | 別組織・Clerk・`users.email`・請求先を変更しない。上限超過、利用上限評価不能、不整合1件では全体拒否 | 変更後は新しいシフト連絡先だけを後続通知に使う | Convex Function | Desktop / Mobile | 実装済み | `convex/organization/name.test.ts`、`convex/organization/mutations.test.ts`、`convex/_scenario/staffManagement.test.ts` |
| `SHOP-LIFECYCLE-01` | P0 | 管理者が店舗を追加、切替、削除する | 同一組織・上限内 → 店舗追加、または対象店舗を論理削除 → 未削除店舗を再計算 | shopの組織、`isDeleted` | 店舗filter、Dashboard、シフト操作可否 | 他組織や削除済み店舗への操作を副作用なしで拒否する。上限超過または評価不能では追加を拒否し、整理のための削除を許可する。削除済み店舗を再利用可能へ戻す操作は持たない | なし | Convex Function | Desktop ChromeをE2Eで補助 | 実装済み | `convex/organization/shopManagement.test.ts`、`convex/organization/mutations.test.ts`、`e2e/scenarios/shop-lifecycle.test.ts`（`E2E-SHOP-01`） |
| `PERSON-MEMBERSHIP-01` | P0 | 管理者が一人の人物を複数店舗のスタッフとして追加・解除する | desired-setとpreview取得 → fingerprint再確認 → 一transactionで全差分反映 | organizationPerson、店舗ごとの新規staff、request result | Staff一覧、ShiftForm、提出、通知、回答数 | 他組織、stale、件数超過、異なるintentのrequest replayを全体拒否する | 新規所属だけ必要な案内を予約。解除後は対象staffの新規通知を止める | Convex Function | Desktop ChromeをE2Eで補助 | 実装済み | `convex/staff/mutations.test.ts`、`convex/organization/userDetailQueries.test.ts`、`convex/_scenario/staffManagement.test.ts`、`src/components/features/ShopDetail/index.stories.tsx`、`e2e/scenarios/shop-staff-membership.test.ts`（`E2E-MEMBERSHIP-01`） |
| `STAFF-ORDER-01` | P1 | 管理者が組織共通のスタッフ表示順を変更し、各店舗へ同じ順序の部分列を反映する | 全店舗filterのeditor取得 → dragまたはkeyboard移動 → fingerprint付き保存 → 組織・店舗scopeへ投影 | order state、組織人物順、未削除店舗のstaff順 | スタッフ管理、Dashboard、店舗詳細 | 他組織、重複・欠落ID、stale fingerprint、契約上限超過を副作用なしで拒否する。不整合またはbounded上限超過では部分順を返さず既存順へ戻す | なし | Convex Function | Desktop / Mobile。Frontend Unitで補助 | 実装済み | `convex/appOrganization/staffOrder.test.ts`、`convex/_scenario/staffOrderLifecycle.test.ts`、`src/components/features/OrganizationSettings/staffOrder.test.ts`、`src/components/features/OrganizationSettings/useStaffOrderReorder.test.tsx` |
| `PERSON-ROLE-01` | P0 | 有効管理者が人物の管理者権限だけを外す | 操作可否確認 → manager membership終了 → staff所属維持 | organizationMemberとaudit | 管理画面access、スタッフ通知 | 最後の管理者、本人性不明、他組織を拒否。上限超過または評価不能でも1名以上を残す権限解除を許可し、staff・シフト履歴を消さない | staffなら従来のstaff通知を維持 | Convex Scenario | Desktop / Mobile | 実装済み | `convex/organization/mutations.test.ts`、`convex/_scenario/organizationManagerAddition.test.ts` |
| `STAFF-REGISTRATION-01` | P0 | 匿名スタッフが店舗QRから申請し、管理者が承認または却下する | reusable登録link → 匿名申請 → pending → manager承認・正式staffまたは却下。削除済み人物との一致も特別確認なしで通常承認する | registration request、承認時に同じpersonをactive化して新しいstaff / legal consentを作る。旧staffと旧credentialは変更しない | Dashboard、Action Inbox、スタッフ一覧、募集通知 | 存在状態を一般化し、1店舗20件上限、bot・rate limit、他店舗承認を拒否する。安全でない人物不整合、account deletion受付済み、利用人数上限は汎用的な承認不可状態へ寄せ、旧staff、シフト提出と割当、権限、ほかの店舗所属、session、magic link、LINE token、canonical LINE linkを復元しない | 承認後の新しいstaffに必要なLINE案内・open募集。組織人物削除後は旧canonical LINE連携を使わない。対象店舗にstaff所属するactive managerへ24時間内の日次digest | Convex Scenario | Mobile影響あり。Behaviorで補助 | 実装済み | `convex/staffRegistration/httpActions.test.ts`、`convex/staffRegistration/queries.test.ts`、`convex/staffRegistration/mutations.test.ts`、`convex/staff/mutations.test.ts`、`convex/appOrganization/actionInboxQueries.test.ts`、`convex/_scenario/staffRegistration.test.ts`、`convex/_scenario/organizationPersonRemoval.test.ts`、`src/components/features/StaffRegistration/index.stories.tsx`、`src/pages/app-actions/useActionInboxController.test.tsx` |
| `SHIFT-ELIGIBILITY-01` | P0 | 管理者が店舗ごとにスタッフをシフト対象外・復帰へ切り替える | active staff → excluded / eligible | staffの対象設定。既存draftは保持 | ShiftForm、提出link、通知対象、回答数 | 対象外では新規提出・閲覧・シフト通知を拒否。復帰時に旧credentialを復活させない | 復帰後は必要な新linkだけを発行 | Convex Scenario | Desktop / Mobile | 実装済み | `convex/staff/mutations.test.ts`、`convex/_scenario/staffShiftEligibility.test.ts`、`src/components/features/UserShopDetail/useUserShopMembershipActions.test.ts` |

## 募集、提出、シフト表、Capability

| 契約ID | 優先 | Actor / 完了 | 起点・状態遷移 | 永続化 | 下流影響 | 負の契約 | 通知 | 主担当層 | 端末 | 状態 | 根拠 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `RECRUITMENT-01` | P0 | シフト担当者が募集を作成・削除する | 店舗設定snapshot → open募集作成 → 必要な通知・reminder予約。削除でinactive | recruitment、提出方法・時間snapshot | Dashboard、提出、ShiftBoard、通知fanout | 他店舗、日付不正、上限、削除済みの再利用を拒否。削除時に未完了fanoutを停止 | 募集通知、提出催促、確定催促 | Convex Scenario | Desktop Chrome | 実装済み | `convex/recruitment/mutations.test.ts`、`convex/_scenario/shiftRequestCollection.test.ts`、`convex/_scenario/recruitmentDeletion.test.ts` |
| `CAP-SHIFT-SESSION-01` | P0 | 匿名staffが提出または閲覧専用sessionを取得する | magic link → raw tokenを`by_token`で一意照合 → scope付きsession → 用途別の期限・使用済み・失効判定 | raw bearer tokenを`magicLinks.token`へ保存、staff session | 提出query / mutation、確定閲覧 | submitとviewの用途交換、重複token、使用済みview token、失効token、他店舗、削除済みstaff・shop・募集を拒否。rate limit | tokenは募集・確定・再発行通知のCTAに含む。Outbox内のURLはterminal化から30日後にredactする | Convex Function | Mobile ChromeをE2Eで補助 | 実装済み | `convex/staffAuth/mutations.test.ts`、`convex/_scenario/securityBoundaries.test.ts` |
| `SHIFT-SUBMISSION-01` | P0 | staffが時間指定・日ごと・勤務区分で初回提出・再提出する | valid submit session → 入力 → 全置換保存。提出期限後は未提出者の初回提出だけ許可 | submission headerと方式別明細、firstSubmittedAt | Dashboard回答数、ShiftBoard、Analytics | 用途違いsession、他店舗、期間外、定休日、不正区分、上限超過、利用上限評価不能を既存提出を保って拒否 | なし。募集通知は別契約 | Convex Scenario | Desktop / Mobile Chrome | 実装済み | `convex/shiftSubmission/mutations.test.ts`、`convex/shiftSubmission/queries.test.ts`、`convex/_scenario/shiftRequestCollection.test.ts`、`e2e/scenarios/first-shift-delivery.test.ts`（`E2E-SHIFT-01`）、`e2e/scenarios/release-support-staff-submit.mobile.test.ts`（`E2E-MOBILE-01`） |
| `SHIFT-SUBMISSION-RESULT-01` | P0 | 提出直後のstaffがserver事実に基づく完了状態を見る | URLの募集ID → 保存済みsubmit session・staff・shop・募集・提出record照合 → success / unavailable / retry | 新しい保存はしない | 提出完了画面 | 直接URL、無効session、提出recordなしでは成功表示しない。query失敗と対象外を混同しない | なし | Convex Function | Mobile影響あり。Frontend Unitで補助 | 実装済み | `convex/shiftSubmission/queries.test.ts`、`src/pages/staff-shift-submit-completed/index.test.tsx` |
| `SHIFT-BOARD-DRAFT-01` | P0 | シフト担当者が希望を見て割当を編集し、下書きを保存する | 募集・希望・既存割当読込 → 方式別編集 → validation → 全置換保存 → reload | shiftAssignments | 確定、通知snapshot、staff閲覧 | 他店舗staff / position、期間外、定休日、overlap、不正時刻、終了後保存を拒否。未保存離脱を確認 | なし | Convex Scenario | Desktop / Mobile | 実装済み | `convex/shiftBoard/mutations.test.ts`、`convex/shiftBoard/validation.test.ts`、`convex/_scenario/shiftBoardConfirmation.test.ts`、`src/components/features/ShiftBoard/ShiftBoardPage/index.stories.tsx` |
| `SHIFT-CONFIRM-01` | P0 | シフト担当者が保存済み割当を確定し、変更対象だけへ通知を予約する | draft → confirmed → snapshot比較 → durable fanout | recruitment status、confirmation snapshot、fanout operation | Dashboard、staff view、通知履歴、Analytics | 同内容の再確定を重複通知しない。削除・終了・旧generationを拒否 | 確定通知または変更通知。view capability付き | Convex Scenario | Desktop Chrome | 実装済み | `convex/shiftBoard/mutations.test.ts`、`convex/notification/confirmationSnapshots.test.ts`、`convex/_scenario/shiftBoardConfirmation.test.ts`、`e2e/scenarios/first-shift-delivery.test.ts` |
| `SHIFT-VIEW-REISSUE-01` | P0 | staffが確定シフトを閲覧し、無効linkから再発行を依頼する | view session → confirmed data表示。無効linkでcanonical募集確認 → 一般化した再発行受付 | view session、再発行Outbox、新しいview link | staff閲覧、通知履歴 | submit sessionで閲覧不可。未確定・削除済み・他店舗を拒否。メール一致を列挙せず連打をdedupe | 再発行通知。新しいview CTA | Convex Scenario | Mobile影響あり。Frontend Unitで補助 | 実装済み | `convex/shiftView/queries.test.ts`、`convex/staffAuth/queries.test.ts`、`convex/staffAuth/mutations.test.ts`、`convex/_scenario/shiftViewReissue.test.ts` |
| `CAP-LINE-LINK-01` | P0 | managerが発行した組織専用URLからstaffがLINEを組織人物へ連携する | newest-only token → OAuth state / code検証 → used → provider userとorganization person link。同じ組織の現在・今後の全staff所属で共通利用 | 72時間token、used/revoked、組織人物link generation、global friendship state | 全所属店舗の通知channel、follow状態、個別案内 | 旧・使用済み・期限切れ・別組織・削除済み・一つのLINE利用者による51組織目の連携・利用上限評価不能をprovider通信前と永続化直前に拒否。同一組織の別人物によるLINE ID奪取を拒否し、拒否時もtoken試行をrate limitする | 初回連携後とfollow復帰時はactive membershipのopen募集を必要条件で通知 | Convex Scenario | Mobile影響あり | 一部。Production切替は別証跡。LINE利用者50組織境界の直接testは未追加 | `convex/line/mutations.test.ts`、`convex/line/actions.test.ts`、`convex/_scenario/lineNotification.test.ts`、`src/components/features/LineCallback/index.test.tsx` |
| `CAP-LEGAL-01` | P0 | staffが法務同意linkを一回利用する | 30日token → page data → 同意 → used | tokenとconsent version / event | staff提出可否 | 重複token、期限切れ、他店舗、別staffで同意させない | 法務同意依頼 | Convex Function | Mobile | 実装済み | `convex/legal/mutations.test.ts`、`convex/legal/queries.test.ts` |
| `CAP-REGISTRATION-LINK-01` | P0 | managerが店舗専用の再利用可能な登録URLを取得し、必要時に再発行する | manager確認 → active link取得または作成 → 明示確認付きrotateで旧link失効と新link発行を一transaction化 → newest-only linkを公開申請で利用 | shopRegistrationLinkのactive 1件、旧linkのrevokedAt、tokenを含まないaudit | 匿名登録pageとHTTP受付。rotation前のpending申請は維持 | 他店舗、削除済み、上限超過、利用上限評価不能、旧token、active重複を拒否する。同じexpected linkのretryは新しいlinkを増やさず現在値を返し、raw secretをaudit・logへ出さない | なし | Convex Function | Mobile影響あり。Behavior / VRTで補助 | 実装済み | `convex/staffRegistration/queries.test.ts`、`convex/staffRegistration/mutations.test.ts`、`convex/staffRegistration/httpActions.test.ts`、`convex/_scenario/staffRegistration.test.ts`、`src/components/features/Dashboard/StaffManagement/StaffInvitationDialog.stories.tsx` |
| `FEATURE-REQUEST-01` | P1 | managerまたはstaff sessionが200文字以内の要望を送る | 新appは店舗が親shellで検証済みなら店舗、未解決なら組織を内部対象にする。旧manager画面とstaff sessionは現在店舗を対象にする → actor確認 → requestIdで冪等保存 → 内部BI一覧 | organizationIdまたはshopIdの一方を持つfeatureRequest | Analytics Dashboard `/requests` | clientのuser / staff IDを信用しない。新appではDialogに対象選択を置かず、任意の店舗へ暗黙fallbackしない。serverでcanonicalな組織所属、店舗と組織の一致、店舗と親組織の削除状態、有料機能のwrite policyを再確認し、他組織、削除済み店舗、removed所属、重複requestを拒否する | なし | Convex Scenario | Desktop / Mobile | 実装済み | `convex/featureRequest/mutations.test.ts`、`convex/_scenario/featureRequest.test.ts`、`src/components/features/AuthenticatedApp/AppOrganizationScope/featureRequestScope.test.ts`、`src/components/features/FeatureRequestDialog/appScope.test.ts`、`src/components/features/FeatureRequestDialog/index.stories.tsx` |

`magicLinks.token`は現行schemaでraw bearer tokenのまま保持され、`by_token` indexで照合される。
view linkは`expiresAt`と`usedAt`、submit linkは募集状態とシフト開始日のcutoffで利用可否を決め、スタッフの対象外化・所属解除・店舗削除では`revokedAt`を設定する。

通知Outbox内のcapability URLはterminal化から30日後にredactするが、`magicLinks.token`自体をdigest化、redact、pruneする処理は現行実装にない。
この残存raw credentialはsecurity debtであり、digest migrationと既存rowの移行・retention設計は今回の文書訂正に含めず、別のschema migrationとして扱う。

## 通知、配送、復旧

| 契約ID | 優先 | Actor / 完了 | 起点・状態遷移 | 永続化 | 下流影響 | 負の契約 | 通知 | 主担当層 | 端末 | 状態 | 根拠 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `NOTIFY-OUTBOX-01` | P0 | mutation / cronが通知意図を永続化し、workerが安全に配送する | enqueue → pending → processing → sent / pending retry / failed / cancelled | Outbox、delivery event、history、failure inbox | 外部email / LINE、管理画面履歴 | active dedupe重複なし。lease期限前の二重claim、stale worker完了、削除後送信を拒否。業務通知はprovider送信直前に上限状態を再判定して停止し、請求先メールアドレス変更通知は維持する | シフトリが送るbusiness通知と請求先変更通知の共通基盤 | Convex Scenario | 非該当 | 実装済み | `convex/notificationOutbox/enqueue.test.ts`、`convex/notificationOutbox/mutations.test.ts`、`convex/_scenario/notificationDelivery.test.ts` |
| `NOTIFY-FANOUT-01` | P0 | 募集・確定操作が対象staff集合へ取りこぼしなく通知を予約する | semantic operation → bounded target snapshot → batch claim → complete / recover / supersede | fanout operation、cursor、target key、Outbox | 通知履歴、capability、Dashboard | 最大50人。重複・別世代・削除・対象外を送らず、中断後も同じprovider idempotency key | 募集、確定、個別再送 | Convex Scenario | 非該当 | 実装済み | `convex/notification/fanout.test.ts`、`convex/notification/actions.test.ts`、`convex/_scenario/notificationDelivery.test.ts` |
| `NOTIFY-CHANNEL-01` | P0 | 対象staffまたはmanagerへ現在有効なchannelを一つ選ぶ | recipient再解決 → LINE利用可ならLINE、それ以外email → quota時fallback | 選択結果はOutbox payload / historyに固定 | 外部送信、履歴 | 選ばれないchannel、他店舗、削除済み、古いemailへ送らない。店舗管理通知は対象店舗のstaff所属のないmanagerへ送らない。LINE 429とquota fallbackを混同しない | businessはLINE / email。請求先変更通知はemailのみ | Convex Scenario | 非該当 | 実装済み | `convex/_lib/notification.test.ts`、`convex/_scenario/lineNotification.test.ts`、`convex/notificationOutbox/actions.test.ts` |
| `NOTIFY-HISTORY-01` | P0 | managerがstaff別の送信・配信状態だけを確認する | enqueue / provider event → safe metadata projection → pagination | notificationHistory。staff / shop削除まで | 店舗別staff設定 | 宛先、本文、token、raw errorを保存・返却しない。他店舗・削除済みstaffを拒否 | 送信待ち、送信済み、email配信済み等を区別 | Convex Scenario | Desktop / Mobile | 実装済み | `convex/notificationOutbox/history.test.ts`、`convex/_scenario/notificationHistory.test.ts`、`src/components/features/StaffNotificationHistory/useStaffNotificationHistory.test.ts` |
| `NOTIFY-FAILURE-01` | P0 | managerがDashboard対象の不達を再通知または無視する | provider / worker failure → open → retryingまたはresolved → 再失敗でopen | failure inboxとaudit metadata | Dashboard TODO、日次manager reminder | 同一店舗・actionable・openだけを操作。再通知を配送完了と表示しない | failure reminder digest。再通知は元purposeへ戻す | Convex Function | Desktop / Mobile | 実装済み | `convex/notificationOutbox/failureResend.test.ts`、`convex/notificationOutbox/queries.test.ts`、`src/components/features/Dashboard/NotificationFailureRecovery/index.test.tsx` |
| `NOTIFY-OTHER-RESEND-01` | P1 | IDを直接指定された`other`通知失敗をどう扱うか | 現在は一覧非表示だが`resendFailure`がactionable判定を再適用しない | 現行failure / Outbox | 非表示public mutationの副作用 | 許可か拒否かを仕様確定するまで新しい期待値を固定しない | `other` | 未決 | 非該当 | 対象外（仕様未決） | `doc/features/notification-failure-dashboard.md`、`doc/plans/2026-08-12_テスト充足度監査_改善計画.md` |
| `NOTIFY-RETENTION-01` | P0 | maintenanceが通知payloadと生errorを期限後にredactする | terminal + 30日 → redact。delivery eventは90日後prune | safe metadataを保持し、宛先・本文・capability・raw errorを除去 | 運用probe、個人情報保持 | pending / processingを早期redactしない。再実行で結果を変えない | なし | Convex Function | 非該当 | 実装済み | `convex/notificationOutbox/maintenance.test.ts`、`convex/notificationOutbox/redaction.test.ts`、`convex/notificationOutbox/migration.test.ts` |

### 通知purposeの分類

`accepted`、`scheduled`、`retrying`はproviderへの実到着を意味しない。
E2Eは代表CTAとのbrowser接続だけを守り、対象集合、channel、件数、dedupe、fallbackはFunctionまたはScenarioを主担当にする。

| Trigger / purpose | Channel / 対象 / CTA | 負の契約 | 契約ID | 状態と根拠 |
|---|---|---|---|---|
| 募集作成・現在募集中の個別再送 | staffへLINE優先、email fallback。提出CTA | 対象外・削除済み・提出期限後・別店舗へ0件。semantic targetでdedupe | `RECRUITMENT-01`、`NOTIFY-FANOUT-01` | 実装済み。`convex/notification/actions.test.ts`、`convex/_scenario/shiftRequestCollection.test.ts` |
| 提出期限前のstaff催促 | 未提出staffへLINE優先、email fallback。提出CTA | 提出済み、対象外、削除済み、提出期限条件外へ0件 | `NOTIFY-FANOUT-01` | 実装済み。`convex/notification/reminderQueries.test.ts`、`convex/_scenario/shiftRequestCollection.test.ts` |
| 確定・変更・現在確定シフトの個別再送 | 変更対象staffへLINE優先、email fallback。view CTA | snapshot同値、旧generation、対象外、削除済みへ0件 | `SHIFT-CONFIRM-01`、`NOTIFY-FANOUT-01` | 実装済み。`convex/notification/confirmationSnapshots.test.ts`、`convex/_scenario/shiftBoardConfirmation.test.ts` |
| view link再発行 | 一致するstaffへemail / LINEの現行選択。新view CTA | 一致有無を一般化し、短時間連打でjobを増やさない | `SHIFT-VIEW-REISSUE-01` | 実装済み。`convex/staffAuth/mutations.test.ts`、`convex/_scenario/shiftViewReissue.test.ts` |
| LINE連携案内 | 組織で未連携のstaffのシフト連絡先email。組織共通のLINE連携CTA | 連携済みperson、削除済み・emailなし・別組織を拒否し、再送時は旧tokenを使わない | `CAP-LINE-LINK-01` | 実装済み。`convex/line/mutations.test.ts`、`convex/staff/mutations.test.ts`、`convex/staffRegistration/mutations.test.ts` |
| 法務同意依頼 | 未同意staffへLINE優先、email fallback。同意CTA | 同意済み・削除済みへ0件 | `LEGAL-CONSENT-01`、`CAP-LEGAL-01` | 実装済み。`convex/legal/mutations.test.ts`、`convex/_scenario/legalConsent.test.ts` |
| スタッフ参加申請digest | 直近24時間にpendingがある店舗にstaff所属するactive manager。LINE優先、email fallback、Dashboard CTA | 申請者PII・件数を本文へ出さず、古い申請だけまたは店舗所属managerが0人なら0件 | `STAFF-REGISTRATION-01` | 実装済み。`convex/staffRegistration/actions.test.ts`、`convex/staffRegistration/notificationQueries.test.ts` |
| 不達通知digest | 直近24時間のopen failureがある店舗にstaff所属するactive manager。LINE優先、email fallback、Dashboard CTA | 店舗所属managerが0人なら0件。digest自身の失敗をFailureInboxへ載せない | `NOTIFY-FAILURE-01` | 実装済み。`convex/notificationOutbox/failureReminderQueries.test.ts` |
| 提出期限翌日の確定催促 | 未確定募集の店舗にstaff所属するactive manager。LINE優先、email fallback、Dashboard CTA | 確定済み・削除済み・予定時刻が過去、または店舗所属managerが0人なら0件。FailureInbox抑止 | `RECRUITMENT-01` | 実装済み。`convex/shiftConfirmationReminder/queries.test.ts`、`convex/recruitment/mutations.test.ts` |
| 初回店舗登録7日後の本番募集案内 | 本人以外の対象staffがいない店舗にstaff所属するactive manager。LINE優先、email fallback、Dashboard CTA | 条件解消済み、削除済み、非active manager、または店舗所属managerが0人なら0件。FailureInbox抑止 | `SETUP-ORGANIZATION-01` | 実装済み。`convex/shopActivationReminder/actions.test.ts`、`convex/shopActivationReminder/queries.test.ts` |
| 請求先メールアドレス変更 | 全active managerの現在のシフト連絡先へemailのみ | LINEとremoved managerへ0件。同一`requestId`の再実行で追加0件。対象集合と件数を完全一致 | `BILLING-NOTIFICATION-01` | 実装済み。`convex/organizationBilling/mutations.test.ts`、`convex/organizationBilling/actions.test.ts` |
| Trial終了、契約開始・変更・解約、支払い失敗、Free移行、再契約 | シフトリから送らない。Stripeの請求書、領収書、決済関連通知へ委ねる | 組織課金のOutboxと予約jobが0件 | `BILLING-NOTIFICATION-01` | 実装済み。`convex/organizationBilling/mutations.test.ts`、`convex/organizationBilling/actions.test.ts`、`convex/organizationStripe/actions.test.ts` |
| 管理者招待・受諾完了 | 招待先email、受諾後のactive manager | 発行と再送は招待先へ各version 1件。旧version、取消済み、期限切れ、removed issuerへ0件 | `MANAGER-INVITATION-01` | 実装済み。`convex/organizationInvitation/mutations.test.ts`、`convex/notification/templates.test.ts`、`convex/_scenario/staffManagerInvitation.test.ts` |

通常業務通知は、未承認の管理者招待を除く実利用数から送信直前に利用上限状態を導出する。
上限超過または利用上限評価不能では業務通知のprovider呼び出しを開始せず、請求先メールアドレス変更通知、請求処理、署名済みWebhookは停止しない。

## 課金、削除、データ寿命

| 契約ID | 優先 | Actor / 完了 | 起点・状態遷移 | 永続化 | 下流影響 | 負の契約 | 通知 | 主担当層 | 端末 | 状態 | 根拠 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `BILLING-ENTITLEMENT-01` | P0 | 組織管理者が現在のプランと利用上限の範囲で業務操作する | 保存済みplan / lifecycle＋未承認招待を除く実利用数 → entitlement / limits / write permission。`initialPaymentPending`は支払い成功前の有料権限を持たず、`paymentTerminationPending`はFree権限へ投影する | organizationBillingStateへplan / lifecycleだけを保存。上限超過と評価不能は保存しない | 人物、店舗、管理者、Dashboard、ShiftBoard | UIの表示やclient roleを信用せず、支払い成功前と検証済み未払い後に有料権限を許可しない。上限超過または評価不能では整理・課金・終了操作だけを許可し、支払い不要Pro相当をStripeへ接続しない | 請求先変更通知は別契約 | Convex Function | Desktop / Mobile | 実装済み | `convex/organizationBilling/policy.test.ts`、`convex/organizationBilling/mutations.test.ts`、`convex/dashboard/queries.test.ts` |
| `BILLING-CHECKOUT-01` | P0 | active managerが有料プラン価格を確認し、Checkout / Portalを開始する | action context再解決 → Price / Customer / Subscription / livemode確認 → session作成 | billing operation、provider mapping | 課金画面、Webhook収束 | 他組織、removed所属、対象外state、test/live混在、支払い不要Pro相当、設定不備をprovider到達前に拒否する | シフトリの課金メールは0件。Stripeの決済関連通知は外部設定 | Convex Function | Desktop / Mobile | 実装済み。実provider / deployment未確認 | `convex/organizationStripe/actions.test.ts`（組織scope Actionを直接検証）、`convex/organizationStripe/config.test.ts`、`src/components/features/OrganizationSettings/BillingSettings/actionAdapter.test.ts` |
| `BILLING-PLAN-CHANGE-01` | P0 | active managerが有料プラン変更、期間末解約、予約取消を完了する | preview → operation → Stripe確認 → active / scheduledへ収束。StandardからProだけを即時の日割り請求とし、支払い未確認ではStandardを維持する。ProからStandardと有料プランからFreeは期間末に適用する | operation、subscription snapshot、billing state | entitlement、利用上限、Dashboard | 他組織、removed所属、対象外state、test/live混在を副作用前に拒否する。上限超過を理由に下位active planの適用を拒否せず、ローカル期限だけでprovider確認前に確定しない | 状態遷移によるシフトリの課金メールは0件 | Convex Scenario | Desktop / Mobile | 実装済み。実provider / deployment未確認 | `convex/organizationStripe/actions.test.ts`（組織scope Actionを直接検証）、`convex/_scenario/organizationPaidPlanChanges.test.ts` |
| `BILLING-PAYMENT-FAILURE-01` | P0 | Stripe Webhookとinternal workerが検証済みの支払い失敗をFreeへ安全に収束させ、active managerが理由と再契約導線を確認する | 署名済みWebhook → Event・最新Invoice・Subscription再取得 → `paymentTerminationPending`でFree権限を即時適用 → Subscription終了・Invoiceの`auto_advance: false` → provider確認 → `active.free`＋`paymentFailed`理由 | webhook receipt、operation、subscription snapshot、billing stateと変更理由 | 終了処理中からのFree entitlement、未承認招待の失効、Dashboardとプラン画面のAlert、完了後の再契約導線 | 偽造、重複、順不同、古いInvoice、別組織、test/live混在を拒否する。終了処理中に有料権限と新契約を許可せず、`customer.subscription.deleted`だけで失敗理由を設定せず、旧Subscriptionの遅延`invoice.paid`で自動復帰・理由消去しない | シフトリの課金メールは0件。Stripe顧客メールは外部設定 | Convex Scenario | Desktop / Mobile | 実装済み。Stripe Sandbox / deployment未確認 | [変更計画](../plans/2026-08-29_プラン遷移簡素化と支払い失敗対応_変更計画.md)、`convex/_scenario/organizationPaidPlanChanges.test.ts`、`convex/organizationStripe/actions.test.ts`、`convex/organizationBilling/mutations.test.ts`、`convex/dashboard/queries.test.ts` |
| `BILLING-TRIAL-CANCEL-01` | P0 | active managerがTrialの継続予約を一度だけ取り消す | cancel request → subscription / generation単位のsingle-flight → provider取消 → local収束 / recovery | 一つのbilling operationと安定idempotency key | Trial終了時の`active.free`移行、実利用から導出するFree上限状態、再契約導線 | 未認証、removed所属、他組織、対象外stateは副作用0 | シフトリの課金メールは0件 | Convex Function | Desktop / Mobile | 実装済み。実provider / deployment未確認 | `convex/organizationStripe/actions.test.ts`（組織scope Actionを直接検証） |
| `BILLING-NOTIFICATION-01` | P0 | active managerが請求先メールアドレスを変更し、全active managerへ変更通知を一度だけ予約する | `updateBillingEmail` → 監査とStripe同期を予約 → recipient再解決 → email Outbox | organization、audit、Outbox、`requestId`由来のdedupe key | 全有効管理者が請求先変更を認識する | LINE、removed manager、古いシフト連絡先へ0件。同値更新と同一`requestId`の再実行で追加0件。Trial、契約開始・変更・解約、支払い失敗、Free移行、再契約ではOutboxと予約jobが0件 | purpose=`billing`、請求先変更emailのみ | Convex Function | 非該当 | 実装済み | `convex/organizationBilling/mutations.test.ts`、`convex/organizationBilling/actions.test.ts`、`convex/organizationStripe/actions.test.ts` |
| `MANAGER-INVITATION-01` | P0 | 有効な管理者が人物を招待し、受取人が本人確認後に管理者になる | strict issue / explicit resend → preview → login / signup → verified identity → token消費 → manager membership | invitation、外部人物は承認時だけperson / membership、reservation、audit | 組織access、管理者上限、通知、管理者設定 | token、本人性、issuer authority、上限、tenant、期限、versionを再確認し、拒否時は副作用0 | 招待、受諾完了。招待versionと受信者ごとのdedupeで重複予約しない | Convex Scenario | Desktop ChromeをE2Eで補助 | 実装済み。実provider配送未確認 | `convex/organizationInvitation/mutations.test.ts`、`convex/organizationInvitation/acceptanceActions.test.ts`、`convex/organization/mutations.test.ts`、`convex/_scenario/staffManagerInvitation.test.ts`、`convex/_scenario/organizationManagerAddition.test.ts`、`src/components/features/ManagerSettings/controllers.test.tsx`、`src/components/features/ManagerSettings/presentation.test.ts`、`src/components/features/ManagerSettings/index.stories.tsx`、`src/components/features/ManagerInvitationAcceptance/index.test.tsx`、`src/components/features/ManagerInvitationAcceptance/index.stories.tsx` |
| `DELETE-PERSON-01` | P0 | 管理者が人物を店舗または組織から安全に外す | preview → membership / person removal → access即時停止 → bounded cleanup。再追加は手入力・QR承認とも削除履歴の特別確認なしで通常追加する | staff / personの論理状態、audit、cleanup。再追加は同じpersonをactive化して新しいstaff IDを作る | 将来割当、session、token、LINE、通知、回答数 | 店舗からの解除は過去履歴・管理者権限・組織人物・別店舗とcanonical LINE連携を維持し得る。他組織、stale previewは拒否する。active managerの組織からの人物削除は先に権限解除を要求する。組織人物削除後の再追加は旧staff、シフト提出と割当、管理者権限、ほかの店舗所属、session、magic link、LINE token、canonical LINE linkを復元せず、account deletion受付済み・安全でない不整合・利用人数上限を汎用的に拒否する | 削除後の新規通知0件。再追加後は新しいstaffに必要な通知だけを予約する | Convex Scenario | Desktop / Mobile | 実装済み | `convex/organization/personRemoval.test.ts`、`convex/organization/mutations.test.ts`、`convex/staff/mutations.test.ts`、`convex/staffRegistration/queries.test.ts`、`convex/staffRegistration/mutations.test.ts`、`convex/_scenario/organizationPersonRemoval.test.ts`、`convex/_scenario/staffRegistration.test.ts`、`convex/_scenario/securityBoundaries.test.ts` |
| `DELETE-SHOP-ORGANIZATION-01` | P0 | 管理者が店舗または組織の利用を終了する | 最新可否確認 → 親を論理削除 → cleanup job → completed / actionRequired | 親・所属の論理削除状態、job、業務識別情報は保持 | 全manager / staff API、通知、再setup | 最後の店舗、課金契約残存、他管理者、未完了jobを拒否。global userを削除しない | 未送信通知をcancelし、新規enqueue 0件 | Convex Scenario | Desktop ChromeをE2Eで補助 | 実装済み | `convex/organization/deletion.test.ts`、`convex/deletionCleanup/mutations.test.ts`、`convex/deletionCleanup/service.test.ts`、`convex/_scenario/organizationDeletion.test.ts`、`e2e/scenarios/shop-lifecycle.test.ts` |
| `DELETE-ACCOUNT-01` | P0 | 本人がstrict再認証後に、所属に応じた範囲でアカウント削除を依頼する | preview → HTTP受付 → 所属なしはlocal access停止、共有組織は本人離脱と通知履歴cleanup、単独管理者は組織cleanup → provider job → completed / retry / actionRequired → redaction | account deletion job、user tombstone、本人所属の終了状態またはlinked cleanup job。provider IDと共有cleanup対象は完了時redact | AuthGuard、Clerk削除、共有組織の継続利用、組織と全店舗の論理削除 | target IDとroleをclientから受けず、複数組織、stale fingerprint、代理session、issuer不一致、cross-tenant cleanup対象を副作用なしで拒否。共有通知履歴とlinked組織cleanupの完了前にproviderを呼ばず、子jobの運用retryは対象とversionを再確認し、provider対象未確認の404を成功にしない | 共有組織から退出する本人と組織削除対象の未送信通知を停止 | Convex Scenario | Desktop / Mobile | 実装済み | `convex/accountDeletion/combined.test.ts`、`convex/accountDeletion/httpActions.test.ts`、`convex/accountDeletion/lifecycle.test.ts`、`convex/_scenario/accountDeletion.test.ts`、`src/components/features/AccountDeletion/useAccountDeletionController.test.tsx`、`src/components/features/AccountDeletion/AccountDeletionSection.stories.tsx` |

組織課金メールの縮小は保存形状を変えない。
プラン機能の公開前で廃止対象メールの予約jobも存在しないため、migration、backfill、旧jobの互換no-op、queue drainを検証対象に追加しない。

## Public HTTP、公開サイト、Analytics

| 契約ID | 優先 | Actor / 完了 | 起点・状態遷移 | 永続化 | 下流影響 | 負の契約 | 通知 | 主担当層 | 端末 | 状態 | 根拠 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `HTTP-ACCOUNT-DELETION-01` | P0 | strict再認証済み本人が削除依頼をHTTPで受け付けられる | OPTIONS / POST → Origin・Bearer session・issuer・actor・payload検証 → 202 | `DELETE-ACCOUNT-01`のjob | local access停止とprovider workflow | 不許可Origin、過大body、target field、代理session、認証例外、不正なscope / fingerprintでmutation 0件 | なし | HTTP Function | 非該当 | 実装済み | `convex/accountDeletion/httpActions.test.ts` |
| `HTTP-CONTACT-01` | P0 | 匿名利用者が問い合わせを送る | OPTIONS / POST → Origin・JSON・16 KiB・schema・Turnstile・rate limit → Resend → Slack | 本文はDB保存しない。email受付が正 | 問い合わせ窓口、社内Slack | PII、Turnstile tokenをlogへ出さない。Slack失敗はemail成功を覆さない | Resend emailとSlack。Outbox対象外 | HTTP Function | Desktop / Mobile | 一部。16 KiB境界の直接testがなく、同一`requestId` replay時の外部副作用契約も未決 | `convex/contact/httpActions.test.ts`、`convex/contact/schemas.test.ts`、`src/components/features/ContactForm/submitContactRequest.test.ts` |
| `HTTP-STAFF-REGISTRATION-01` | P0 | 匿名staffが店舗参加申請をHTTPで受け付けられる | OPTIONS / POST → Origin・JSON・8 KiB・schema・Turnstile・多層rate limit → 一般化response | pending requestを必要条件で作成 | `STAFF-REGISTRATION-01` | 登録済み・申請済み・上限を同じresponseへ寄せる。client IP headerを無条件に信用しない | 承認後・digestだけ | HTTP Function | Mobile影響あり | 実装済み | `convex/staffRegistration/httpActions.test.ts`、`convex/staffRegistration/mutations.test.ts` |
| `HTTP-LINE-WEBHOOK-01` | P0 | LINEがfollow / unfollow / message eventを反映する | POST raw body → size・event件数・署名 → event dedupe / timestamp順序 → state更新 | webhook receipt、LINE following state | channel選択、定型reply | 署名不正、101件、古いevent、replayで副作用0。PIIをreceiptへ保存しない | messageへの定型reply | HTTP Function | 非該当 | 実装済み | `convex/line/webhook.test.ts`、`convex/_lib/lineSignature.test.ts` |
| `HTTP-RESEND-WEBHOOK-01` | P0 | Resendが配送状態を履歴とFailureInboxへ反映する | POST raw body → size・Svix署名 → outbox照合 → delivery update / issue | provider event ID、history、failure inbox | 通知履歴、Dashboard不達 | 偽造、重複、古いevent、outbox不一致で状態を汚さない。body・宛先をlogへ出さない | 新規通知なし | HTTP Function | 非該当 | 実装済み | `convex/notificationOutbox/resendWebhook.test.ts`、`convex/_lib/resendWebhookSignature.test.ts` |
| `HTTP-STRIPE-WEBHOOK-01` | P0 | Stripeが署名済み課金eventを一度だけ処理する | POST raw body（128 KiB以下）→ Stripe署名（header 4096文字以下）・livemode → event保存 / claim → verified state convergence | webhook event、operation、subscription snapshot | entitlement、利用上限 | 過大body・署名、偽造、event replay、別mode、object不整合、古いeventで課金状態を変更しない | シフトリの課金メールは作成しない。Stripeの決済関連通知は外部設定 | HTTP Function | 非該当 | 実装済み | `convex/organizationStripe/webhook.test.ts`、`convex/organizationStripe/processor.test.ts` |
| `HTTP-ANALYTICS-01` | P0 | 内部BI Workerが固定された12種類の分析queryを呼ぶ | POST → service credential・size・schema・rate limit → internal query → bounded DTO | read-only。rate limit stateだけ更新 | Analytics Dashboard、要望一覧 | secret不一致、任意function、存在しないID、過大response、query失敗を安全なstatusへ変換し、PII・secretをlogへ出さない | なし | HTTP Function | 非該当 | 実装済み | `convex/analyticsDashboard/httpActions.test.ts`、`convex/analyticsDashboard/queries.test.ts` |
| `PUBLIC-STATIC-01` | P1 | 未ログイン利用者がTOP、機能、ヘルプ、記事、法務を閲覧する | build時prerender → canonical HTML → browser hydration | 公開contentと生成artifact | 検索、登録、問い合わせ、ヘルプ | draft、CSR shell、noindex routeをsitemapへ含めない。H1、canonical、metadata、404を生成物で検査 | なし | Logic / build検証 | Desktop / MobileをVRTで補助 | 実装済み | `scripts/staticSite.test.ts`、`scripts/sitemap.test.ts`、`src/components/features/ArticleSite/articleContent.test.ts`、公開page Story |
| `PUBLIC-DEMO-01` | P2 | 未登録利用者がシフト表の入力と確定操作を保存なしで試す | demo開始 → 勤務時間入力・調整 → reset / 確定 | browser内のdemo stateだけ | 機能理解 | 実データ・Convex・通知を変更しない | なし | Behavior | Desktop | 実装済み | `src/components/features/Demo/DemoShiftBoardPage/index.stories.tsx` |
| `ANALYTICS-PIPELINE-01` | P1 | cron / operatorがsource eventから完全な日次snapshotを作り、失敗後も次日を公開する | source capture → projection → daily run → complete / failed → weekly retention | run、projection、snapshot、generation | 内部BI、利用候補、KPI | running / failedの途中行を公開せず、欠損を0にしない。reset世代を混ぜない | なし | Convex Scenario | 非該当 | 実装済み | `convex/analytics/pipeline.test.ts`、`convex/analytics/invariants.test.ts`、`convex/_scenario/analyticsNightly.test.ts` |
| `ANALYTICS-DASHBOARD-01` | P1 | 内部担当者が集計をroute別に比較し、JSONLを書き出す | Cloudflare Access → Worker BFF → `HTTP-ANALYTICS-01` | URL queryとlocal download。アプリDBへ書かない | 内部分析 | 本体Full RegressionへUI stateを取り込まず、PII・credentialをJSONLへ出さない | なし | lint / type-check / build | Desktop / Mobile | 対象外（本体UI test対象外）。代替CIは`TEST-ANALYTICS-BUILD-01` | `apps/analytics-dashboard/AGENTS.md`、`doc/features/analytics-dashboard.md` |

## Browser-only契約とCI gate

| 契約ID | 守る失敗境界 | 主担当 / 実行条件 | 状態 | 根拠 |
|---|---|---|---|---|
| `E2E-AUTH-01` | 匿名で保護routeを開くと元の遷移先付きでloginへ戻る | Desktop Chrome / core E2E | 実装済み | `e2e/scenarios/auth-pages.test.ts` |
| `E2E-AUTH-02` | logout後に同じ保護routeへ再アクセスしてもsessionを再利用しない | Desktop Chrome / 専用actor | 実装済み | `e2e/scenarios/auth-logout.test.ts` |
| `E2E-SETUP-01` | Clerk認証、frontend、Convexを接続し、`/dashboard`からプロモーションコード空欄で1組織、1店舗、管理者本人、2か月のTrialを作る | Desktop Chrome / core E2E | 実装済み | `e2e/scenarios/manager-setup.test.ts` |
| `E2E-STAFF-01` | 新appの全店舗表示から対象店舗を選んでスタッフを削除し、同じメールアドレスを管理者手入力で削除履歴の特別確認なしに再追加して、reload後も新しいスタッフを表示する | Desktop Chrome / core E2E。個人情報を含むartifactは保存しない | 実装済み。Preview実行未確認 | `e2e/pages/AppStaffPage.ts`、`e2e/pages/StaffLifecyclePage.ts`、`e2e/scenarios/staff-lifecycle.test.ts` |
| `E2E-SHIFT-01` | `/shifts`の「すべて」表示から対象店舗を選んで募集し、店舗名付きカードと共通ヘッダー付きシフト表を経て、匿名staff提出、管理者確定、別匿名context閲覧を実接続する | Desktop Chrome / core E2E。Dashboard固定店舗のStep省略と確認表示はStorybook Behaviorが主担当 | 実装済み。Preview実行未確認 | `e2e/pages/AppShiftsPage.ts`、`e2e/scenarios/first-shift-delivery.test.ts`、`src/components/features/CreateRecruitmentForm/index.stories.tsx` |
| `E2E-TENANT-01` | 同じmanagerが二組織を往復し、選択店舗の表示を混ぜない | Desktop Chrome / E2E Preview | 実装済み | `e2e/scenarios/tenant-switching.test.ts` |
| `E2E-MEMBERSHIP-01` | UIから対象店舗の所属を追加・解除し、reload後も元店舗の所属を維持する | Desktop Chrome / E2E Preview | 実装済み | `e2e/scenarios/shop-staff-membership.test.ts` |
| `E2E-SHOP-01` | UIから2店舗目を追加し、`/shifts`の全店舗filterへの反映、切替、更新、削除、安全な店舗への復帰を実接続する | Desktop Chrome / E2E Preview | 実装済み。Preview実行未確認 | `e2e/scenarios/shop-lifecycle.test.ts` |
| `E2E-ORGANIZATION-01` | UIから2組織目を作成・改名し、reloadと往復切替後も組織contextを混ぜない | Desktop Chrome / E2E Preview | 実装済み。Preview実行未確認 | `e2e/scenarios/organization-lifecycle.test.ts` |
| `E2E-ORGANIZATION-02` | UIから追加組織を削除し、残存組織へ復帰してreload後も削除組織を表示しない | Desktop Chrome / E2E Preview | 実装済み。Preview実行未確認 | `e2e/scenarios/organization-lifecycle.test.ts` |
| `E2E-MANAGER-01` | 管理画面から管理者設定を開き、既存スタッフへの招待を発行し、reload後の招待中を確認して取り消し、スタッフタブへ戻る | Desktop Chrome / E2E Preview、通知配送dry-run、trace・screenshot・video off | 実装済み。Preview実行未確認 | `e2e/scenarios/manager-settings.test.ts` |
| `E2E-MANAGER-02` | 別Clerk actorが招待を受諾し、管理者権限の取得・解除後の拒否とスタッフ所属維持を確認する | Desktop Chrome / E2E Preview、通知配送dry-run、trace・screenshot・video off | 実装済み。Preview実行未確認 | `e2e/scenarios/manager-lifecycle.test.ts` |
| `E2E-NAV-01` | canonical組織scopeを保持して新appのスタッフ画面へ移動し、親ナビの現在地と実人物rowの店舗所属を表示する | Desktop Chrome / core E2E。人物情報を含むartifactは保存しない | 実装済み。Preview実行未確認 | `e2e/scenarios/app-navigation.test.ts` |
| `E2E-MOBILE-01` | Mobile Chromeでstaff提出の代表日を選び完了する | Mobile Chrome / core E2E | 実装済み | `e2e/scenarios/release-support-staff-submit.mobile.test.ts` |
| `DEPLOY-SMOKE-HTTP-01` | Previewで代表公開route、slash URL、CSR shell、未知URL 404が実配信される | Deployed Smoke / Preview URL | 実装済み。実Preview未実行 | `e2e/scenarios/deployed-smoke.test.ts`、`scripts/assertDeployedSmokeResults.mjs` |
| `DEPLOY-SMOKE-BROWSER-01` | Previewの代表公開pageがhydrateし、固有landmark・CTAを表示し、`pageerror`を出さない | Deployed Smoke / Preview URL | 実装済み。実Preview未実行 | `e2e/scenarios/deployed-smoke.test.ts`、`scripts/assertDeployedSmokeResults.mjs` |
| `TEST-PUBLIC-SURFACE-01` | Public Convex functionの追加・削除時にFull Regression台帳の件数またはexport一覧を更新し忘れない | lint / `pnpm docs:check`。生成`api.d.ts`と完全一致 | 実装済み。GitHub Actions未実行 | `scripts/checkDocs.ts`、`scripts/checkDocs.test.ts`、`package.json` |
| `TEST-VRT-BASELINE-01` | PRでVRT baseline directory欠落または画像0件を成功扱いにしない | CI。base branchの明示bootstrapだけを許可 | 実装済み。GitHub Actions未実行 | `scripts/prepareRegSuitBaseline.test.ts`、`.github/workflows/vrt.yml` |
| `TEST-DEPLOY-SMOKE-01` | HTTPとbrowserの両Smokeをexactly once、skip・retryなしで検査する | CI / Playwright JSON result gate | 実装済み。GitHub Actions未実行 | `scripts/assertDeployedSmokeResults.mjs`、`scripts/assertDeployedSmokeResults.test.ts`、`package.json`、`.github/workflows/deploy.yml` |
| `TEST-ANALYTICS-BUILD-01` | 内部BI変更時に専用lint、type-check、buildを実行する | secret不要CI / path filter | 実装済み。GitHub Actions未実行 | `.github/workflows/analytics-dashboard.yml` |

VRTは代表状態の見た目を守るが、契約表で静的文言を総当たりしない。
Mobile VRTはviewport指定だけでなく`vrt-mobile1`または`vrt-mobile2` tagを持つStoryだけを対象とする。

## Route inventory

| Route群 | 現行入口 | 契約ID / 主担当 |
|---|---|---|
| 公開コンテンツ | `/`、`/features`、`/commercial-transactions`、`/help`、`/help/:slug`、`/articles`、`/articles/:slug`、`/articles/categories/:categorySlug`、`/demo/shiftboard`、`/terms*`、`/privacy*`、`/contact` | `PUBLIC-STATIC-01`、`PUBLIC-DEMO-01`、`HTTP-CONTACT-01`。build、Behavior、VRT、Deployed Smoke |
| 認証 | `/login`、`/signup`、`/forgot-password`、`/sso-callback`、`/account` | `AUTH-MANAGER-01`、`AUTH-ACCOUNT-METHODS-01`、`DELETE-ACCOUNT-01`。Frontend Unit、Behavior、Function、Scenario、E2E |
| 認証済みアプリ | `/dashboard`、`/shifts*`、`/staff*`、`/actions`、`/manage`、`/manage/organization`、`/manage/shops/:shopId`、`/manage/managers*`、`/manage/billing` | `AUTH-TENANT-01`、`ORG-CONTEXT-01`、`SHOP-LIFECYCLE-01`、`PERSON-MEMBERSHIP-01`、`STAFF-ORDER-01`、`MANAGER-INVITATION-01`、`BILLING-CHECKOUT-01`、`SHIFT-BOARD-DRAFT-01`。Function、Scenario、代表E2E |
| staff / Capability | `/shifts/submit`、`/shifts/submit/completed`、`/shifts/view`、`/shifts/reissue`、`/staff/register`、`/legal/staff/consent`、`/line/callback` | `CAP-SHIFT-SESSION-01`、`SHIFT-SUBMISSION-01`、`SHIFT-VIEW-REISSUE-01`、`STAFF-REGISTRATION-01`、`CAP-LEGAL-01`、`CAP-LINE-LINK-01`。Function、Scenario、代表E2E |
| 招待 | `/manager-invite` | `MANAGER-INVITATION-01`。本人確認とtoken lifecycleをFunction、Scenario、専用Preview deploymentのE2Eで検証する |
| 回復・終端 | `/account-deletion-accepted`、`/cache-reset`、未知route | `DELETE-ACCOUNT-01`、`PUBLIC-STATIC-01`。Frontend Unit、build、Deployed Smoke |
| 内部BI | `/`、`/organizations*`、`/shops*`、`/requests`（`apps/analytics-dashboard/`） | `ANALYTICS-DASHBOARD-01`。本体UI suite対象外、専用lint / type-check / build |

認証済みHomeのcanonical URLは`/dashboard`、本人用Accountのcanonical URLは`/account`である。
`/app`は`/dashboard`へreplaceし、旧`/app/shifts*`、`/app/staff*`、`/app/actions`、`/app/manage*`は対応する正規URLへreplaceする。
削除した`/app/home`、`/app/account`、旧`/settings*`、`/users/*`、`/shops/*`、`/shiftboard/*`には互換redirectを設けず、static artifactとDeployed Smokeで404を確認する。

## Public Convex surface inventory

2026-09-01時点のpublic query、mutation、actionは133個である。
同じ業務境界のAPIは一行へまとめるが、公開export名は省略しない。

| Module | Public exports | 対応契約 / 状態 |
|---|---|---|
| `accountDeletion/queries` | `getDeletionPreview` | `DELETE-ACCOUNT-01`。本人の全所属から最小previewを返す |
| `accountEmail/actions` | `syncMyPrimaryEmail` | `AUTH-ACCOUNT-EMAIL-COMPAT-01`。実装済みcompat stub |
| `accountEmail/mutations` | `preflight` | `AUTH-ACCOUNT-EMAIL-COMPAT-01`。実装済みcompat stub |
| `appOrganization/actionInboxQueries` | `getActionInbox` | `RECRUITMENT-01`、`STAFF-REGISTRATION-01`、`NOTIFY-FAILURE-01`、`MANAGER-INVITATION-01`。canonical組織と店舗filterで未解決の対応を投影する |
| `appOrganization/detailQueries` | `getUserDetail` | `PERSON-MEMBERSHIP-01`、`PERSON-ROLE-01`。canonical組織をauthority anchorに人物詳細を返す |
| `appOrganization/manageQueries` | `getManageOverview`、`listOrganizationShops`、`getBillingOverview`、`getManagerSettingsOverview`、`getManagerCandidates` | `ORG-CONTEXT-01`、`SHOP-LIFECYCLE-01`、`BILLING-ENTITLEMENT-01`、`MANAGER-INVITATION-01`。組織を明示したManage配下の表示DTOを返す |
| `appOrganization/queries` | `listMyOrganizationContexts`、`getOrganizationContext`、`listOrganizationShops`、`listOrganizationActiveShops`（rolling互換）、`listOrganizationRecruitments`、`listOrganizationPeople`、`getOrganizationPeopleSummary` | `AUTH-TENANT-01`、`ORG-CONTEXT-01`、`RECRUITMENT-01`、`PERSON-MEMBERSHIP-01`。新app shellの組織、店舗、募集、人物をbounded paginationで返す |
| `appOrganization/staffOrderMutations` | `saveOrganizationStaffOrder` | `STAFF-ORDER-01`。actor、契約状態、人物集合、fingerprintを再確認して組織共通順を保存する |
| `appOrganization/staffOrderQueries` | `getOrganizationStaffOrderEditor`、`getOrganizationStaffOrderScope` | `STAFF-ORDER-01`。完全な人物集合と全店舗または店舗部分列をboundedに返し、不整合では既存順へ戻す |
| `dashboard/mutations` | `dismissOnboarding` | `DASHBOARD-ONBOARDING-01` |
| `dashboard/queries` | `getActiveDashboardAnnouncement`、`getActiveDashboardAnnouncements`、`getActiveDashboardAnnouncementsV2`、`getCurrentUser`、`getDashboardCurrentRecruitments`、`getDashboardPastRecruitments`、`getDashboardPlanUsage`、`getDashboardRecruitments`、`getDashboardShop`、`getDashboardStaffOrderScope`、`getDashboardStaffs`、`getMyShops`、`hasDashboardPastRecruitments` | `AUTH-TENANT-01`、`ORG-CONTEXT-01`、`RECRUITMENT-01`、`STAFF-ORDER-01`、`BILLING-ENTITLEMENT-01`、`DELETE-ACCOUNT-01`。実利用人数へ未承認招待を含めず、招待中件数を別表示し、上限評価不能を上限超過と区別する。旧announcement APIはrolling互換 |
| `featureRequest/mutations` | `submit`、`submitForOrganization`、`submitFromStaff` | `FEATURE-REQUEST-01`。`submitForOrganization`は検証済み店舗があれば店舗対象、なければ組織対象として保存する |
| `legal/mutations` | `acceptManagerLegalConsent`、`acceptStaffLegalConsent` | `LEGAL-CONSENT-01`、`CAP-LEGAL-01` |
| `legal/queries` | `getManagerConsentStatus`、`getStaffConsentPageData` | `LEGAL-CONSENT-01`、`CAP-LEGAL-01` |
| `line/actions` | `redeemLineToken` | `CAP-LINE-LINK-01` |
| `line/mutations` | `disconnectOrganizationPersonLine`、`generateLinkToken`、`sendInvite` | `CAP-LINE-LINK-01`。組織人物の解除はcanonical組織scopeを再検証する |
| `line/queries` | `getLinkStatusByShop`、`getQuotaStatus` | `CAP-LINE-LINK-01`。実装済みだが現行利用箇所がない場合は固定拡大前にinternal化または削除を再評価 |
| `notificationOutbox/mutations` | `resendFailure`、`resendOpenFailures`、`resolveFailure`、`retryFailure` | `NOTIFY-FAILURE-01`。`resendFailure`の`other`だけ`NOTIFY-OTHER-RESEND-01` |
| `notificationOutbox/queries` | `hasOpenFailures`、`listOpenFailures`、`listStaffNotificationHistory` | `NOTIFY-FAILURE-01`、`NOTIFY-HISTORY-01` |
| `organization/mutations` | `addShop`、`addShopForOrganization`、`deleteOrganization`、`deleteOrganizationForOrganization`、`deleteShop`、`removeManagerRoleForOrganization`、`removePersonFromOrganization`、`removePersonFromShop`、`updateOrganizationName`、`updateOrganizationNameForOrganization`、`updatePersonProfile` | `SHOP-LIFECYCLE-01`、`DELETE-SHOP-ORGANIZATION-01`、`DELETE-PERSON-01`、`PERSON-ROLE-01`、`ORG-PROFILE-01`。`ForOrganization`は新app用のcanonical組織境界である。店舗追加は認可・契約状態・上限を再確認し、削除は`isDeleted: false`から`true`への一方向だけとする |
| `organization/queries` | `getSettings` | `ORG-CONTEXT-01`、`DELETE-SHOP-ORGANIZATION-01`。店舗を起点に組織設定DTOを返す |
| `organization/userDetailQueries` | `getUserDetail` | `PERSON-MEMBERSHIP-01`、`PERSON-ROLE-01` |
| `organizationBilling/mutations` | `updateBillingEmail`、`updateBillingEmailForOrganization` | `BILLING-ENTITLEMENT-01`、`BILLING-PLAN-CHANGE-01`。認可、契約状態、上限整理・課金操作の許可、冪等性を副作用前に確認する |
| `organizationInvitation/acceptanceActions` | `accept` | `MANAGER-INVITATION-01`。確認済みemailまたは接続済みaccountと、tokenの状態を検証する |
| `organizationInvitation/mutations` | `issueForOrganization`、`resendForOrganization`、`revokeForOrganization` | `MANAGER-INVITATION-01`。canonical組織境界を再検証し、発行・再送・取消でtoken、上限、tenantを確認する |
| `organizationInvitation/queries` | `getPreview` | `MANAGER-INVITATION-01`。token、version、期限、失効状態を検証して最小DTOを返す |
| `organizationStripe/actions` | `cancelPendingCheckoutForOrganization`、`cancelScheduledPlanChange`、`cancelScheduledPlanChangeForOrganization`、`cancelTrialContinuation`、`cancelTrialContinuationForOrganization`、`changePaidPlanNow`、`changePaidPlanNowForOrganization`、`getCurrentSubscriptionPrice`、`getPlanPrice`、`getPlanPriceForOrganization`、`inspectPendingCheckoutForOrganization`、`openCustomerPortal`、`openCustomerPortalForOrganization`、`previewPaidPlanChange`、`previewPaidPlanChangeForOrganization`、`schedulePaidPlanChange`、`schedulePaidPlanChangeForOrganization`、`scheduleServiceStopAtPeriodEnd`、`scheduleServiceStopAtPeriodEndForOrganization`、`startPaidCheckout`、`startPaidCheckoutForOrganization` | `BILLING-CHECKOUT-01`、`BILLING-PLAN-CHANGE-01`、`BILLING-TRIAL-CANCEL-01`。`ForOrganization`は新app用のcanonical組織境界である。全public課金操作で認可、契約状態、Stripe設定、Priceを再確認し、Webhookとinternal workerの収束を維持する |
| `recruitment/mutations` | `createRecruitment`、`deleteRecruitment` | `RECRUITMENT-01` |
| `setup/mutations` | `createOrganization`、`createOrganizationForApp`、`setupShopAndManager`、`verifyPromotionCode` | `ORG-CREATE-01`、`SETUP-ORGANIZATION-01`。初回Setupと追加組織で開始条件、作成プラン、上限を分け、プロモーションコードは作成前と最終Setupで照合する |
| `shiftBoard/mutations` | `confirmRecruitment`、`saveShiftAssignments` | `SHIFT-BOARD-DRAFT-01`、`SHIFT-CONFIRM-01` |
| `shiftBoard/queries` | `getShiftBoardData`、`getShiftBoardShopScopeForOrganization` | `SHIFT-BOARD-DRAFT-01`。新appはcanonical組織で店舗scopeを検証する |
| `shiftSubmission/mutations` | `submitShiftRequests` | `SHIFT-SUBMISSION-01` |
| `shiftSubmission/queries` | `getSubmissionPageData`、`getSubmissionResult` | `SHIFT-SUBMISSION-01`、`SHIFT-SUBMISSION-RESULT-01` |
| `shiftView/queries` | `getShiftViewData` | `SHIFT-VIEW-REISSUE-01` |
| `shop/mutations` | `deleteShop`、`updateShopSetting`、`updateShopSettings` | `SHOP-LIFECYCLE-01`、`DELETE-SHOP-ORGANIZATION-01`。旧店舗model互換APIは新規利用を増やさない |
| `staff/mutations` | `addOrganizationPersonToShop`、`addStaffs`、`changeOrganizationPersonShopMemberships`、`changeOrganizationShopStaffMemberships`、`sendCurrentShiftNotification`、`sendOpenRecruitmentNotifications`、`setShiftExclusion` | `PERSON-MEMBERSHIP-01`、`DELETE-PERSON-01`、`SHIFT-ELIGIBILITY-01`、`NOTIFY-FANOUT-01`。店舗追加と複数店舗所属を含め、認証、組織境界、管理者状態、契約状態、人物上限を再確認する |
| `staff/queries` | `getNotificationResendCooldowns`、`getOrganizationShopStaffMembershipChange`、`listOrganizationPeopleAvailableForShop`、`previewOrganizationShopStaffMembershipRemovals` | `PERSON-MEMBERSHIP-01`、`DELETE-PERSON-01`、`NOTIFY-FANOUT-01` |
| `staffAuth/mutations` | `requestReissue`、`verifyToken` | `CAP-SHIFT-SESSION-01`、`SHIFT-VIEW-REISSUE-01` |
| `staffAuth/queries` | `getRecruitmentInfo` | `SHIFT-VIEW-REISSUE-01` |
| `staffRegistration/mutations` | `approveRequest`、`ensureShopRegistrationLink`、`rejectRequest`、`rotateShopRegistrationLink` | `STAFF-REGISTRATION-01`、`CAP-REGISTRATION-LINK-01` |
| `staffRegistration/queries` | `getActiveRegistrationLink`、`getPendingRequests`、`getRegistrationPageData` | `STAFF-REGISTRATION-01`、`CAP-REGISTRATION-LINK-01` |

利用箇所がないpublic functionは、テストを増やして外部形状を固定する前に削除またはinternal化を検討する。
互換APIは対応する終了条件を持つ変更でのみ削除し、この表のexport一覧も同時に更新する。

## Public HTTP surface inventory

| Method / path | Actorと認証 | 契約ID | 状態 / 根拠 |
|---|---|---|---|
| `OPTIONS /account-deletion/request` | browser / 明示Origin | `HTTP-ACCOUNT-DELETION-01` | 実装済み。`convex/accountDeletion/httpActions.test.ts` |
| `POST /account-deletion/request` | Clerk Bearer session + strict再認証 | `HTTP-ACCOUNT-DELETION-01` | 実装済み。同上 |
| `POST /line/webhook` | LINE署名 | `HTTP-LINE-WEBHOOK-01` | 実装済み。`convex/line/webhook.test.ts` |
| `OPTIONS /contact/submit` | browser / 明示Origin | `HTTP-CONTACT-01` | 実装済み。`convex/contact/httpActions.test.ts` |
| `POST /contact/submit` | 匿名 + Turnstile | `HTTP-CONTACT-01` | 一部。HTTP境界は実装済み、replay期待契約は未決 |
| `OPTIONS /staff-registration/submit` | browser / 明示Origin | `HTTP-STAFF-REGISTRATION-01` | 実装済み。`convex/staffRegistration/httpActions.test.ts` |
| `POST /staff-registration/submit` | 匿名 + Turnstile | `HTTP-STAFF-REGISTRATION-01` | 実装済み。同上 |
| `POST /resend/webhook` | Resend / Svix署名 | `HTTP-RESEND-WEBHOOK-01` | 実装済み。`convex/notificationOutbox/resendWebhook.test.ts` |
| `POST /stripe/webhook` | Stripe署名 | `HTTP-STRIPE-WEBHOOK-01` | 実装済み。`convex/organizationStripe/webhook.test.ts` |
| `POST /analytics-dashboard/query` | Worker service credential | `HTTP-ANALYTICS-01` | 実装済み。`convex/analyticsDashboard/httpActions.test.ts` |

## 未決事項と再評価条件

| 契約ID | 現在の扱い | 決めること | 再評価条件 |
|---|---|---|---|
| `NOTIFY-OTHER-RESEND-01` | 対象外 | Dashboard非表示の`other`をpublic mutationでも拒否するか、ID指定時だけ許可するか | 製品判断後に、拒否時副作用0または許可時scope・quotaのFunction Testを追加する |
| `HTTP-CONTACT-01`のreplay | 一部 | 同一`requestId`を一処理意図として抑止するか、ResendとSlackへ安定idempotencyを与えるか | 期待契約確定後にHTTP FunctionまたはScenarioへ外部副作用件数を追加する |
| `SETUP-ORGANIZATION-01`の事前照合 | 一部 | 認証済みpublic mutationの直接呼出しにも有効なserver-side quotaと拒否時副作用0を実装する | rate limitのFunction Testを追加し、frontendの10回・10分制限だけを安全境界にしない |
| `AI-SHIFT-DRAFT-01` | 未実装 | 業務要件にある有料機能について、入力、生成結果、承認境界、安全契約を決める | 要件判断後に現行実装仕様、主担当テスト層、根拠テストを追加する |
| 利用箇所のないpublic API | 一部 | `line.queries.getLinkStatusByShop`、`getQuotaStatus`、旧Stripe wrapper等を削除・internal化・互換維持のどれにするか | client利用箇所とrolling deploy終了条件を確認した変更で整理する |

## Full Regression完了条件

- P0契約に未分類、主担当層未定、根拠テスト未指定がない。
- 利用中のpublic Convex exportとHTTP routeが、この文書の契約IDへ対応している。
- 通知purposeごとに対象、channel、CTA、dedupe、不在条件をFunctionまたはScenarioで確認している。
- submit / view / LINE / legal / registrationのCapabilityでscope、各contractが定めるTTLまたは再利用条件、失効条件、削除後の拒否を確認している。
- 課金、通知、削除のworkflowが中断、replay、stale worker、削除競合から収束する。
- core E2Eのdesktop 13契約とmobile 1契約、Deployed Smokeの2契約を、欠落、重複、skip、retryなしでCIが検査する。
- VRT baseline欠落をPR成功にせず、内部BI変更時に専用lint、type-check、buildを実行する。
- `対象外`には理由と再評価条件があり、理由のないskipをcoverage済みと数えない。
- Production availability、migration完了、provider実到着は、同じrevisionの運用証跡として別に確認する。

## 参考にした正本

- `doc/features/INDEX.md`と各機能文書
- `doc/rules/testing-strategy.md`
- `doc/rules/security-strategy.md`
- `doc/rules/convex-design-strategy.md`
- `src/routes/`
- `convex/http.ts`
- `convex/_generated/api.d.ts`
- `e2e/scenarios/`
- `scripts/assertE2ECoreResults.mjs`
- `vitest.config.ts`
- `vitest.vrt.config.ts`
- `playwright.config.ts`
- `playwright.deployed.config.ts`
- `.github/workflows/`
