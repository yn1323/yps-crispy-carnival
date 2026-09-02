# Convex公開面の静的監査

> 理由: `point-in-time-audit`
> 後継: [セキュリティ方針](../../rules/security-strategy.md)、[Convex設計方針](../../rules/convex-design-strategy.md)、[テスト方針](../../rules/testing-strategy.md)

## 結論

2026-08-24のcheckoutに対して、152件のpublic function、10件のHTTP route、9件の共通wrapperを再実行可能なCLIで列挙した。
この監査はmanual reviewの入口を作るものであり、静的候補だけから脆弱性、未使用API、性能問題を断定しない。

## 実行条件

- 実行コマンド：`pnpm exec tsx scripts/inspectConvexPublicSurface.ts --format json`
- 対象：`convex/**/*.ts`のexport済みpublic query、mutation、actionと`convex/http.ts`
- 除外：`convex/_generated/`、test・spec、`convex/testing.ts`、Convexへ登録されない`_`始まりのdirectory
- 出力：source本文、args値、token、環境変数、個人情報を含まないmetadataのみ
- Production deployment、Log Stream、Insights、外部provider設定には接続していない

監査時点の完全な行一覧は、CLIのJSONまたはMarkdown出力を正本とする。
この文書には、実行結果の集計とmanual reviewの起点だけを記録する。

## Inventory

| 項目 | 件数 |
|---|---:|
| Public query | 54 |
| Public mutation | 70 |
| Public action | 28 |
| Public function合計 | 152 |
| HTTP route | 10 |
| 共通wrapper | 9 |
| `args` validatorなし | 0 |
| `returns` validatorなし | 0 |
| `src/`からの直接`api.*`参照なし | 48 |
| Convex testからの直接`api.*`参照なし | 8 |
| Manual-review candidateを持つfunction | 75 |

Trust boundaryの件数にはpublic functionとHTTP routeを含むため、合計は162件になる。

| Trust boundary | 件数 | 静的分類の根拠 |
|---|---:|---|
| `authenticated` | 41 | `authenticatedQuery`、`authenticatedMutation` |
| `manager` | 71 | organization・manager系の共通wrapper |
| `staff-session` | 5 | staff session系の共通wrapper |
| `public-raw` | 35 | observed raw public builder |
| `anonymous-http` | 6 | provider・serviceを示さないHTTP route |
| `provider-service-http` | 4 | pathまたはhandler moduleがWebhook・analytics serviceを示すHTTP route |

`public-raw`は、共通の認証wrapperを使用していないという構文上の分類である。
Capability、招待、スタッフtoken、外部Actionなど、raw public builderが必要な設計を含むため、この分類だけを脆弱性として扱わない。

## Read候補

Inline handler AST内のmethod call件数は次のとおりだった。

| Method | 呼出し数 |
|---|---:|
| `.collect()` | 17 |
| `.filter()` | 37 |
| `.take()` | 42 |
| `.paginate()` | 14 |

`.collect()`を含むpublic functionは7件だった。

| API | `.collect()`件数 |
|---|---:|
| `api.dashboard.queries.getMyShops` | 3 |
| `api.line.queries.getLinkStatusByShop` | 1 |
| `api.shiftSubmission.mutations.submitShiftRequests` | 4 |
| `api.shiftSubmission.queries.getSubmissionPageData` | 2 |
| `api.staff.mutations.deleteStaff` | 4 |
| `api.staff.mutations.setShiftExclusion` | 2 |
| `api.staffAuth.mutations.verifyToken` | 1 |

`.collect()`は、小さい上限が業務上保証された集合や、すでにindexで十分に限定された集合でも使われる。
修正要否は、対象tableの増加上限、index範囲、Productionのdocuments・bytes read、call volumeを確認してから判断する。

### Read候補の確認順

| 優先度 | API | 増加軸 | 静的確認 | 次に見るruntime signal |
|---|---|---|---|---|
| 高 | `api.line.queries.getLinkStatusByShop` | 店舗のactive staff数 | staff全件の取得後、各staffでLINE recipientを解決する | calls、read documents・bytes/call、p95、店舗規模別の偏り |
| 高 | `api.staffAuth.mutations.verifyToken` | 同じstaff・募集に残るsession数 | submit linkの検証でも既存sessionを全件取得し、検証ごとに新しいsessionを作る | session件数、read documents/call、mutation retry、resource limit error |
| 中 | `api.staff.mutations.setShiftExclusion`、`api.staff.mutations.deleteStaff` | staff在籍期間中のsession・magic link・LINE token履歴 | staff単位のindex範囲を全件取得して失効処理する | 対象staffごとのread/write documents、失敗率、p95 |
| 中 | `api.dashboard.queries.getMyShops` | userの組織所属数と各組織の店舗数 | user所属を取得し、組織ごとに店舗を取得する | query call、read documents・bytes/call、cache、`dataChange`比率 |
| 低 | `api.shiftSubmission.*` | 1募集・1staffの提出明細数 | 入力と保存明細は最大31件で、staff・募集の複合indexに限定される | 上限付近のread/write documentsとp95 |

この優先度は、静的な増加軸と1 call内のfan-outだけで付けた。
Productionの頻度を含まないため、最適化順やrelease blockerを確定するものではない。

## Test参照候補

Convex testから同じ`api.<module>.<function>`への直接参照を検出できなかったpublic functionは次の8件だった。

- `api.appOrganization.manageQueries.getManagerCandidates`
- `api.appOrganization.manageQueries.getManagerSettingsOverview`
- `api.featureRequest.mutations.submit`
- `api.featureRequest.mutations.submitForOrganization`
- `api.featureRequest.mutations.submitFromStaff`
- `api.line.queries.getLinkStatusByShop`
- `api.line.queries.getQuotaStatus`
- `api.organizationInvitation.acceptanceActions.accept`

直接参照なしは、別API経由のScenario Test、helperによる間接参照、同等契約の別層での検証を否定しない。
テスト追加前に、actor、入力、返却DTO、拒否時副作用、既存の間接契約を個別に確認する。

## Security Lens

| Actor・境界 | 守る資産 | 主なabuse case | Manual reviewで確認するserver-side check |
|---|---|---|---|
| 認証ユーザー・manager | tenantデータ、個人情報、権限、課金状態 | IDOR、他店舗操作、削除済み対象の利用 | identity、active membership、取得後の組織・店舗関係、最小DTO |
| Staff session | シフト、staff情報、session credential | replay、用途違い、期限切れsession、他staff操作 | scope、access kind、TTL、revoked状態、staff・shopの再取得 |
| Public capability・raw function | 招待、登録、同意、連携token、外部Action | token列挙、再利用、権限昇格、重複副作用 | capability lifecycle、rate limit、dedupe、idempotency、generic response |
| Anonymous HTTP | 公開受付、削除要求、登録要求 | spam、列挙、大きなbody、CORS悪用 | method、content type、body上限、bot proof、rate limit、認証 |
| Provider・service HTTP | Webhook event、課金・通知状態、BI情報 | 偽造、replay、event重複、credential漏洩 | raw body署名、credential、timestamp・event ID、dedupe、最小response |

Raw builder、HTTP分類、API名からは、handler内部の認証・認可が正しく完了しているかを証明できない。
Security findingに昇格させる場合は、actorからassetまでのattack pathと、server-side enforcementの欠落をコード上で確認する。

## Manual reviewで確認したfinding

Inventoryを起点に、公開入口、共通認証wrapper、Capability、HTTP route、provider署名、tenant再照合、read上限をmanual reviewした。
次の5件は静的な候補だけではなく、公開entrypointからresource消費までの到達経路と既存controlをコード上で照合したfindingである。

| Severity | 条件・入口 | Server-side check | 結果・影響 | 判断・次の作業 |
|---|---|---|---|---|
| High | 未認証callerが`verifyToken`のtoken prefix、または`requestReissue`のemailを変更し続ける | 対象の実在確認より前に、攻撃者が分割できるkeyで`rateLimits`へwriteする。固定global budgetとProduction cleanupは見つからなかった | 個別bucketを回避して永続行、write、indexed storageを継続的に増やせる | 固定ingress budget、形式・実在確認後の二次bucket、keyのhash化、bounded retentionを別変更で設計する |
| Medium | 許可Origin headerを付けた未認証callerが`/contact/submit`へ大きいbodyを送る | `Content-Length`がない場合、`request.text()`で全体をbufferした後に16 KiB上限を判定する。rate limitとTurnstileもbody parse後に実行する | action memory、CPU、実行時間、同時実行枠をendpoint上限の判定前に消費できる | 既存`readBoundedJsonBody`を使い、stream読込中に413で停止する |
| Medium | 有効なsubmit magic linkの保持者が同じlinkを反復検証する | token単位5回/分だが、既存sessionを全件`collect()`し、submitでは再利用せず毎回sessionとexpiry jobを作る | 14日または募集開始日前日までsession・job・read量が増え、検証とaccess失効がresource limitへ近づく。一部の一括所属解除はaccess record 200件で停止する | active submit sessionを再利用または固定上限化し、bounded lookupとresumable cleanupをmigration込みで設計する |
| Medium | 認証済みmanagerがpublic queryへ大きい`paginationOpts.numItems`や`maximumRowsRead`を渡す | Dashboard募集・staff、通知履歴・失敗一覧はcaller値をabsolute limitなしで`take()`、`paginate()`、N+1 readへ渡す | 1 callをConvexのread・response上限まで増幅し、失敗、課金read、reactive再実行負荷を起こせる | 既存の1〜50件・最大100 rowsのserver-side clampを共通化する |
| Medium | 有料組織のmanagerが店舗追加とarchiveを繰り返し、非削除履歴を蓄積する | active店舗数は制限するが、`getSettings`と`getMyShops`はarchived店舗を含む履歴を全量取得する。旧settingsは全人物・店舗別staffも読む | active上限内でも頻繁に購読するqueryのdocuments readを増やし、tenantの設定・店舗選択を恒常的に失敗させ得る | 後発のbounded APIへ旧入口を寄せ、履歴総数・保持・overflow契約を別変更で決める |

High findingは、認証不要で永続writeを攻撃者が分割でき、攻撃終了後も行が残るため、単なるcost候補より高く評価した。
他4件はplatform上限、認証済みactor、TTL、active plan上限などのcounter-controlがあるためMediumとした。いずれもcurrent checkoutに既存の経路であり、この監査変更ではschema、認証、Capability、public API、Production設定を変更していない。

### Finding evidence

- 攻撃者任意keyの永続化：`convex/staffAuth/mutations.ts`、`convex/_lib/rateLimits.ts`、`convex/schema.ts`
- 問い合わせbodyの全量buffer：`convex/contact/httpActions.ts`、`convex/_lib/httpBody.ts`、`convex/http.ts`
- submit sessionのread増幅：`convex/staffAuth/mutations.ts`、`convex/organization/personRemoval.ts`、`convex/staff/mutations.ts`
- caller指定pagination：`convex/dashboard/queries.ts`、`convex/notificationOutbox/queries.ts`、`convex/appOrganization/queries.ts`
- archived履歴の全量read：`convex/organization/queries.ts`、`convex/dashboard/queries.ts`、`convex/organization/mutations.ts`

認証・tenant wrapper、Stripe・LINE・Resend Webhookのbounded raw bodyと署名、provider eventの重複排除では、確認した範囲に報告可能な欠落はなかった。
SQL・NoSQL injection、command injection、SSRF、XXE、path traversal、unrestricted upload、hardcoded credentialも、精読と横断検索で実行可能なsource-to-sinkを確認できなかった。

## Heuristic limitations

- `src/`とConvex testの参照検出は、AST上の直接的な`api.module.function`だけを対象とする。alias、動的参照、別package、HTTP、内部delegationは未参照として残る場合がある。
- Read件数はinline handler内のmethod名を数える。外部helper内のDB readは含まず、`.filter()`には配列操作などConvex query以外の同名methodが含まれる場合がある。
- Validator判定はdefinition objectに`args`・`returns` propertyが存在するかだけを見る。validatorの内容、返却DTOの最小性、入力上限は証明しない。
- HTTP trust boundaryはpathとhandler module名による分類であり、署名、credential、CORS、body上限、replay防止の実装を証明しない。
- 共通wrapperの分類は、exportされた`customQuery`・`customMutation`・`customAction`と現在の命名規則を対象とする。動的生成やre-exportを新設した場合はscannerの追従確認が必要になる。
- CandidateはCLIを失敗させない。件数増減はreviewの起点であり、release gateや自動findingではない。

## 未確認のruntime signal

- Productionにおけるfunction別のcall volume、documents read、bytes read、実行時間分布
- Query cache hit、OCC、resource limit、scheduler遅延、error rate
- Productionで有効なLog Stream、環境変数、service credential、provider Webhook設定
- 実データ件数と増加率、tenantごとの偏り、特定release前後の利用量差

Read最適化とAPI削除・internal化は、これらのruntime signalとcallsite調査を組み合わせた別作業で判断する。

## 参照した正本

- `convex/AGENTS.md`
- `convex/_generated/ai/guidelines.md`
- `doc/rules/security-strategy.md`
- `doc/rules/convex-design-strategy.md`
- `doc/rules/testing-strategy.md`
- `scripts/inspectConvexPublicSurface.ts`
