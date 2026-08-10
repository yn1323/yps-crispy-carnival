# Dashboardプランカードの利用状況表示と配色統一 実装計画

作成日: 2026-08-11
状態: implemented
対象: Dashboardのプランカード、利用状況query、関連するFrontend Unit Test、Convex Function Test、Storybook、VRT、機能文書

## 1. 結論

Dashboardのプランカードは、承認済みの提案画像に合わせて、展開時に「説明・契約情報」「プランと支払いへの操作」「利用状況」の3段構成へ変更する。

利用状況には進捗バーを置かず、通常は「スタッフ」と「店舗」の現在値と上限だけを2列で表示する。
管理者数は既存の`FEATURE_MANAGER_INVITATION`が厳密に`enabled`のときだけ3列目へ表示し、閉状態ではサーバーのDTOからも項目を省略する。

トライアル、支払い確認中、支払い問題、契約制限中は、状態色をアイコン、badge、説明面へ限定する。
独自のorange・red gradient buttonを廃止し、通常の遷移はteal、支払い復旧は状態に対応する標準outline、補助操作はgray outlineへ統一する。

利用数はDashboard初期表示へ直足ししない。
アコーディオンを開いている間だけ認可付きread-only queryを購読し、閉じた状態では`"skip"`にする。
既存の課金stateと利用状況を読むだけなので、schema変更、migration、backfillは行わない。

## 2. 利用者のタスク

主な利用者は、Dashboardで現在の契約と運用可能量を確認する管理者である。

カードを閉じているときは、現在のプランと要対応状態だけを短く把握できる。
カードを開くと、次の情報と操作を一か所で確認できる。

- 現在の契約説明、次回更新日、料金、支払い状態
- プラン選択、支払い確認、支払い復旧への導線
- 組織全体のスタッフ利用数と店舗数の現在値・上限
- 管理者機能の公開中だけ、管理者数の現在値・上限

完了条件は、カードを開くだけで「今の契約で、あとどれだけ利用できるか」と「次に行う操作」が判別できることである。

## 3. 現在の実装と変更理由

| 対象 | 現在の挙動 | 変更理由 |
|---|---|---|
| `PlanStatusCard/index.tsx` | paid・freeは王冠、42pxの塗り円、状態色付きopen borderを使う | 現在適用中の意味が弱く、Dashboardの他カードより装飾が強い |
| paidの展開部 | `teal.50`の説明面と、カード下端全幅のplain linkを使う | 操作境界が曖昧で、承認済みのoutline button構成と異なる |
| trial・paymentIssue | orange・redの独自gradient buttonを使う | Dashboardと組織設定の標準Buttonから大きく外れる |
| paymentPending・grace・restricted | 同じ警告色またはエラー色を状態面とCTAの両方へ使う | 情報、警告、エラーと、操作の種類が区別されていない |
| `getDashboardShop` | `planStatus`は返すが利用数は返さない | スタッフ・店舗の現在値と上限を表示できない |
| `getOrganizationUsageSnapshot` | 組織全体の利用人数、active店舗、管理者、予約枠を算出する | 課金上限と一致する既存の正本なので、新しい数え方を追加しない |
| `FEATURE_MANAGER_INVITATION` | 未設定を閉状態にし、管理者招待UIをserver側からhiddenへ投影する | 管理者数も同じ公開境界へ揃えられる |

`getOrganizationUsageSnapshot`は、組織人物・管理者所属・店舗・招待を読み、人物ごとのstaff履歴も確認する。
Dashboard初期表示の`getDashboardShop`へ追加すると、既存のスタッフqueryと読み取りが重複するため、折りたたみ領域専用queryへ分離する。

## 4. UI契約

### 4.1 展開時の構造

```text
┌────────────────────────────────────┐
│ [適用中icon] Businessプラン [支払い不要] ︿ │
├────────────────────────────────────┤
│ Businessプランの機能を料金なしで利用できます。 │
│ [  プランと支払いを確認する  →  ]             │
├──────────────────┬─────────────────┤
│ [人物] 3 / 40人  │ [店舗] 1 / 5店舗 │
│        スタッフ   │        店舗       │
└──────────────────┴─────────────────┘
```

`FEATURE_MANAGER_INVITATION=enabled`のときだけ、利用状況を3等分して右端へ「管理者」を追加する。
閉状態では2列を均等幅にし、空の3列目や不要なdividerを残さない。

### 4.2 カードと見出し

- paid・freeの王冠を`LuBadgeCheck`へ変更し、「高級プラン」ではなく「現在適用中」を表す。
- iconは承認済み画像に合わせ、36pxの低階調teal面とteal foregroundの線画にする。
- 外枠はwhite、neutral border、弱いshadowへ揃え、open時も状態色のborderへ切り替えない。
- 状態色はheaderのicon・badgeと、展開中の説明面だけに使う。
- プラン名はDashboard内のカード見出しと同じresponsive scaleへ寄せ、`base: lg`、広い画面で`xl`を上限にする。
- 説明、契約情報、buttonは既存の`sm`から`md`のtext styleを使い、局所的な独自font sizeを増やさない。
- badgeと利用状況labelは`xs`、数値はtabular numberとsemibold以上を使う。

### 4.3 利用状況

- 進捗バー、meter、残量barは表示しない。
- 1列をicon、`current / max`、labelのまとまりとし、列全体は操作要素にしない。
- 表示labelは依頼どおり「スタッフ」「店舗」「管理者」とする。
- 数値のaccessible nameにはlabel、現在値、上限、単位を含める。
- queryの読み込み中は利用状況部分だけに局所Skeletonを置き、Dashboard全体をLoadingへ戻さない。
- queryが`null`の場合は、根拠のない`0 / 0`や推測値を表示せず、利用状況部分だけを描画しない。

## 5. 利用状況のデータ契約

### 5.1 新しいread-only query

`convex/dashboard/queries.ts`へ、アコーディオン専用の`getDashboardPlanUsage`を追加する。
招待期限の判定を決定的にするため、引数は`{ now: v.number() }`とし、既存の`managerQuery`が選択店舗の`shopId`を受け取る。

```ts
{
  peopleUsage: { current: number; max: number };
  shopUsage: { current: number; max: number };
  managerUsage?: { current: number; max: number };
} | null
```

- `managerQuery`を使い、既存の選択店舗・組織所属・人物の認可境界を再利用する。
- browserから`organizationId`を受け取らず、認可済みの`ctx.organization`から対象組織を決める。
- controllerがアコーディオンを開いた時刻を`now`として固定し、query内へ新しい`Date.now()`を置かない。
- `FEATURE_BILLING`が閉じている、課金stateがない、または信頼できる適用上限を確定できない場合は`null`を返す。
- 通常状態の上限は`deriveOrganizationBillingPolicy(...).limits`を使う。
- 契約制限中は`resolveRestrictedLimitPlan`で上限プランを確定できる場合だけ、その上限を使う。支払い制限中など上限が存在しない状態では、表示プランから推測しない。
- 返すのは集計値と上限だけにし、人物ID、氏名、メール、店舗ID、Stripe識別子を含めない。

### 5.2 現在値の意味

| DTO | currentの正本 | maxの正本 | 画面label |
|---|---|---|---|
| `peopleUsage` | `getOrganizationUsageSnapshot().projectedPersonCount` | `maxPeople` | スタッフ |
| `shopUsage` | `activeShopCount` | `maxActiveShops` | 店舗 |
| `managerUsage` | `projectedActiveManagerCount` | `maxActiveManagers` | 管理者 |

`peopleUsage`はrawの`staffs` row数ではない。
activeな組織人物を店舗横断で重複排除し、スタッフ履歴を持つ人物、active管理者、有効な予約枠を含む課金上の利用人数である。
画面labelは「スタッフ」とするが、backendと型の名前は意味を変えず`peopleUsage`を維持する。

管理者数は利用人数の内数であり、スタッフ数との合計値ではない。
有効な追加招待を含む現在値であることも、組織設定と同じ契約として機能文書へ記載する。

### 5.3 Frontendの購読状態

`usePlanStatusCardController`がアコーディオンの実際の開閉状態を所有し、次の状態へ変換する。

| 条件 | query | `PlanStatusCard`へ渡す値 |
|---|---|---|
| billing非公開、カード非表示、店舗未確定、折りたたみ中 | `"skip"` | 利用状況を描画しない |
| 展開直後 | 開いた時刻を固定して`{ now }`で購読開始 | `undefined`として局所Skeleton |
| 取得成功 | 購読継続 | 利用状況objectを表示 |
| serverが`null`を返す | 購読継続 | 利用状況を描画しない |
| 閉じる | `"skip"`へ戻す | 利用状況をunmount |
| 再び開く | 新しい開時刻で購読 | 期限切れの予約枠を再評価 |
| 店舗切替 | 旧購読を停止 | 旧店舗の数値を保持せず、新店舗で再判定 |

利用状況は全statusに共通するため、`PlanStatusCardData`の各union memberへ複製しない。
`PlanStatusCardProps`の共通`usage`へ置き、`undefined`、`null`、objectの3状態を明示する。

## 6. 状態とbuttonの配色契約

状態色と操作色を分離し、独自gradientを追加しない。

| 状態 | 状態の見せ方 | 主操作 | 補助操作 |
|---|---|---|---|
| paidPlan | 適用中iconとteal badge | 「プランと支払いへ／確認」は標準`outline teal` | なし |
| freePlan | 適用中iconとinfo面 | 選択可能なら「プランを選ぶ」は標準`solid teal`。閲覧だけなら`outline teal` | なし |
| trial・残り8日以上 | clockとinfo面 | 選択可能なら`solid teal`。選択済み・閲覧だけなら`outline teal` | 「後で確認する」は`outline gray` |
| trial・残り7日以内 | clockとwarning面。既存どおり自動展開 | buttonは通常trialと同じ | 「後で確認する」は`outline gray` |
| paymentPending | clockとinfo面 | 「プランと支払いを確認する」は`outline teal` | なし |
| paymentIssue・grace | alert iconとwarning面 | 「支払い方法を更新する」は標準`outline orange` | 「詳細を確認する」は`outline gray` |
| paymentIssue・restricted | alert iconとerror面 | 更新可能なら標準`outline red`。閲覧だけなら`outline gray` | 詳細は`outline gray` |
| restricted | alert iconとerror面 | 「プランと支払いを確認する」は`outline teal` | なし |

- 状態色のsolid buttonやgradientは使わない。
- buttonは共通recipeのhover、active、focusを使い、局所的なgradient用styleを持たない。
- 主要buttonはmobileで`minH="44px"`を維持する。
- paidのplain link stripを廃止し、承認済み画像のwhite、neutral outline、角丸buttonへ変更する。
- button文言、遷移先、`後で確認する`のclose・focus復帰、料金retryの局所動作は維持する。

## 7. Security Lens

| 項目 | 契約 |
|---|---|
| Actor | Clerkで認証され、選択店舗へactiveまたはreadOnlyで所属する管理者 |
| Asset | 組織単位の利用人数、店舗数、管理者数、各上限、課金操作可否 |
| Trust boundary | browserの選択店舗と開閉状態から、public Convex query、組織DB、server環境変数まで |
| Abuse case | 他組織のshop IDによる集計値の取得、flag閉状態での管理者数取得、全設定DTOによるPII過剰露出、開閉連打によるread amplification |
| Server-side enforcement | 既存`managerQuery`でidentity、店舗、組織、所属、人物を検証し、対象組織は`ctx.organization`から導出する。管理者flag閉状態ではfield自体を省略する |
| Rate limit / idempotency | 副作用のないqueryなので新しいrate limitとidempotency keyは追加しない。折りたたみ中は`"skip"`で購読しない |
| Lifecycle / recovery | active人物、activeかつ非削除店舗、有効期限内の予約枠・招待だけを現在値へ反映する。店舗切替時は旧値を破棄する |
| Logs / PII | 集計値だけを返し、ID、氏名、メール、token、Stripe識別子を新しいlogやDTOへ含めない |
| Regression test | tenant境界、最小DTO、flagのfail-closed、折りたたみ時の`"skip"`をFunction TestとFrontend Unit Testで固定する |

`FEATURE_MANAGER_INVITATION`は表示露出を制御するflagであり、認可根拠にはしない。
CSSや`VITE_*`だけで隠す実装にはしない。

## 8. 読み取りコストの扱い

`getOrganizationUsageSnapshot`は現時点で、組織人物、active管理者、active店舗、招待を`collect()`し、人物ごとにstaff履歴を確認する。
既存の課金上限と一致する正本なので今回は再利用するが、初期表示と折りたたみ中には実行しない。

今回の変更で新しいcounter、aggregate、table、cronは追加しない。
履歴件数が増えた組織でread量が問題になる場合は、transaction内で維持するcounterまたはAggregateへの移行を別計画として扱う。
この既存負債を理由に、別の数え方や上限でclampした不正確な値は返さない。

## 9. 実装対象

| ファイル | 変更内容 |
|---|---|
| `convex/dashboard/queries.ts` | 明示`now`を受け取る`getDashboardPlanUsage`、validator、適用上限の解決、最小DTO、feature flag境界を追加する |
| `convex/dashboard/queries.test.ts` | tenant、現在値・上限、同一組織の店舗間整合、flag閉・開、不要field非露出を検証する |
| `src/components/features/Dashboard/PlanStatusCard/types.ts` | 共通のusage DTOとloading・null契約を`PlanStatusCardProps`へ追加する |
| `src/components/features/Dashboard/PlanStatusCard/usePlanStatusCardController.ts` | accordion展開中だけqueryを購読し、店舗切替と自動展開へ追従する |
| `src/components/features/Dashboard/PlanStatusCard/usePlanStatusCardController.test.tsx` | `"skip"`、展開・再折りたたみ、店舗切替、loading・readyを検証する |
| `src/components/features/Dashboard/PlanStatusCard/index.tsx` | 承認済みレイアウト、2列・3列usage、icon、font、状態面、標準Buttonへ変更する |
| `src/components/features/Dashboard/PlanStatusCard/index.stories.tsx` | 代表status、usage loading、2列、管理者あり3列、開閉Behavior、mobile VRTを更新する |
| `src/components/features/Dashboard/DashboardContent/index.stories.tsx` | Dashboard全体のdesktop・mobile fixtureを新しいカードへ追従させる |
| `doc/features/organization-billing.md` | Dashboardの利用状況、表示labelと内部意味、管理者flag、遅延query、検証入口を現行仕様へ追加する |

既存の`getDashboardShop.planStatus`、価格取得Action、課金stateの表示変換、設定画面への遷移は維持する。
新しい汎用card、usage registry、global stateは追加しない。

## 10. テスト計画

### 10.1 Convex Function Test

`convex/dashboard/queries.test.ts`を主担当にする。

- 未認証、未所属店舗、別組織の明示shop IDでは値を返さない
- 同じ組織の複数店舗では、同じ組織単位の利用状況を返す
- 店舗横断の同一人物を一度だけ数え、予約枠を`peopleUsage.current`へ含める
- activeかつ非削除の店舗だけを`shopUsage.current`へ含める
- 現在stateに対応する適用上限を返す
- 適用上限を確定できない状態では`null`を返し、`0 / 0`を作らない
- `FEATURE_MANAGER_INVITATION`が未設定、`disabled`、`true`では`managerUsage` keyを返さない
- `FEATURE_MANAGER_INVITATION=enabled`でだけ、招待中を含む管理者数と上限を返す
- DTOにID、氏名、メール、Stripe識別子を含めない

人物の重複排除とプラン上限定数そのものは、既存の`organizationBilling/policy.test.ts`が主担当なので重複させない。

### 10.2 Frontend Unit Test

`usePlanStatusCardController.test.tsx`で購読ライフサイクルを検証する。

- billing非公開、店舗未確定、カード非表示、折りたたみ中はqueryを`"skip"`する
- 手動展開で現在店舗と固定した`now`を使ってqueryを開始し、閉じると再び`"skip"`する
- 閉じて再度開くと`now`を更新し、招待期限を再評価する
- 支払い問題と残り7日以内trialの自動展開では、初回からqueryを開始する
- 店舗切替時は旧店舗の利用数を表示せず、新店舗のloadingへ戻す
- `undefined`は利用状況部分のSkeleton、`null`は非表示、objectは2列または3列へ渡す
- 既存の価格Actionは有料カードを展開したときだけ開始し、usage queryと互いを待たない
- 既存のCTA、料金retry、古い価格応答の破棄、日付境界のテストを維持する

status、日付、価格の純粋変換を変えないため、`script.test.ts`はfixtureの型追従が必要な場合だけ更新する。

### 10.3 Storybook BehaviorとVRT

`PlanStatusCard/index.stories.tsx`で次を担当する。

- paidの閉状態から開き、利用状況regionが現れる
- `後で確認する`で閉じ、triggerへfocusが戻る既存契約を維持する
- 通常の2列、管理者公開中の3列、利用状況loadingを静的Storyにする
- Pro、Free、Business、支払い不要Business、変更予定を更新する
- trialの通常・残り7日以内、paymentPending、grace、paymentIssue restricted、上限によるrestrictedを更新する
- `ProPriceError`で料金retryだけが局所表示されることを維持する
- mobileでは長いプラン名、badge、button、2列・3列の折返しと44px操作領域を確認する

VRTは色tokenをDOM assertionせず、既存の`vrt-mobile1`対象とdesktop差分で視覚契約を確認する。

`DashboardContent/index.stories.tsx`では、Dashboard全体でプランカードがTODOより強く見えず、前後sectionとの余白とfont scaleが整うことを確認する。

### 10.4 追加しないテスト

新しい永続状態、mutation、外部副作用、複数APIにまたがる状態遷移はないため、Scenario TestとE2Eは追加しない。
認可とDTOはFunction Test、購読開始はFrontend Unit、操作はBehavior、見た目はVRTで分担する。

## 11. 実装順序

### Phase 0: 既存変更の保全

- 現在の未コミット変更を再確認し、依頼外の差分をrevert、削除、stageしない
- `convex/constants.ts`の未解決conflictはこの計画で解消せず、所有者の変更と競合しない状態を確認してから実装と全体検証へ進む
- untrackedの`PlanStatusCard/`と、変更中の`convex/dashboard/queries.ts`、`DashboardContent`、機能文書へ局所的に追記する

### Phase 1: 認可付き利用状況query

- validatorと`getDashboardPlanUsage`を追加する
- 既存の利用状況・billing policy・feature flagを組み合わせ、最小DTOを返す
- tenant、適用上限、flag、非露出のFunction Testを追加する

### Phase 2: 開閉に連動する購読

- controllerの開閉stateをqueryの`"skip"`条件へ接続する
- loading、null、ready、店舗切替を共通usage propへ変換する
- 価格Actionとusage queryを独立して開始する
- 対応するFrontend Unit Testを追加する

### Phase 3: カードUIと全statusの配色

- 王冠、外枠、font、paidのplain linkを承認済み構成へ変更する
- 進捗バーなしの2列・3列usage footerと局所Skeletonを追加する
- 全statusの説明面、icon、badge、buttonを配色表へ揃える
- gradientと局所的なButton hover・active styleを削除する
- keyboard、focus、accessible name、44px操作領域を維持する

### Phase 4: Storyと現行文書

- BehaviorとVRT Storyを更新する
- Dashboard全体Storyを追従させる
- `organization-billing.md`を現在仕様へ更新する

### Phase 5: 検証と自己レビュー

- targeted testを先に実行する
- repoの必須検証を実行する
- 不要なwrapper、重複する表示変換、依頼外の変更、古いgradient styleが残っていないか自己レビューする

## 12. 検証コマンド

対象testを先に実行する。

```bash
pnpm vitest run --project='convex(logic)' convex/dashboard/queries.test.ts

pnpm vitest run --project=logic \
  src/components/features/Dashboard/PlanStatusCard/usePlanStatusCardController.test.tsx \
  src/components/features/Dashboard/PlanStatusCard/script.test.ts

pnpm vitest run --project=ui \
  src/components/features/Dashboard/PlanStatusCard/index.stories.tsx \
  src/components/features/Dashboard/DashboardContent/index.stories.tsx
```

最後に次を実行する。

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

Vite、Storybook、Convexの開発サーバーは新規起動しない。
VRTはGitHub Actionsの差分確認へ委ねる。

`convex/constants.ts`の未解決conflictが残る間は、targeted testを含む検証結果をコード不具合の証跡として扱わない。
conflict解消後に同じrevisionで再実行する。

## 13. Rollout

新しいqueryを含むbackendを先に反映し、その後にusage queryを呼ぶfrontendを反映する。
既存のrelease workflowもConvexからwebの順にdeployする。

新backendと旧frontendの組み合わせでは、新queryは呼ばれない。
frontend側はqueryの`null`を安全に非表示へ変換する。
新しい保存形式がないため、Widen・migration・Narrowのデータ移行は不要である。

`FEATURE_MANAGER_INVITATION`の値は既存運用を変更しない。
未設定deploymentでは管理者列を閉じたままにし、このUIのためにProduction設定を変更しない。

## 14. 対象外

- 課金プラン、料金、上限定数、権限policyの変更
- `FEATURE_MANAGER_INVITATION`の公開判断やProduction設定変更
- 管理者数を別のfeature flagへ分割すること
- 課金人数をrawスタッフrow数へ変更すること
- usage用counter、Aggregate、table、cron、migrationの導入
- 組織設定画面のUsageMeterやプラン比較カードの再設計
- DashboardのTODO、シフト一覧、店舗切替、他のcalloutの再設計
- commit、push、Pull Request、deploy

## 15. 完了条件

- paid・freeの王冠が適用中を表すbadge-check iconへ変わる
- カードのfont、border、shadow、余白がDashboardの周辺sectionと調和する
- paidのplain linkが承認済みのoutline buttonへ変わる
- trial、pending、grace、payment issue、restrictedのgradientと過剰なsolid状態色buttonがなくなる
- 各状態の説明面とbuttonが状態・操作matrixどおりになる
- 展開時だけ利用状況queryを購読し、閉じると停止する
- 通常は「スタッフ」「店舗」の2列を、バーなしで表示する
- `FEATURE_MANAGER_INVITATION=enabled`でだけ「管理者」の3列目を表示し、それ以外ではDTOにも空列にも残さない
- スタッフ、店舗、管理者のcurrentとmaxが既存の課金正本と一致する
- 店舗切替、loading、利用状況非表示、価格取得失敗でもカード全体を失わない
- 他組織の利用状況と管理者flag閉状態の値を取得できない
- 既存の開閉、auto expand、focus復帰、CTA、料金lazy loadを維持する
- Function Test、Frontend Unit、Storybook Behavior、VRTで各契約を重複なく検証する
- 機能文書と実装が一致し、schema変更とmigrationがない
- 依頼外の未コミット変更を保持し、全検証をconflict解消後の同じrevisionで通す

## 16. 参考にしたファイル

- `AGENTS.md`
- `src/AGENTS.md`
- `convex/AGENTS.md`
- `doc/rules/ui-design.md`
- `doc/rules/frontend-architecture.md`
- `doc/rules/testing-strategy.md`
- `doc/rules/security-strategy.md`
- `doc/rules/convex-design-strategy.md`
- `convex/_generated/ai/guidelines.md`
- `src/components/features/Dashboard/PlanStatusCard/index.tsx`
- `src/components/features/Dashboard/PlanStatusCard/types.ts`
- `src/components/features/Dashboard/PlanStatusCard/script.ts`
- `src/components/features/Dashboard/PlanStatusCard/usePlanStatusCardController.ts`
- `src/components/features/Dashboard/PlanStatusCard/script.test.ts`
- `src/components/features/Dashboard/PlanStatusCard/usePlanStatusCardController.test.tsx`
- `src/components/features/Dashboard/PlanStatusCard/index.stories.tsx`
- `src/components/features/Dashboard/DashboardContent/index.stories.tsx`
- `src/components/features/Dashboard/TrialEndingCallout/index.tsx`
- `src/components/features/OrganizationSettings/PlanAndPaymentSection.tsx`
- `src/configs/theme/recipes/button.ts`
- `src/hooks/useShopQuery.ts`
- `convex/dashboard/queries.ts`
- `convex/dashboard/queries.test.ts`
- `convex/_lib/config.ts`
- `convex/_lib/functions.ts`
- `convex/organization/service.ts`
- `convex/organization/queries.ts`
- `convex/organization/managerInvitationState.ts`
- `convex/organizationBilling/policy.ts`
- `convex/organizationBilling/policy.test.ts`
- `scripts/setupEnv.ts`
- `doc/features/organization-billing.md`
- `.github/workflows/release.yml`
- `.github/workflows/deploy.yml`

## 17. 実装結果

2026-08-11に、Phase 1からPhase 4までを実装した。
Dashboardの初期queryは変更せず、カード展開中だけ`getDashboardPlanUsage`を購読する。
画面はバーなしの「スタッフ」「店舗」を表示し、`FEATURE_MANAGER_INVITATION=enabled`の応答に限って「管理者」を追加する。

カードは承認済みの3段構成へ変更した。
王冠と独自gradientを廃止し、適用中icon、neutralな枠、標準Button recipe、状態別の説明面へ揃えた。
利用状況のloadingはカード内の局所Skeleton、適用上限を確定できない場合は非表示とした。

対象範囲の検証結果は次のとおりである。

| 検証 | 結果 |
|---|---|
| `convex/dashboard/queries.test.ts` | 84件成功。tenant、現在値・上限、明示時刻と予約枠期限、restricted、管理者flagのfail-closedを確認 |
| PlanStatusCard Logic Test | 35件成功。開閉時の`skip`、再展開時刻、店舗切替、価格取得、表示変換を確認 |
| PlanStatusCardとDashboardContentのUI Test | 53件成功。2列・3列・loading・全課金状態・開閉とfocusを確認 |
| 対象8ファイルのBiome | 成功 |
| Convex timezone check | 成功 |
| `docs:check` | 成功 |
| `git diff --check` | 成功 |
| `pnpm type-check` | 成功 |
| `pnpm lint` | 成功。Biome、Convex timezone check、文書検査を含む |
| `pnpm test` | 成功。Logic 1,266件、Convex Function 1,710件、Convex Scenario 95件、UI 789件を確認 |
| `pnpm build` | 成功。client、SSR、35ページのprerender、static検証、TypeScriptを確認 |

`convex/constants.ts`の未マージindexは依頼外のため解消もstageもしていない。
作業ツリー上の内容では必須検証を完了しており、未マージindexを変更せずに全検証が成功した。
GitHub Actions上のVRT比較は、commitとPull Requestの作成後に行う。
