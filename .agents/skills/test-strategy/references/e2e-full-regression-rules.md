# E2E Full Regression Rules

このリファレンスは、リリース前に「既存E2Eを増やす」のではなく、機能全体から必要な契約を発見し、適切なテスト層へ配置するために使う。
Full Regressionは複数の主担当層を横断する監査であり、単一のE2E suiteではない。

現在の機能、シナリオ名、ファイル名を固定リストとして書かない。毎回、実装と機能ドキュメントから再棚卸しする。

## 目次

- 目的と非目的
- 機能棚卸しとトレーサビリティ
- E2Eシナリオ契約と層の選択
- ライフサイクル、通知、認証、永続化
- Deployed SmokeとCI結果の扱い
- 追加・レビュー時チェックリスト

## 目的と非目的

Full Regressionで守る契約:

- 管理者、スタッフ、公開面の主要導線。
- 下書き、提出、再提出、確定、対象外、復帰、再通知などの状態遷移。
- reload、再アクセス、別browser context後の永続化。
- 認証済み画面と匿名capabilityの境界。
- 重要通知の受付、対象、channel、CTA、復旧。
- 代表Mobile Chrome導線。
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
| 主担当層 | Logic / Behavior / VRT / Function / Scenario / E2E |
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
Mobile:
別層で保証する範囲:
通常E2Eの対象外にする範囲:
```

テスト名の最も深い動詞まで実行してassertする。「提出」「再送」「閲覧」「復旧」と名付けたら、途中の画面やoutbox作成だけで完了扱いにしない。

## 4. E2Eへ上げる契約を判定する

E2Eの主担当:

- 実ブラウザと実frontend / Convex backendの接続。
- 管理者認証と匿名staff contextの境界。
- ユーザー操作で主要状態遷移が完了すること。
- reload、再アクセス、別context後のユーザー可視結果。
- 代表的な匿名CTAから次の操作へ進めること。
- 不達dashboardなど、利用者に見える復旧導線の代表経路。
- feature flagでskipされる導線はcoverage済みとせず、公開条件のenabled環境で実行する契約を別に持つ。

別層の主担当:

- 純粋な最小値、最大値、最大値+1、format: Logic / Function。
- 単一APIの認証、IDOR、token状態、副作用: Function。
- 複数API後の対象集合、snapshot、dedupe、完全なDB状態: Scenario。
- UI単体の操作とvalidation表示: Behavior。
- 見た目、長文、静的文言: VRT。
- 外部providerの実到着: 通常E2Eの対象外。

E2Eでは、境界値によって業務結果や画面遷移が変わる代表点だけを選ぶ。最大件数の大量操作は、必要ならFull Regressionと分離したcapacity jobへ置く。
core E2Eは安定したcontract IDを持つ少数の主要導線へ絞り、通知purpose、channel、状態分岐ごとに複製しない。

### Submit・競合・通信失敗

- 提出、下書き、確定、再通知などの高コスト操作は、短時間の二重クリックでも一回だけ受け付ける契約を持たせる。
- frontendの同期ガードとユーザー可視結果はBehaviorまたは代表E2E、backendの冪等性・dedupe・副作用件数はFunction / Scenarioで保証する。
- 複数tab、スタッフ再提出と管理者確定、通知設定変更とscheduler実行などの競合はScenarioを主担当にし、競合時の回復UIがリリース上重要なら代表E2Eも置く。
- response喪失、通信再送、部分失敗は、再操作後に重複せず完了または安全に復旧することを層ごとに分けて確認する。
- 締切、日付、タイムゾーンの許否はLogic / Functionを主担当にし、受付中から締切済みへの画面遷移が主要導線を止める場合だけ代表E2Eを追加する。

## 5. 方式別ライフサイクルを閉じる

画面、保存形式、編集操作が異なるシフト方式は、方式ごとに次の契約を各主担当層へ対応付ける。

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
ただし、この一覧を一つのE2Eへ詰め込まない。
入力分岐と管理者編集はBehavior、置換更新と永続状態はFunctionまたはScenario、代表的な匿名提出・閲覧のブラウザ境界だけをE2Eで守る。

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

全組み合わせをE2Eへ持ち込まず、対象集合と不在の完全性はFunction / Scenarioで保証する。

## 7. 通知を専用契約群として設計する

通知を主要導線の付随assertionだけにしない。コード上のpurpose、UI trigger、scheduler、再通知画面を列挙し、次の軸で通知マトリクスを作る。

```text
trigger / purpose
× email / LINE / follow / unfollow / fallback
× manager / 通常staff / 追加・変更・対象外staff
× accepted / retry / fallback / final failure / recovery
× CTA / token scope / 有効期限・再発行
```

P0通知purposeは専用contractを持たせ、Function TestまたはScenario Testでtrigger、purpose、channel、対象、件数、受付status、dedupe、CTA種別を完全一致させる。
選択されなかったchannel、対象外、削除済み、非変更者への通知が0件であることも同じ層で守る。
retry、fallback、FailureInbox、rate limit、署名、対象集合を通常E2Eでpollingしない。

E2Eでは、代表的なUI操作からcapabilityが発行され、匿名contextでCTAの最終画面へ到達できるブラウザ境界だけを守る。
emailとLINEで遷移先または認証境界が異なる場合だけ、異なる失敗境界を持つ代表経路を追加する。
不達復旧が主要な利用者導線なら、dashboardから再通知操作を行い利用者に見える受付状態まで確認し、Outbox、retry、解消後の完全な集合はScenario Testへ分ける。

`accepted`、`scheduled`、`retrying`をproviderへの実到着と表現しない。
Function / Scenarioはアプリ内の受付と予約を保証し、E2Eは代表的なCTAとのブラウザ接続を保証する。

E2Eは通知Outboxの集合を診断情報として取得しない。
画面遷移にtokenが必要な場合だけ、E2E専用gateを持つ最小helperでcapabilityを取得し、PII、本文、raw token、provider error全文をreport、trace、errorへ残さない。

## 8. 認証・capability・法務境界

- スタッフの提出linkと閲覧linkは、管理者storageStateを持たない別々のbrowser contextで開く。
- submitとviewのcapabilityを入れ替えて使えないことをFunction / Scenarioで保証し、代表導線はE2Eでも正しい用途から到達する。
- 再発行時は旧linkの失効と新linkだけの成功を確認する。
- logout後に保護routeへ再アクセスし、認証境界へ戻ることを確認する。
- E2Eを縮小しても、storageStateの生成やFunction、Scenario、Behaviorの成功だけで上記のlogout契約を代替しない。
- 他店舗、削除済みstaff/shop、対象外staff、期限切れ、使用済み、用途違いはFunction / Scenarioを主担当にし、重大な匿名導線は代表E2Eも置く。
- プライバシーポリシー等の公開routeと主要CTAはSmokeで守る。version更新、再同意、期限切れ、用途違いが業務を止める場合は、代表E2EとFunction / Scenarioへ契約を分解する。

## 9. 永続化・Mobile

- 保存成功だけで終えず、reload、再ログイン、再アクセス、別contextのいずれかで永続化を確認する。
- Mobile Chromeは全シナリオを複製せず、スタッフ提出・閲覧・同意・登録など影響が大きい代表導線を選ぶ。
- Full Regressionへアクセシビリティ専用contract、axe走査、a11y gateを追加しない。
- この方針をUIのrole、label、accessible nameや通常の機能契約を省く理由にしない。利用者の操作を表すselectorは維持するが、Full Regressionのアクセシビリティ保証として数えない。
- `pageerror`、allowlist外の`console.error`、同一origin 5xxを見逃す構成なら、Full Regressionの残課題として記録する。

## 10. Deployed Smokeと外部challenge

- ローカルE2Eとデプロイ済みURLのSmokeを分ける。
- Deployed Smokeは、build後の実デプロイURLで公開接続が成立することを確認する少数の契約である。
- HTTPでは、代表公開routeの`200`とHTML、slash URLのredirectなし、認証またはCapability用CSR shell、未知URLの`404`を確認する。
- ブラウザでは、代表公開ページ一つのHTTP成功、固有landmark、hydration、必要なprimary CTA、`pageerror`なしを確認する。
- 全公開route、全CSR route、SEO metadata、sitemap、生成した`_redirects`と`_headers`の網羅は`pnpm build`の静的生成物検証へ置く。
- FAQ検索、デモの状態遷移、認証付き業務flow、DB状態、外部providerの到達は、Behavior、通常E2E、Function、Scenarioまたは運用canaryへ置く。
- Smoke対象はroute manifestの全件複製にせず、異なる配信境界を代表する数個のURLへ絞る。
- 外部challengeを自動化するために、アプリ側の検証やセキュリティを弱めない。
- challengeを安定して自動化できない場合は、routeとCTAのSmoke、内部受付契約までを自動化し、外部到達を保証したとは表現しない。

## 11. CI結果の扱い

実行対象が確認したいcommit、build、artifactと一致しない場合は、その差を残課題として報告する。
自動化されていない検証を、リリースゲート完了と表現しない。

現在のtrigger、Preview、credential、ブラウザ、tag、reporter、artifact、コメント、cleanupは、`.github/workflows/`、Playwright設定、`.github/AGENTS.md`、`doc/manual/ci-cd.md`を正本とする。
このリファレンスへ現在値を複製しない。

## 12. 追加・レビュー時チェックリスト

- [ ] 機能一覧を既存テストより先に作った。
- [ ] P0契約に未分類または理由のない一部実装がない。
- [ ] actor、認証境界、永続化、下流影響、負の契約を記入した。
- [ ] ユーザー・設定変更をShiftForm、既存データ、通知、capability、閲覧まで追った。
- [ ] 方式ごとに初回提出、追加と取り消しを含む再提出、管理者編集、下書きreload、確定、通知、閲覧を閉じた。
- [ ] 全P0通知purposeをFunction / Scenarioの専用contractへ分類し、代表的なbrowser CTAだけをE2Eへ残した。
- [ ] email / LINEのchannel選択と非選択channelの不在をFunction / Scenarioで確認した。
- [ ] submit / view / old / new capabilityの境界を確認した。
- [ ] 提出、下書き、確定、再通知の二重送信とbackend冪等性の担当層を決めた。
- [ ] 同時操作、通信再送、部分失敗からの復旧を検討した。
- [ ] 締切、日付、タイムゾーン境界を下位層へ配置し、必要な代表E2Eだけを選んだ。
- [ ] 境界値と容量をE2Eへ寄せすぎていない。
- [ ] Desktop / Mobile / Deployed Smokeの担当を決めた。
- [ ] E2Eを削減または統合した場合、件数ではなく契約IDと移管先で削除理由を説明できる。
- [ ] 匿名の保護route redirectとlogout後の保護route再アクセスを、coreまたは独立browser smokeで確認した。
- [ ] feature flagでskipされた契約をcoverage済みと数えず、enabled環境での実行条件を記録した。
- [ ] 外部サービスの実到着を通常E2Eの保証として扱っていない。
- [ ] core E2Eのactor、認証状態、seed、cleanupがworker間で分離されている。
- [ ] 固定秒待機と`networkidle`を、利用者に見える完了条件またはdeadline付きpollingへ置き換えた。
- [ ] contract ID、project、skip、retry、flakyをresult gateで検証している。
- [ ] retryなしの反復実行と同一commitのCI反復で初回失敗0件を確認した。
- [ ] 公開artifactを機密情報検査へ通し、capabilityと個人情報を保存していない。
- [ ] 現在のCI条件と結果の確認先を、workflowと設定から特定した。
- [ ] test名の最終動詞までassertした。
- [ ] 件数・ファイル名ではなく契約内容で網羅性を説明できる。
