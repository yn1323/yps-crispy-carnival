---
name: test-strategy
description: シフトリの変更契約に合うテスト層を選び、テストケースを設計・実装・レビューする。Logic/Frontend Unit、Storybook Behavior/VRT、Convex Function/Scenario、E2E、Full Regressionの追加・変更・監査に使う。テストを変えない実装説明やanalytics-dashboardの変更には使わない。
---

# Test Strategy

一つの契約に一つの主担当層を選び、異なる失敗境界だけを別層で補う。

## 最初に読む

1. `doc/rules/testing-strategy.md`
2. `references/test-writing-rules.md`
3. 対象に近い既存test、Story、Page Object、Scenario Fixture

E2EまたはFull Regressionでは`e2e/AGENTS.md`と`references/e2e-full-regression-rules.md`も読む。
Convexでは`convex/_generated/ai/guidelines.md`、`doc/rules/convex-design-strategy.md`、`convex/AGENTS.md`も読む。
security-sensitiveな変更では`shiftori-security-review`を併用する。

## Workflow

1. 変更を純粋logic、UI state/interaction、単一Convex API、複数APIの業務flow、browser接続に分ける。
2. 守るcontract、壊れた時の影響、既存coverageを確認する。
3. `doc/rules/testing-strategy.md`で主担当層を選ぶ。
4. 同じcontractの既存testがあれば更新し、重複するtestを増やさない。
5. 新しいcontract、過去のregression、異なる失敗境界に限ってtestを追加する。
6. 正常系だけでなく、対象外、件数、一意性、権限、失敗復旧など変更に関係する負のcontractを確認する。
7. 仕様から消えたcontractを固定するtestは削除する。
8. targeted testから実行し、最後に変更層のsuiteとrepoの必須検証を行う。

## E2E安定化Workflow

1. 失敗したE2Eより先に、現在の画面、機能文書、Story、主担当層のtestを確認し、現行contractを特定する。
2. 失敗を製品回帰、test drift、共有状態、待機、環境・外部依存に分類し、retry後の成功だけで解消扱いにしない。
3. scenarioごとに実ブラウザ境界が必要かを再判定し、DB詳細、通知集合、全validation、時刻境界を主担当層へ移してからE2E基盤を直す。
4. E2Eを削除または統合するときは、件数ではなく契約IDの移管表を作り、logout後の認証境界とfeature flag公開時のenabled pathをbrowser-only保全条件として確認する。
5. actor、認証状態、seed、cleanupをworkerへ決定的に割り当て、test順序、project、retryによる共有をなくす。
6. 意図したfrontend変更によるtest driftなら、製品コードを以前の挙動へ戻さず、selector、待機、fixture、assertionを現行contractへ合わせる。
7. 固定時間待機を利用者に見える状態へ置き換え、browserから観測できない非同期境界だけを総deadline付きpollingにする。
8. 対象testを`retries=0`、1 workerで確認し、通常worker数、retryなしの反復実行、同一commitのCI反復へ広げる。test timeoutは通常worker数の実測とcleanup余裕から長い契約だけを局所校正する。
9. 結果JSONからcontract ID、project、反復数、skip、retry、初回失敗を検証し、所要時間、artifact privacy、未実行項目、環境要因を分けて報告する。

selector、待機、fixture、診断、result gate、burn-inの具体的な書き方は`references/test-writing-rules.md`を正本とする。
Full RegressionからE2Eへ残すcontractの選び方は`references/e2e-full-regression-rules.md`を正本とする。

## Deployed Smokeの縮小

Deployed Smokeを見直すときは、`DEPLOY-SMOKE-01`の代表HTTP契約と代表ブラウザ起動契約を先に定義する。
route manifestの全件走査、静的生成物の網羅、UI操作の状態分岐をSmokeへ残さず、主担当層と移管先を記録する。
縮小後も、公開route、CSR shell、404、ブラウザhydrationという異なる失敗境界を一つずつ保全し、`pageerror`を曖昧なallowlistやretryで隠さない。
実装後のreviewでは、削除した検証、`pnpm build`またはBehaviorへ移した検証、Smokeに残したbrowser-only契約を分けて報告する。

## 主担当層を選ぶ

テスト層と責務の対応表は`doc/rules/testing-strategy.md`だけを正本とする。
このSkillでは、変更契約を同表へ当てはめ、最も速く安定して失敗を検知する一層を主担当に選ぶ。

実装詳細や静的文言の総当たりを契約にしない。
文字列自体がURL、status、error code、SEO、法務、sanitize、maskingの機械契約である場合は直接assertする。

## Special Cases

- Full Regressionでは、既存testより先に画面、ユースケース、public API、HTTP route、通知目的、復旧導線を棚卸しする。
- UIでは見た目と操作を分け、VRTとBehavior Testに同じcontractを重複させない。
- アクセシビリティ専用suite、axeによる全画面走査、a11y release gateは提案または追加しない。この方針をUIのrole、label、accessible nameや通常の機能契約を省く理由にしない。
- Convexの契約はRuleの主担当層へ配置し、異なる失敗境界を一つのテストへ詰め込まない。
- 「余計な対象がない」「1件だけ」「古いcapabilityが無効」もcontractなら、部分一致でなく件数と完全性をassertする。

詳しいassertion、fixture、Story、VRT、Convex、E2Eの書き方は`references/test-writing-rules.md`だけに置く。
Full Regressionの監査手順は`references/e2e-full-regression-rules.md`だけに置く。

## Output and Validation

計画またはreviewでは、contract、主担当層、追加・更新・削除するtest、重複させない層を示す。
実装後は、実行したcommand、結果、未実行の検証と理由を報告する。
E2E安定化では、現行contractの根拠、製品コードとtestのどちらを直したか、retryなしの初回成功、同一commitの反復結果も示す。
E2E縮小のreviewでは、削除または統合したcontract ID、移管先、browser-only保全条件、feature flagで未実行の条件を分けて示す。

commandとsandbox注意事項はroot、近い`AGENTS.md`、`package.json`を正本とし、このSkillへ複製しない。

durableなテスト指示を反映する依頼では`doc/rules/agent-instructions.md`の配置基準に従い、層の原則は`doc/rules/testing-strategy.md`、作業手順はこのSkill、具体的な書き方はreferenceへ置く。
