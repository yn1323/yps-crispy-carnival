# Narrow Migrationの運用

この手順は、過去にWidenした保存形式をNarrowする前に、対象deploymentのデータ収束を確認するためのものです。
Production Migrationの実行や旧tableの物理削除は、この文書を追加した変更では行いません。

## 判定に必要な二つの証拠

Migration statusとreadinessは別の事実を確認します。
一方だけではNarrowへ進めません。

- **Migration status**：対象workerが、そのdeploymentで最後まで成功したことを示します。
- **Readiness**：worker完了後の再流入も含め、現在のdocumentが新形式へ収束していることを示します。

statusが`success`でも、その後に旧writerが旧形式を作ればreadinessは失敗します。
実際の判定では、対象commit、完全修飾deployment名、status、全ページのreadiness集計を[リリース状態](release-status.md)へ一組で記録します。

## Forward Migrationの対象

既存のm001からm022は履歴として維持します。
完了後に再流入したdocumentと不足していた補完は、新しいforward migrationで処理します。

| Migration | 対象 | 補完内容 |
|---|---|---|
| m023 | `organizationInvitations` | 旧status、`invitedName`、`purpose`、旧`accepted*` |
| m024 | `notificationOutbox` | `purpose`、`notificationContext`、`deliverySuppressed` |
| m025 | `shops` | `organizationId`、`operatingStatus`、後発移行組織の支払い不要Pro相当（当時の内部IDは`complimentary.business`）課金状態 |
| m026 | `shopMembers` | canonicalな人物と管理者所属 |
| m027 | `staffs` | `organizationId`、`organizationPersonId`、`excludedFromShift` |
| m028 | `shopBillingStates` | 旧rowを保持したまま、canonical課金状態との対応異常をconflictへ記録 |
| m029 | `shopMembers` | canonical所属を一意に確認できるactive旧rowの論理削除 |
| m030 | `notificationFanoutOperations` | 旧operationの`supersedesActiveOperations: true`補完 |
| m031 | `users` | `email`を現行規則で正規化し、`emailNormalized`の欠損・不一致を補完 |
| m032 | `staffs` | `email`を現行規則で正規化し、`emailNormalized`の欠損・不一致を補完 |
| m033 | `shiftSubmissions` | 欠損した`firstSubmittedAt`を保存済み`submittedAt`で補完 |
| m034 | `positions` | 現行readerが選ぶ既定positionを維持して`isDefault`を明示化 |
| m035 | `magicLinks` | 欠損した`accessKind`を、従来どおりsubmit capabilityとして補完 |
| m036 | `sessions` | 欠損した`accessKind`を、従来どおりsubmit capabilityとして補完 |
| m037 | `notificationOutbox` | 店舗から一意に導ける`organizationId`補完とscope矛盾のconflict記録 |
| m038 | `recruitments` | assignmentがある旧募集だけ、現行readerと同じ最大`_creationTime`を`draftSavedAt`へ補完 |
| m039 | `shops` | 欠損した`regularClosedDays`を、現行fallbackと同じ空配列へ補完 |
| m040 | `recruitments` | 欠損した`shopClosedDates`を、現行fallbackと同じ空配列へ補完 |
| m041 | `staffLineAccounts` | LINE共通化の事前検証を満たすactive旧連携だけを、provider userとorganization person linkへ変換 |
| m042 | `organizationBillingStates` | markerなしの全課金状態を、保存済みplan IDの意味を維持してv2へ変換 |
| m043 | Analytics source / materialized data | 旧plan IDをcanonical化し、calculation version 2のresetへ接続 |
| m044 | Dashboard announcement | 旧plan IDを含む対象指定をcanonical化 |
| m045 | Stripe Subscription snapshot | 旧`pro` / `business` plan IDをv2の`standard` / `pro`へ変換 |
| m046 | Stripe operation snapshot | 旧source / target plan IDをv2へ変換 |
| m047 | `shopBillingStates` | canonicalな組織課金状態との対応を一意に確認できた旧店舗課金rowを物理削除 |
| 最終readiness | `organizationBillingStates` | markerなしplan IDが0件であることを全ページ確認 |

m023からm028とm030からm040は固定seriesの末尾へ追加します。  m029とm041は固定seriesと包括runnerへ含めません。  m042からm047も課金プラン未公開の対象deploymentで専用runnerを順番に明示実行し、その後に最終readinessを確認します。m029は後述する権限移行gateを満たしたdeploymentで、m041はLINE共通化のexportと全ページreadinessを満たして変換対象があるdeploymentで、それぞれ専用runnerを明示実行します。

過去のmigrationをresetして完了扱いを書き換える運用は行いません。

## Migration statusの確認

対象deploymentは短縮名ではなく、DashboardまたはCLIが示す完全修飾名で固定します。
次のコマンドが表示したdeploymentも、実行記録へ残します。

```bash
pnpm exec convex run --component migrations lib:getStatus \
  --deployment <fully-qualified-deployment>
```

固定seriesに含むm023からm028とm030からm040が、すべて`isDone: true`かつ`state: "success"`であることを確認します。  m029またはm041を実行したdeploymentでは、専用runnerのstatusも別に記録します。

失敗または未完了が一件でもあれば、schema、validator、fallbackをNarrowしません。  m029が未実行であること自体を固定seriesの失敗とは扱いませんが、旧`shopMembers` authorityを削除するNarrowは進めません。

## Readinessの全ページ確認

readiness queryはPIIとrow IDを返さず、1ページあたり最大100件を確認します。
最初の呼び出しでは`cursor`を`null`にします。

```bash
pnpm exec convex run narrowReadiness/queries:verifyShops \
  '{"paginationOpts":{"numItems":100,"cursor":null}}' \
  --deployment <fully-qualified-deployment>
```

結果の`continueCursor`を次の呼び出しへ渡し、`isDone: true`になるまで繰り返します。
「最初のページの件数が0だった」は全件確認の証拠になりません。

同じ方法で、次のqueryをすべて走査します。

- `verifyShops`
- `verifyUsers`
- `verifyStaffs`
- `verifyOrganizations`
- `verifyOrganizationInvitations`
- `verifyNotificationOutbox`
- `verifyStripeSubscriptions`
- `verifyStripeOperations`
- `verifyOrganizationBillingStates`
- `verifyNotificationFanoutOperations`
- `verifyRecruitments`
- `verifyShiftSubmissions`
- `verifyPositions`
- `verifyPositionShops`
- `verifyMagicLinks`
- `verifySessions`
- `verifyLegacyShopMembers`
- `verifyLegacyShopBillingStates`
- `verifyOrganizationMigrationConflicts`

LINE共通化では、上の既存queryとは別に次も全ページ走査します。

- `verifyLineCommonOrganizations`
- `verifyLineCommonPeople`
- `verifyLineCommonProviders`
- `verifyLineCommonLegacyAccounts`
- `verifyLineCommonAsyncCompatibility`（`table: "tokens"`と`table: "outbox"`を別々に走査）
- `verifyLineCommonScheduledCallers`

全ページの`anomalies`、`activeRows`、`totalRows`、`unresolvedRows`を項目別に合計します。
Outbox scopeのNarrowでは`unresolvedNotificationOutboxScopeRows`も全ページ合計し、0件を確認します。
合計が0でない項目は、次のNarrow deployを止める理由と修復方法を記録します。
`verifyPositionShops.observations.shopsWithoutActivePositions`は、positionが不要な店舗もあり得るため観測値です。  `anomalies`とは分けて記録し、この値だけではNarrowを止めません。

ログイン方法とシフト連絡先の分離を公開する前は、`verifyStaffs.activeStaffPersonEmailMismatch`も全ページ合計で0件であることを確認します。  0件でない場合はpersonと未削除staffの連絡先projectionが既存データ上で一致していないため、本実装の更新処理で推測修復せず、対象deploymentと件数を記録して別のmigration判定へ分けます。

LINE共通化では、対象deploymentのexportを`pnpm convex:verify-line-common-readiness -- --path <export.zip>`でも検証します。  `rolloutPath: "staged"`で`legacyWithoutCanonicalCounterpart`が1件以上ある場合だけm041の対象です。  `legacyWithoutCanonicalCounterpart`以外の`anomalies`が一件でもある場合は変換せず、特にactive所属があるcanonical linkの互換投影欠損は`activeCanonicalLinkWithoutExactLegacyProjection`で停止します。  所属0件で保持するcanonical linkはこの異常へ数えません。  `rolloutPath: "zero"`ならm041を実行せず、exportに含まれない予約済みfunctionは`verifyLineCommonScheduledCallers`で別に確認します。

### LINE共通化の条件付き変換

m041の初回実行は専用runnerだけを使います。  次は実行例であり、この文書だけを根拠にProduction操作は行いません。

```bash
pnpm exec convex run migrations/index:runLineCommonLinkBackfill \
  '{"dryRun":true}' \
  --deployment <fully-qualified-deployment>

pnpm exec convex run migrations/index:runLineCommonLinkBackfill \
  '{}' \
  --deployment <fully-qualified-deployment>
```

実行後はmigration statusとLINE共通化readinessを全ページ再確認します。
canonical counterpart欠損、未完了fan-out、snapshotが不完全なtoken・Outbox・scheduled callerを0件にしてから、常時canonical readを含むartifactを対象deploymentへ反映します。
このartifactはruntime環境変数で旧readへ切り替えられないため、残件がある間は反映しません。店舗追加と複数店舗所属はartifact反映後に常時利用できるため、readiness確認後のcanary対象に含めます。
反映後のreadinessとcanaryは別々に確認し、Productionでの完了状態を[リリース状態](release-status.md)へ記録します。

## Conflict修復後の限定再実行

固定seriesのrunnerは完了済みmigrationをskipします。  conflictを修復しただけで`runNarrowPreparation`を再実行しても、完了済みの対象tableは再走査されません。

修復対象と、その結果を消費する後続migrationだけを、依存順に最初は`dryRun`、続いて`reset: true`で再実行します。  series全体や無関係なmigrationをresetしません。

| 修復した対象 | 再評価する順序 |
|---|---|
| m023 | m023 |
| m024 | m024 |
| m025 | m025 → m026 → m027 → m028。m029は権限移行gateを再確認して別実行 |
| m026 | m026 → m027。m029は権限移行gateを再確認して別実行 |
| m027 | m027 |
| m028 | m028 |
| m029 | m029 |
| m030 | m030 |
| m031 | m031 |
| m032 | m032 |
| m033 | m033 |
| m034 | m034 |
| m035 | m035 |
| m036 | m036 |
| m037 | m037 |
| m038 | m038 |
| m039 | m039 |
| m040 | m040 |
| m041 | m041。LINE共通化のexportと全ページreadinessを再確認してから限定実行 |

```bash
pnpm exec convex run migrations/m026_shop_members_narrow_prep:migration \
  '{"dryRun":true,"reset":true}' \
  --deployment <fully-qualified-deployment>

pnpm exec convex run migrations/m027_staffs_narrow_prep:migration \
  '{"dryRun":true,"reset":true}' \
  --deployment <fully-qualified-deployment>

pnpm exec convex run migrations/m029_shop_members_narrow_prep:migration \
  '{"dryRun":true,"reset":true}' \
  --deployment <fully-qualified-deployment>

pnpm exec convex run migrations/m026_shop_members_narrow_prep:migration \
  '{"reset":true}' \
  --deployment <fully-qualified-deployment>

pnpm exec convex run migrations/m027_staffs_narrow_prep:migration \
  '{"reset":true}' \
  --deployment <fully-qualified-deployment>

pnpm exec convex run migrations/m029_shop_members_narrow_prep:migration \
  '{"reset":true}' \
  --deployment <fully-qualified-deployment>
```

依存する全migrationの`dryRun`を確認してから、一件目の実更新へ進みます。  m029の実更新は、次節の権限移行gateも同時に満たす場合だけ行います。

再実行後は、対象migrationのstatusと関係するreadiness全ページをもう一度記録します。  `reset`は冪等性の確認手段ではなく、運用上修復済みrowを再評価する明示操作です。

## 旧管理者authorityを論理削除するgate

`shopMembers`は過去の管理権限を表すため、m029を通常のforward補完と同時に自動実行しません。  deploymentごとに、次をすべて記録します。

- m025からm028が成功し、関係するreadinessと未解消conflictが0件である。
- canonicalな`organizationPeople`と`organizationMembers`が、対象管理者と店舗に一意に対応する。
- m029の`dryRun`で、未移行または曖昧なrowが論理削除対象へ混入していない。
- 旧client、旧worker、旧scheduled functionが`shopMembers`を新規authorityとして作成しないコードへ更新済みである。

初回実行は専用runnerだけを使います。

```bash
pnpm exec convex run migrations/index:runShopMembersNarrowPreparation \
  '{"dryRun":true}' \
  --deployment <fully-qualified-deployment>

pnpm exec convex run migrations/index:runShopMembersNarrowPreparation \
  '{}' \
  --deployment <fully-qualified-deployment>
```

実行後に`verifyLegacyShopMembers.activeRows: 0`と、未解消conflict 0件を全ページで再確認します。  物理rowが履歴として残るため、`totalRows`は0でなくても構いません。

## 自動補完しない残件

次の値は、欠損していても一律の推測で補完しません。

- `organizations.billingEmail`と`billingEmailNormalized`：個人情報を別の値から推測せず、運用担当者が正しい請求先を確認します。
- `organizationStripeSubscriptions.plan`：現在のPrice設定だけで過去世代を推測せず、保存済みPriceとprovider snapshotを照合します。
- `organizationStripeOperations.kind: "immediateProCheckout"`と`trialSetupCheckout.targetPlan`欠損：現在の販売planから過去operationの意図を推測せず、保存済みStripe objectと実行時の設定を照合します。
- `organizationBillingStates.state.limitPlan`：`planLimitExceeded`のrowだけを対象に、制限へ遷移した時点のplanを確認します。
- `notificationOutbox.organizationBillingVersionAtEnqueue`：enqueue時点のsnapshotなので、現在の課金versionから補完しません。
- `notificationOutbox`のscope矛盾：両scope欠損、dangling参照、保存済み事業者と店舗所属の不一致は、どちらかのtenantへ推測補完せず、m037がPIIなしのconflictへ残します。
- `users.role: "admin"`：現行writerは`manager`だけを保存していますが、保存済み`admin`をmanagerへ自動変換すると権限判断になります。  `verifyUsers.legacyAdminRole`で件数を確認し、各rowの正当な権限を運用判断します。
- `positions.isDefault`の複数true：m034は現行readerが選ぶ既定positionを変えず、複数の明示trueを推測で解除しません。  `verifyPositionShops.multipleDefaultShops`と`verifyPositions.defaultSelectionMismatch`が0になるよう、店舗ごとに正しい既定positionを確認します。

これらのreadinessが0にならない場合は、根拠を確定してから別番号の冪等なforward migrationを追加します。
`pro`や現在の設定値を既定値として保存する対応は行いません。

## データ以外のrolling互換gate

保存済みdocumentが収束していても、旧clientや予約済みfunctionが旧argsを送る間はpublic validatorと互換処理を削除しません。  Narrow deploy前に、次を対象deploymentごとに確認します。

- frontendの旧versionが利用される可能性のある配信・cache期間を過ぎ、optionalなfeature visibility DTOと旧billing actionを送るclientが残っていない。
- `_scheduled_functions`に、旧通知action、旧fanout引数、旧店舗cleanup functionを呼ぶ予約が残っていない。  実行中・再試行中のjobも含めてdrainを確認する。
- `notificationOutbox.legacyFanoutDedupeKeys`と旧dedupe keyを送るschedulerがなく、Outboxのfanout link不完全件数が0である。
- スタッフ提出画面の旧versionが`submitShiftRequests.requests`を送っておらず、全callerがrequiredな`submission` discriminated unionを送る。
- trial継続選択で`plan`を省略する旧checkout actionと予約済みcallerがなく、`trialSetupCheckout.targetPlan`欠損が0である。
- Stripeの旧`immediateProCheckout`、target planなしtrial operation、subscription planなしrowがなく、provider snapshotと保存済みplanが一致する。
- 旧API名、旧literal、optional argsを利用する外部callerがないことを、deploy履歴とアクセス記録で確認する。
- LINE共通化では、旧shapeの未使用token、generation snapshotのないactive LINE Outbox、旧shapeの予約済み`sendInviteEmail`が0件である。常時canonical readのartifact反映後も、旧shapeを新規作成するwriterがない。

このgateを確認できない場合、保存schemaだけを先にrequired化しません。  runtime fallbackには削除条件を示す`TODO[narrow]`を残し、次のNarrow deployでschema、validator、reader、writerを同時に削除します。

## Schema Narrowと旧authority削除

次のdeployでschemaとruntime fallbackを削除できるのは、対象となる全deploymentでstatusとreadinessが揃った後です。
Developmentの完了だけをProductionの完了として扱いません。

旧authorityとfallbackを外す条件は、readerとwriterがcanonical tableへ切り替わり、`activeRows`が0であることです。  `shopMembers`はm029後も論理削除rowが履歴として残るため、`activeRows: 0`と`totalRows: 0`を同じ意味に扱いません。  `shopBillingStates.activeRows`は、canonical課金状態がなく実際にlegacy fallbackへ到達するrowだけを数え、`totalRows`は保持中の物理rowを数えます。

旧table自体をschemaから外す条件は、別の保持・監査判断と物理cleanup migrationを経て`totalRows`が0になることです。  `shopBillingStates`はm047で対応が一意なrowを物理削除し、`verifyLegacyShopBillingStates.totalRows: 0`をNarrow条件にします。`shopMembers`の論理削除rowを物理削除するmigrationは、この変更には含めません。
readinessが成立する前に旧authorityを削除すると既存利用者を締め出し、成立後も残すと旧所属による権限復活経路を残します。

Narrow deploy後も、旧形式を投入するMigration Testはschema validationを無効にした履歴用helperで維持します。
通常のFunction TestとScenario Testは、新形式だけをfixtureとして使います。

`users.emailNormalized`、`staffs.emailNormalized`、`shiftSubmissions.firstSubmittedAt`、`positions.isDefault`、`magicLinks.accessKind`、`sessions.accessKind`は、対応するm031からm036のstatusとreadinessが全deploymentで揃った後にだけrequired化します。  required化と同じ契約変更で、各readerの欠損fallbackと旧形式writerを削除します。  `users.role`の`admin` literalは、`legacyAdminRole`が0件であることを別途確認するまで削除しません。

`recruitments.draftSavedAt`は、下書きがない募集では未設定が正しい条件付きfieldです。  m038と`verifyRecruitments.assignmentsWithoutDraftSavedAt`が全deploymentで収束した後はassignment作成時刻fallbackだけを削除し、schema上のoptionalは維持します。

`shops.regularClosedDays`と`recruitments.shopClosedDates`は、過去のrequired追加時にMigrationがなかったため、m039 / m040を先にdeployできるよう一時的にoptionalへWidenしています。  両migrationと`verifyShops.missingRegularClosedDays` / `verifyRecruitments.missingShopClosedDates`が全deploymentで0になった後、requiredへ戻すdeployでbackendとfrontendの空配列fallbackを同時に削除します。

`organizationInvitations`はm023のstatus、link evidence、target / linkedBy / acceptedBy人物のtenant scope、旧status、旧`accepted*`、未解消conflictがすべて0件になった後にだけ、旧literalと旧fieldをschema・validator・readerから削除します。  証跡が欠けた`accepted`や別事業者・danglingな人物を`linked`へ推測変換しません。

`shops`、`staffs`、`shopMembers`、`shopBillingStates`はm025からm029の関係するstatusとreadinessを満たしてから、optionalなcanonical IDとlegacy authority fallbackを削除します。  `verifyStaffs.danglingStaffUser`、`verifyStaffs.missingPersonUserForLinkedStaff`、`verifyStaffs.personUserMismatch`、`verifyStaffs.activeStaffPersonEmailMismatch`も0件でなければならず、本人紐付けや連絡先projectionを推測して解消しません。  m029を実行していないdeploymentでは`shopMembers` fallbackを削除しません。

課金plan ID互換は、m042からm047の全migration status、各pre / post readiness、`billing_compatibility_narrow_readiness:verifyBillingStates`、未解消conflict 0件が全deploymentで揃った後にだけNarrowします。`planIdVersion`と旧plan literalは同じNarrow変更で削除し、請求先メールアドレスを権限根拠へ使いません。

`notificationOutbox`は、m024 / m025 / m030 / m037のstatus、全ページreadiness、Outbox所有conflictの未解消0件、旧scheduled callerのdrainが揃った後にだけNarrowします。  `organizationId` / `purpose` / `notificationContext` / `deliverySuppressed`をrequired化し、`purpose ?? "business"`、purpose未設定のindex分岐、Widen前shop-scoped scan、店舗所属へ戻すreader fallbackを同じ契約変更で削除します。  `shopId`はbilling等のorganization-only通知で、`organizationBillingVersionAtEnqueue`は履歴snapshotとして、どちらもoptionalのまま維持します。

LINE共通化のlegacy readを削除したartifactは、m041を実行した場合のstatus、全LINE readiness、旧token・scheduled caller・generation欠損Outboxのdrainを確認してから対象deploymentへ反映します。  dual-writeの停止と`staffLineAccounts`の物理削除は別の保持判断とcleanupに分け、常時canonical readへの変更と同時には行いません。

条件付きfieldをtable全体でrequiredにはしません。  `magicLinks.notificationOperationKey`は有効なview linkだけ、`notificationOutbox.fanoutTargetKey`と`fanoutOperationId`はfanout通知だけで組として必須です。  `notificationFanoutOperations.scheduledFunctionId`は予約前とterminal状態では存在しないため、lifecycle上optionalのまま維持します。

## 実環境で行わない操作

この作業では次の操作を行いません。

- Production Migrationの実行。
- Production documentの手動更新または削除。
- `shopMembers`と、m047が安全に対応を確定できない`shopBillingStates` rowの物理削除。
- Productionの完了を、ローカルテストやDevelopmentの結果から推測して記録すること。
