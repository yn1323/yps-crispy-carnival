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

## 主担当層を選ぶ

テスト層と責務の対応表は`doc/rules/testing-strategy.md`だけを正本とする。
このSkillでは、変更契約を同表へ当てはめ、最も速く安定して失敗を検知する一層を主担当に選ぶ。

実装詳細や静的文言の総当たりを契約にしない。
文字列自体がURL、status、error code、SEO、法務、sanitize、maskingの機械契約である場合は直接assertする。

## Special Cases

- Full Regressionでは、既存testより先に画面、ユースケース、public API、HTTP route、通知目的、復旧導線を棚卸しする。
- UIでは見た目と操作を分け、VRTとBehavior Testに同じcontractを重複させない。
- Convexの契約はRuleの主担当層へ配置し、異なる失敗境界を一つのテストへ詰め込まない。
- 「余計な対象がない」「1件だけ」「古いcapabilityが無効」もcontractなら、部分一致でなく件数と完全性をassertする。

詳しいassertion、fixture、Story、VRT、Convex、E2Eの書き方は`references/test-writing-rules.md`だけに置く。
Full Regressionの監査手順は`references/e2e-full-regression-rules.md`だけに置く。

## Output and Validation

計画またはreviewでは、contract、主担当層、追加・更新・削除するtest、重複させない層を示す。
実装後は、実行したcommand、結果、未実行の検証と理由を報告する。

commandとsandbox注意事項はroot、近い`AGENTS.md`、`package.json`を正本とし、このSkillへ複製しない。

durableなテスト指示を反映する依頼では`doc/rules/agent-instructions.md`の配置基準に従い、層の原則は`doc/rules/testing-strategy.md`、作業手順はこのSkill、具体的な書き方はreferenceへ置く。
