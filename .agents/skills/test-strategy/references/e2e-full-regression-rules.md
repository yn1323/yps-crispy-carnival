# E2E Full Regression Rules

このリファレンスは、リリース前に「既存E2Eを増やす」のではなく、機能全体から必要な契約を発見し、適切なテスト層へ配置するために使う。

現在の機能、シナリオ名、ファイル名を固定リストとして書かない。毎回、実装と機能ドキュメントから再棚卸しする。

## 目的と非目的

Full Regressionで守る契約:

- 管理者、スタッフ、公開面の主要導線。
- 下書き、提出、再提出、確定、対象外、復帰、再通知などの状態遷移。
- reload、再アクセス、別browser context後の永続化。
- 認証済み画面と匿名capabilityの境界。
- 重要通知の受付、対象、channel、CTA、復旧。
- 代表Mobile Chrome導線と主要ページのアクセシビリティ。
- デプロイ済み公開面の軽量Smoke。

Full Regressionだけで総当たりしないもの:

- 全validation分岐と境界値の組み合わせ。
- 複数API後のDB document全field。
- 全端末、全viewport、ピクセル差分。
- 外部providerの実到着とprovider内部状態。
- 容量上限までの大量データ操作。
- `apps/analytics-dashboard/`。

## 1. 機能を既存テストより先に棚卸しする

次の順で機能候補を集める。

1. `doc/INDEX.md` と `doc/features/` から業務機能を列挙する。
2. routeと画面から、管理者、スタッフ、公開面、法務面の入口を列挙する。
3. public query / mutation / actionから、画面に現れにくい認証、通知、復旧、登録、招待を補う。
4. 通知purpose、dashboardの要対応項目、失敗Inboxから運用導線を補う。
5. 既存E2E、Scenario、Function、Behavior、VRTを後から対応付ける。

既存テストから始めると、テストが存在しない機能を発見できない。ファイルがあること、テスト件数が多いこと、近いシナリオ名があることを網羅性の根拠にしない。

## 2. 機能×テスト層のトレーサビリティ表を作る

機能単位ではなく、壊れた時にユーザー影響が説明できる業務契約単位で行を分ける。

最低限、次の列を持たせる。

| 列 | 内容 |
|---|---|
| 契約ID | ファイル名と独立した安定ID |
| 機能・actor | 誰が何を完了するか |
| 起点・状態遷移 | triggerと初期→中間→最終状態 |
| 永続化 | reload、再アクセス、別contextで見るもの |
| 下流影響 | 一覧、ShiftForm、dashboard、集計、通知、閲覧画面 |
| 負の契約 | 余計な対象なし、旧link失効、他店舗拒否、重複なし |
| 通知 | purpose、channel、対象、CTA、fallback |
| 主担当層 | Logic / Behavior / VRT / Function / Scenario / E2E / canary |
| 端末 | Desktop Chrome / Mobile Chrome / 非該当 |
| 状態 | 実装済み / 一部 / 未実装 / 対象外と理由 |

ルール:

- 各契約は、最も速く安定する一層を主担当にする。
- 同じ導線を複数層で扱う場合は、各層が検知する失敗を分ける。
- P0契約に未分類を残さない。一部実装は不足内容を明記する。
- 新機能、方式、通知purpose、権限、外部連携の追加時は行を追加する。
- 実テストがどの契約にも対応しなければ、重複または不要テストとして見直す。
- Full Regressionゲートを作る場合は契約IDで欠落を検知する。件数下限や必須ファイル名は暫定検査に留める。

## 3. E2Eシナリオ契約を先に書く

実装前に、各E2Eについて次を埋める。

```text
契約ID:
actor / 認証境界:
前提状態:
ユーザーのtrigger:
中間状態:
reload / 再アクセス / 別context:
最終的に見える結果:
下流consumerへの影響:
通知purpose / channel / CTA:
余計に起きてはいけないこと:
二重送信 / 競合 / 失敗復旧:
締切 / 日付 / タイムゾーン境界:
Mobile / a11y:
別層で保証する範囲:
手動canaryへ残す範囲:
```

テスト名の最も深い動詞まで実行してassertする。「提出」「再送」「閲覧」「復旧」と名付けたら、途中の画面やoutbox作成だけで完了扱いにしない。

## 4. E2Eへ上げる契約を判定する

E2Eの主担当:

- 実ブラウザと実frontend / Convex backendの接続。
- 管理者認証と匿名staff contextの境界。
- ユーザー操作で主要状態遷移が完了すること。
- reload、再アクセス、別context後のユーザー可視結果。
- 通知受付とCTAから次の操作へ進めること。
- 不達dashboardなど、リリース前に守る復旧導線。

別層の主担当:

- 純粋な最小値、最大値、最大値+1、format: Logic / Function。
- 単一APIの認証、IDOR、token状態、副作用: Function。
- 複数API後の対象集合、snapshot、dedupe、完全なDB状態: Scenario。
- UI単体の操作とvalidation表示: Behavior。
- 見た目、長文、静的文言: VRT。
- 外部provider実到着: provider canary。

E2Eでは、境界値によって業務結果や画面遷移が変わる代表点だけを選ぶ。最大件数の大量操作は、必要ならFull Regressionと分離したcapacity jobへ置く。

### Submit・競合・通信失敗

- 提出、下書き、確定、再通知などの高コスト操作は、短時間の二重クリックでも一回だけ受け付ける契約を持たせる。
- frontendの同期ガードとユーザー可視結果はBehaviorまたは代表E2E、backendの冪等性・dedupe・副作用件数はFunction / Scenarioで保証する。
- 複数tab、スタッフ再提出と管理者確定、通知設定変更とscheduler実行などの競合はScenarioを主担当にし、競合時の回復UIがリリース上重要なら代表E2Eも置く。
- response喪失、通信再送、部分失敗は、再操作後に重複せず完了または安全に復旧することを層ごとに分けて確認する。
- 締切、日付、タイムゾーンの許否はLogic / Functionを主担当にし、受付中から締切済みへの画面遷移が主要導線を止める場合だけ代表E2Eを追加する。

## 5. 方式別ライフサイクルを閉じる

画面、保存形式、編集操作が異なるシフト方式は、方式ごとに次を一気通貫で確認する。

1. 管理者が方式を選び、募集を作成する。
2. 募集通知と提出CTAが受け付けられる。
3. スタッフが管理者storageStateを持たない匿名contextから初回提出する。
4. 同じ提出導線へ再アクセスし、希望を追加かつ取り消して再提出する。
5. 管理者画面で追加と取り消しの両方を確認する。
6. 管理者がその方式の入力で割当を編集する。
7. 下書き保存し、reload後も編集結果が残ることを確認する。
8. 確定し、確定通知と閲覧CTAが受け付けられることを確認する。
9. 提出時とは別の匿名contextから、管理者編集後の最終結果を閲覧する。

初回提出だけ、管理者編集だけ、確定画面だけでは、その方式の一気通貫を完了扱いにしない。再提出では追加と取り消しの両方を見て、置換更新が誤ってmergeへ退行することを検知する。

## 6. 設定変更とユーザー変更の下流影響を閉じる

ユーザー情報、対象オプション、連絡先、通知設定、所属状態の変更は、保存成功だけでは不十分である。

次の因果を追う。

```text
設定変更
→ 対象判定・権限
→ 一覧・ShiftForm・入力候補
→ 既存draft・割当の保持または除外
→ 通知対象・channel
→ 新旧link / session / token
→ 確定後のスタッフ閲覧
```

代表シナリオには次を含める。

- 募集またはシフト作成後にスタッフを追加し、対象ならShiftFormへ現れ、必要な通知が一件だけ発生する。
- 対象外化したスタッフは入力候補と通知対象から外れ、非変更者や既存割当へ余計な影響がない。
- 復帰後は必要な新しいcapabilityだけが発行され、古いlinkが仕様どおり失効する。
- 連絡先やchannel設定変更後は新しい対象だけが使われ、旧対象へ余計な通知がない。
- 募集中、下書き後、確定後で挙動が変わる場合は、状態ごとに契約を分ける。

全組み合わせをE2Eへ持ち込まず、対象集合と不在の完全性はFunction / Scenarioでも保証する。

## 7. 通知を専用シナリオ群として設計する

通知を主要導線の付随assertionだけにしない。コード上のpurpose、UI trigger、scheduler、再通知画面を列挙し、次の軸で通知マトリクスを作る。

```text
trigger / purpose
× email / LINE / follow / unfollow / fallback
× manager / 通常staff / 追加・変更・対象外staff
× accepted / retry / fallback / final failure / recovery
× CTA / token scope / 有効期限・再発行
```

P0通知purposeは専用E2E契約を持たせる。主要導線内の付随assertionだけで専用通知契約の代わりにしない。emailとLINEで製品上の挙動が異なる場合は、各channelの実接続を少なくとも代表E2Eで守る。組み合わせ全件、rate limit、署名検証、対象集合の完全性はFunction / Scenarioへ分担する。

自動E2Eで確認すること:

- 本番と同じUI操作、mutation、action、schedulerから通知を起動する。
- seedは前提状態だけに使い、検証対象のoutbox、magic link、LINE tokenを人工生成しない。
- purpose、channel、対象、件数、受付status、dedupe、CTA種別を確認する。
- 選択されなかったchannel、対象外、削除済み、非変更者への通知が0件であることを確認する。
- 正常時はFailureInboxが0件であることを確認する。
- retry / fallbackはdelivery events、最終失敗だけFailureInboxで確認する。
- 不達復旧はdashboardから個別・一斉再通知を操作し、受付、再試行、解消まで確認する。

`accepted`、`scheduled`、`retrying`をproviderへの実到着と表現しない。自動E2Eが保証するのは通常、アプリが正しい通知を受付・予約し、CTAとの整合を保つところまでである。

probeはPII、本文、raw token、provider error全文を返さない。画面遷移にtokenが必要な場合だけ、redacted通知probeと分離したE2E専用helperを使う。

## 8. 認証・capability・法務境界

- スタッフの提出linkと閲覧linkは、管理者storageStateを持たない別々のbrowser contextで開く。
- submitとviewのcapabilityを入れ替えて使えないことをFunction / Scenarioで保証し、代表導線はE2Eでも正しい用途から到達する。
- 再発行時は旧linkの失効と新linkだけの成功を確認する。
- logout後に保護routeへ再アクセスし、認証境界へ戻ることを確認する。
- 他店舗、削除済みstaff/shop、対象外staff、期限切れ、使用済み、用途違いはFunction / Scenarioを主担当にし、重大な匿名導線は代表E2Eも置く。
- プライバシーポリシー等の公開routeと主要CTAはSmokeで守る。version更新、再同意、期限切れ、用途違いが業務を止める場合は、代表E2EとFunction / Scenarioへ契約を分解する。

## 9. 永続化・Mobile・アクセシビリティ

- 保存成功だけで終えず、reload、再ログイン、再アクセス、別contextのいずれかで永続化を確認する。
- Mobile Chromeは全シナリオを複製せず、スタッフ提出・閲覧・同意・登録など影響が大きい代表導線を選ぶ。
- axe検査は主要ランドマークの表示を待ってから実行する。
- 既知違反はrule全体を広く無効化せず、対象nodeと理由を限定し、修正後にallowlistを削除する。
- `pageerror`、allowlist外の`console.error`、同一origin 5xxを見逃す構成なら、Full Regressionの残課題として記録する。

## 10. Deployed Smokeと外部challenge

- ローカルE2Eとデプロイ済みURLのSmokeを分ける。
- same-repositoryのdevelop向けopen PRでは、exact PR headをCloudflareの`pr-{N}` branchへデプロイし、TOP、機能、FAQ、使い方、お問い合わせの公開5routeを`@deployed` Smokeする。
- PR Preview Smoke自体は認証情報とstorageStateを使用しない。credential付きdeploy workflowはsame-repository PRだけを対象にし、fork PRへEnvironment Secretsを渡さない。
- Deployed Smokeは公開主要route、固有ランドマーク、主要CTA、HTTP成功を軽量に確認する。
- E2EとVRTは別の固定markerコメントで扱う。E2Eコメントにはstatus、Passed / Failed / Flaky / Skipped、失敗テスト、全テスト、Actions、PR Preview、`preview/pr-{N}-e2e`、`yps-crispy-carnival-e2e/pr-{N}`のhosting-pages URLを表示する。
- PR E2E producerはraw `test-results.json`からsuite名、test名、project、status、duration、retryだけを固定schemaへallowlist射影し、`playwright-public-input-{run_attempt}`へuploadする。raw Playwright report、trace、動画、screenshotは専用scannerで機密検査し、`playwright-report-{run_attempt}`の非公開artifactへ7日だけ保存する。publisherはcurrent source attemptと完全一致するartifactだけを採用する。
- default branchのtrusted `workflow_run` publisherはsource run、open PR、exact head SHA、latest run、artifact宣言を再検証し、信頼済みcodeで固定schemaのsanitized summaryだけを生成・検査してhosting-pagesへ公開する。raw report、console/error詳細、認証情報、storageStateは公開しない。
- VRTはPR / develop・main pushでcapture・compareし、同じworkflowからreportとbaselineをhosting-pagesへ公開する。PRではreport URLと差分件数をコメントし、差分がある場合だけ`approve` jobを`vrt-approval` Environmentで待つ。
- production Turnstileなど外部challengeを自動化するために、アプリ側の検証やセキュリティを弱めない。
- challengeを安定して自動化できない問い合わせ等は、route / CTA Smokeと内部受付contractを自動化し、実送信を手動provider canaryへ明示的に残す。

## 11. Full Regression結果ゲート

現在のリポジトリ方針:

- ブラウザはChrome系だけを使う。
- Desktop Chromeと代表Mobile Chromeを分ける。
- same-repositoryのdevelop向けexact PR headごとに専用Convex Preview `preview/pr-{N}-e2e`を作ってFull Regressionを実行し、trusted publisherから結果をopen PRへ返す。
- Full Regression用Convex PreviewではE2E helperを明示的に有効化し、通知をdry-runへ固定して事前確認する。
- open PRでは認証付きFull Regressionと、Cloudflare PR Previewの公開5route Smokeを別workflowで実行する。
- developからmainへのPRと`release.yml`ではE2Eを実行しない。
- fork PRではcredential付きFull RegressionとPreview deployを実行しない。
- PR close時にCloudflare PreviewとPR用Convex Previewをcleanupし、cleanup失敗時は自動失効で回収する。

結果ゲートは少なくとも次を失敗にする。

- report欠落、0件、top-level error。
- failure、timeout、interrupted、non-passing expected status。
- skipとretry後成功を含むflaky。
- 未許可project、必須Desktop / Mobile project欠落。
- 必須P0契約ID欠落。件数とファイル名だけの検査は暫定扱いにする。
- 通知dry-run preflight失敗。
- 全6 user indexの実行欠落。
- 終了時にE2E店舗または組織が1件も監査できない、もしくはbackend audit自体を取得できない状態。削除シナリオで管理者や店舗が削除済みであること自体は失敗にしない。
- 想定外のopen FailureInbox、active dedupe重複。

実行対象が統合後またはRCのexact SHA、production相当build、実際にリリースするartifactと一致しない場合は、その差を残課題として報告する。自動化されていないのに本番リリースゲート完了とは表現しない。

## 12. Provider Canary

通常E2Eとは分けた隔離先で、必要に応じて次を手動確認する。

- emailとLINEの実到着、CTA、reply。
- Slack等の運用通知の実到着。
- production Turnstileを通した実問い合わせ。
- provider側の失敗有無とrequestの対応。

証跡にはexact SHA、時刻、環境、確認者、個人情報を含まない証跡、全項目の結果を残す。canaryは外部境界の補完であり、自動E2Eの代替にしない。

## 13. 追加・レビュー時チェックリスト

- [ ] 機能一覧を既存テストより先に作った。
- [ ] P0契約に未分類または理由のない一部実装がない。
- [ ] actor、認証境界、永続化、下流影響、負の契約を記入した。
- [ ] ユーザー・設定変更をShiftForm、既存データ、通知、capability、閲覧まで追った。
- [ ] 方式ごとに初回提出、追加と取り消しを含む再提出、管理者編集、下書きreload、確定、通知、閲覧を閉じた。
- [ ] 全P0通知purposeを専用E2Eまたは明示した別層へ分類した。
- [ ] email / LINEのchannel選択と非選択channelの不在を確認した。
- [ ] submit / view / old / new capabilityの境界を確認した。
- [ ] 提出、下書き、確定、再通知の二重送信とbackend冪等性の担当層を決めた。
- [ ] 同時操作、通信再送、部分失敗からの復旧を検討した。
- [ ] 締切、日付、タイムゾーン境界を下位層へ配置し、必要な代表E2Eだけを選んだ。
- [ ] 境界値と容量をE2Eへ寄せすぎていない。
- [ ] Desktop / Mobile / a11y / deployed Smoke / canaryの担当を決めた。
- [ ] open PRのDeployed SmokeへEnvironment、Secrets、認証、storageState、PR head codeを渡していない。
- [ ] hosting-pagesへsanitized summaryだけを公開し、raw report、trace、error詳細を公開していない。
- [ ] test名の最終動詞までassertした。
- [ ] 件数・ファイル名ではなく契約内容で網羅性を説明できる。
