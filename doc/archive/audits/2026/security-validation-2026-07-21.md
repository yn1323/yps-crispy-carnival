# StripeとCodex Security候補の再検証台帳

> Archive日: 2026-07-23
>
> 理由: `point-in-time-audit`
>
> 後継: [セキュリティ再検証](../../../manual/security-validation.md)

- 再検証日: 2026-07-21
- 実装開始時のcommit: `871d049205a459cf25e428c49960124414a67144`
- 調査snapshot: `codex-security-snapshot/v1:sha256:2a5473a45f43f70d2746e6aa5309415d7201fa54d697d163ff69362d921c090e`
- 実装計画: `doc/plans/2026-07-21_StripeとCodexセキュリティ調査_不足テスト実装計画.md`

この台帳は、2026-07-18の調査候補を2026-07-21のworktreeと突合したリポジトリ再検証記録である。

> 2026-07-22更新: `CAND-FR022-001`、`CAND-FR023-001`、`CAND-FR024-002`に記録したpublisher分離は、same-repositoryのPR branchを信頼境界内とするdirect workflowへ変更した。現在はPR headでFull Regression、Cloudflare Preview、VRT比較とhosting-pages公開を実行し、fork PRは対象外とする。publisher分離により抑止していた「same-repositoryへpushできるactorがPR workflowを書き換えてcredentialへアクセスする」経路は、この運用ではrepository write権限とレビューで管理する。

元資料で正式に`reportable`と判定された候補は`CAND-FR023-002`だけである。

残り29件を正式な脆弱性として一括認定せず、成立条件、現行control、固定回帰、実環境証跡の不足を候補ごとに分ける。

## 判定の読み方

| 判定 | 意味 |
|---|---|
| `validated` | 現行コードで成立条件または抑止controlを再確認し、修正と固定回帰、または未解消条件を特定した |
| `suppressed` | 現行controlと既存回帰が候補の攻撃形を直接抑止している |
| `needs environment evidence` | GitHub、Cloudflare、Clerk、Stripeなど、repository外の設定または実行結果がなければ結論を閉じられない |

`validated`はformal validationの`reportable`と同義ではない。

「実装済み」はrepository内の変更を指し、本番設定やdeploy済みartifactの確認を含まない。

## 候補30件

| 候補 | 判定 | repository上の結論 | 主な固定回帰または残る証跡 | owner |
|---|---|---|---|---|
| CAND-FR003-001 | `needs environment evidence` | `SHIFTORI_INTERNAL_API_SECRET`はservice credentialであり閲覧者認証ではない。Cloudflare Accessなどの前段制御はrepositoryだけでは確認できない | 未認証contextで`/`と`/api/analytics`を拒否するdeployed canary | 運用担当 |
| CAND-FR003-002 | `needs environment evidence` | Workerは16 KiBを超えた時点でrequest readerをcancelし、Convexへ転送しない実装へ変更した。内部BIのテスト禁止方針により自動回帰は追加していない | chunked requestの`bytesRead`とupstream 0件を確認するstaging canary | BI・運用担当 |
| CAND-FR004-001 | `validated` | 店舗別の表示指標を日次snapshotへ固定し、`getShopStages`から募集・提出・通知の店舗別再走査を除いた。500件超は無言で切り捨てずfail closedにする | `convex/analytics/dailyAggregation.test.ts`、最大想定店舗数のpreview容量probe | BI・Backend担当 |
| CAND-FR004-002 | `validated` | view sessionからの要望登録をendpoint固有のsubmit判定で拒否する | `convex/featureRequest/mutations.test.ts` | Backend担当 |
| CAND-FR006-001 | `validated` | URL正規化後に`//host`となるpathとauth loopを既定routeへ戻す | `src/lib/auth/redirect.test.ts` | Frontend担当 |
| CAND-FR007-001 | `validated` | 招待acceptは認証主体のstable digest budgetをtoken lookupより先に使う | `convex/organizationInvitation/mutations.test.ts` | Backend担当 |
| CAND-FR007-002 | `validated` | direct resendとreissueは同じ正規化emailの日次quotaを共有する | `convex/organizationInvitation/mutations.test.ts` | Backend担当 |
| CAND-FR008-001 | `validated` | 請求先メールは正規化値が同じならfresh request IDでも副作用なしで収束する | `convex/organizationBilling/mutations.test.ts` | Backend担当 |
| CAND-FR009-001 | `validated` | 用途欠落legacy linkをsubmit専用として扱い、viewへ昇格させない | `convex/staffAuth/mutations.test.ts` | Backend担当 |
| CAND-FR011-001 | `validated` | 公開書込をHTTP Actionへ限定し、Origin、8 KiB body、Siteverify前のglobal・設定済みtrusted IP budget、Turnstile、link・link×正規化emailのhash budget、pending 20件上限を順に検証する。無効・重複tokenはlink/email固有rowを作らず、Turnstile失敗の上限後はSiteverifyも呼ばない | `convex/staffRegistration/httpActions.test.ts`、`convex/staffRegistration/mutations.test.ts`、`ENV-REG-01` | Backend・Product担当 |
| CAND-FR011-002 | `validated` | new、登録済み、申請済み、cap到達を同じgeneric responseへ統一し、旧public mutationをinternal化した | `convex/staffRegistration/httpActions.test.ts`、`convex/staffRegistration/mutations.test.ts`、`src/components/features/StaffRegistration/submitStaffRegistrationRequest.test.ts` | Backend・Frontend担当 |
| CAND-FR014-001 | `validated` | 無効stateを固定global budgetへ集約しつつ、有効stateは匿名攻撃によるglobal枯渇の影響を受けない | `convex/line/mutations.test.ts` | Backend担当 |
| CAND-FR014-002 | `validated` | managerとinternalの両issuerが旧active tokenを失効し、最新tokenだけを利用できる | `convex/line/mutations.test.ts` | Backend担当 |
| CAND-FR014-003 | `validated` | webhook event IDとprovider timestampを必須にし、follow/unfollowのreplay・逆順eventをno-opにする。messageはPIIを含まない30日receiptをreply budget前に照合し、replayによるbudget消費と外部Reply API再実行を抑止する。message予算は状態eventから分離し、receipt削除後の古いeventはtimestampで拒否する | `convex/line/webhook.test.ts`の別HTTP replay、rate row不変、保持期限境界、複数batch回帰、`convex/line/mutations.test.ts`のmessage上限後follow回帰 | Backend担当 |
| CAND-FR016-001 | `validated` | 通常LINE通知もprovider call直前に現行account、following、user IDを再照合する | `convex/notificationOutbox/actions.test.ts` | Backend担当 |
| CAND-FR016-002 | `validated` | processing rowへ期限付きleaseとfencingを追加し、旧shapeは`processingStartedAt`から回収する | `convex/notificationOutbox/mutations.test.ts`、`convex/_scenario/notificationDelivery.test.ts` | Backend担当 |
| CAND-FR016-003 | `validated` | terminal payloadを30日後にredactし、旧rowはoptional Widenとmigrationでdual-readする。redact済み失敗はquota消費・再送予約なしでexpired解決する | `convex/notificationOutbox/redaction.test.ts`、`convex/notificationOutbox/migration.test.ts`、`convex/notificationOutbox/mutations.test.ts` | Backend担当 |
| CAND-FR017-001 | `suppressed` | delayed、delivered、重複、逆順、legacyの既存状態遷移回帰を維持する | `convex/notificationOutbox/resendWebhook.test.ts` | Backend担当 |
| CAND-FR017-002 | `validated` | 新規LINE/Resend失敗は生errorを保存・console出力せず固定taxonomyへ変換する。legacy FailureInboxは最終失敗から30日後にredactする | `convex/notificationOutbox/safeError.test.ts`、Function Test、migration test | Backend担当 |
| CAND-FR018-001 | `validated` | 募集・確定通知fanoutのbounded batch、cursor、lease、予約漏れ回収、最新世代の送信直前gateを実装対象として確認した | `convex/notification/fanout.test.ts`、`convex/_scenario/notificationDelivery.test.ts`の中断・再開・superseded回帰 | Backend担当 |
| CAND-FR018-002 | `validated` | 確定通知再送を対象snapshot由来のstable semantic keyと世代へ束縛する | `convex/shiftBoard/mutations.test.ts` | Backend担当 |
| CAND-FR018-003 | `validated` | active manager全員がallowlistの場合だけdry-runとし、走査上限超過時は通常配送へ倒す | `convex/_lib/notificationDelivery.test.ts` | Backend担当 |
| CAND-FR019-001 | `validated` | submit sessionから確定シフトview APIを読めない | `convex/shiftView/queries.test.ts` | Backend担当 |
| CAND-FR019-002 | `validated` | 個別再送へactor・organizationの短時間・日次quotaを適用する | `convex/staff/mutations.test.ts` | Backend担当 |
| CAND-FR022-001 | `needs environment evidence` | 共有credentialを使うFull Regressionをdevelop pushへ移し、PR head jobをsecretlessにした | workflow静的検査、Preview Environmentのbranch・reviewer・fork証跡 | CI・運用担当 |
| CAND-FR023-001 | `needs environment evidence` | PRは静的data artifactだけを作り、trusted publisherがmetadataとartifactを検査する。Cloudflare credential利用直前にopen/current headを再確認し、close cleanupとPR単位で直列化してから公開する | workflow静的検査、Preview EnvironmentとCloudflare token scopeの証跡 | CI・運用担当 |
| CAND-FR023-002 | `validated` | 元資料で唯一formal `reportable`。releaseはmerge SHAをcheckoutし、canary headとtree一致をcredential利用前に検証する | `scripts/githubWorkflowSecurity.test.ts`、実releaseのSHA・tree・deploy metadata | CI・運用担当 |
| CAND-FR024-001 | `validated` | secretなしjobがoriginal senderのlive repository permissionを確認し、write以上だけを回数制限付きjobへ渡す。第三者のissue本文をassigner権限で実行しないよう`issues: assigned`は購読しない | `scripts/githubWorkflowSecurity.test.ts`、実workflow runの監査log | CI担当 |
| CAND-FR024-002 | `needs environment evidence` | PR側はPNG dataだけを作り、差分時のproducer merge gateとは独立して、trusted publisherがartifactを検査する。publisher側の`vrt-approval`後、credential利用前と公開直前にlive headを再確認し、PR単位concurrencyで直列化してからreportを再生成・公開する。生成後のvisual diff review済みとは表記しない | `scripts/githubWorkflowSecurity.test.ts`、producer checkとpublisher承認の各履歴、`vrt-approval` required reviewer、Hosting token scopeの証跡 | CI・運用担当 |
| CAND-FR024-003 | `suppressed` | secretはstdinだけで渡し、child error、stdout、stderr、commandを固定errorへ置換する現行実装を回帰化した | `scripts/setupEnv.test.ts` | CI担当 |

## Stripe自動回帰

| Test ID | repository内の結論 | 固定回帰 |
|---|---|---|
| STR-AUTO-01 | Stripe webhookのnon-POSTは課金状態、receipt、scheduler、provider callを変更しない | `convex/organizationStripe/webhook.test.ts` |
| STR-AUTO-02 | SetupIntentのstatus、usage、customerとPaymentMethodのtype、customerを再照合する | `convex/organizationStripe/actions.test.ts` |
| STR-AUTO-03 | Trialと即時ProのCheckoutをcard限定・server固定URLとし、生カードfieldを渡さない | `convex/organizationStripe/actions.test.ts` |
| STR-AUTO-04 | `invoice.payment_action_required`ではPro化せず、後続`invoice.paid`だけで収束する | `convex/organizationStripe/processor.test.ts` |
| STR-AUTO-05 | decline、email、token、provider bodyをclient、console、永続状態へ残さない | `convex/organizationStripe/actions.test.ts` |

自動回帰はStripe本番設定、Radar、3DS、MFA、アカウントロックの証拠には使わない。

## リポジトリ検証結果

2026-07-21の最終worktreeで、`pnpm lint`、`pnpm type-check`、`pnpm build`、`pnpm analytics:lint`、`pnpm analytics:type-check`、`pnpm analytics:build`が成功した。

全体テストは並列負荷による10秒timeoutを避けるため`pnpm test --maxWorkers=1`で実行し、369ファイル、2,880件が成功した。

build後の`dist/`と内部BI artifactはprivacy gateを通過した。

依存監査はCritical 0件、High 0件、Moderate 3件、Low 3件である。

残るModerateは`postcss`、`yaml`、`uuid`のtransitive dependencyであり、CI担当が次回依存更新または2026-08-21の早い方までに修正版の互換性を再確認する。

Lowは`diff`二系統と`@babel/core`であり、同じ更新時に追従する。

## 独立レビュー

最終レビューで未解消のP0、P1は0件である。

レビュー中に確認したP1は、次の固定回帰まで追加して解消した。

| 対象 | 修正 | 固定回帰 |
|---|---|---|
| Claude workflow | `issues: assigned`を削除し、issue作成者とassignerの主体混同を閉じた | `scripts/githubWorkflowSecurity.test.ts` |
| Turnstile | client指定値をSiteverifyの`idempotency_key`へ渡さず、スタッフ登録と問い合わせの固定global budgetを外部call前へ移した | `convex/staffRegistration/httpActions.test.ts`、`convex/contact/httpActions.test.ts` |
| LINE webhook | message reply budgetをfollow/unfollowから分離し、message上限後も状態eventを処理する | `convex/line/mutations.test.ts` |
| PR・VRT publisher | Environment承認後のcredential利用前と公開直前にlive headを再検証し、Preview cleanupとPR単位で直列化した | `scripts/githubWorkflowSecurity.test.ts` |

次のP2相当は、互換期間または補助的なabuse controlとして追跡する。

| 対象 | 残る条件 | owner・再評価期限 |
|---|---|---|
| 問い合わせIP budget | `CF-Connecting-IP`と`X-Forwarded-For`は補助budgetにだけ使うが、ingressのheader上書き契約をrepositoryから確認できない | Backend・運用担当、2026-08-21 |
| LINE message reply | 100件/分のreply budgetは全店舗で共有するため、集中時は定型replyを抑止する。follow/unfollowは抑止しない | Backend担当、2026-08-21 |
| LINE message receipt | Reply API失敗前にreceiptを確定するat-most-once設計のため、一時的なprovider失敗は同じeventから再送しない | Backend担当、2026-08-21 |
| 旧募集fanout | latest operation keyが未設定のdeploy前rowだけは互換性を優先し、異なるlegacy jobの狭い重複余地が残る | Backend担当、widen rollout完了時 |

## 実環境証跡の未完了項目

次の項目はrepositoryだけでは完了できない。

| Test ID | 確認内容 | 完了条件 |
|---|---|---|
| ENV-BI-01 | Cloudflare Access | 未認証の別browser contextからHTMLとAPIの両方がWorker到達前に拒否される |
| ENV-BI-02 | Worker body上限 | Content-Lengthなしの16 KiB超過requestが全量読取前に413となり、Convex callが0件になる |
| ENV-BI-03 | Analytics容量 | 最大想定店舗数でread量、実行時間、応答size、page上限を記録する |
| ENV-CI-01 | GitHub Environment | Previewはdevelopだけ、`vrt-approval`はreview必須、VRT差分時はproducer merge gateとpublisher公開承認の二履歴を確認し、forkへsecretを渡さない |
| ENV-REL-01 | Production release | canary head、merge SHA、tree SHA、tag、Convex、Cloudflare metadataが同一releaseを示す |
| ENV-STRIPE-01 | Stripe sandbox | 通常、3DS成功、3DS失敗、高risk、Trial SetupIntent、Portal、実Webhookをtest値で確認する |
| ENV-STRIPE-02 | Stripe設定 | 申告するRadar、3DS、card testing対策と実account設定が一致する |
| ENV-REG-01 | 公開スタッフ登録 | 本番Turnstile、許可Origin、8 KiB超過拒否をdeployed canaryで確認する。IP制限を有効化する場合は、ingressが利用者指定の`CF-Connecting-IP`を破棄して正しい値へ上書きする証跡を確認してからtrusted headerを設定する |
| ENV-CLERK-01 | Clerk本番 | MFA、10回以下のlockout、server throttle、loginまたはaccount変更通知を負の試験で確認する |
| ENV-OPS-01 | 端末・診断 | EDR、signature更新、full scan、隔離・credential rotation、DASTまたは第三者診断を記録する |

各証跡には、Test ID、対象環境、exact commit SHA、provider accountまたはmode、実施日時、確認者、結果、アクセス制限済みURLを記録する。

secret、token、個人情報、Webhook本文、実在するカード情報は証跡本文へ記録しない。

## Widenと運用確認

`notificationOutbox`と`notificationFailureInbox`の新fieldはoptional Widenとして導入する。

`m019_notification_outbox_terminal_redaction`と`m020_notification_failure_inbox_redaction`は、dry run、cursor、status、再実行の順で確認する。FailureInboxの保持期限は、直近の機密error書き込みを表す`lastFailedAt`を基準にする。

対象deploymentでは、`npx convex run --component migrations lib:getStatus --watch --deployment <fully-qualified-deployment>`で両migrationの`isDone: true` / `state: "success"`を確認し、続けて`npx convex run notificationOutbox/maintenance:getRedactionReadiness --deployment <fully-qualified-deployment>`が`ready: true`を返すことを確認する。readiness queryはPIIやrow IDを返さず、indexごとに最大1件だけを確認する。

新旧readerのdual-read、migration完走、readiness成立を対象deploymentで確認するまでschemaをnarrowしない。

LINE webhook順序fieldと募集の通知operation fieldは、既存rowを初回eventまたは初回操作で更新するため一括backfillしない。`lineWebhookMessageReceipts`は新規eventだけを書き込む新規tableであり、既存rowのmigrationは行わない。

`analyticsDailyShopSnapshots`の一覧表示fieldもoptional Widenとする。旧日の値が必要な場合は対象日の日次集計を再実行し、現在の募集・提出・通知から過去値を閲覧時に再構成しない。
