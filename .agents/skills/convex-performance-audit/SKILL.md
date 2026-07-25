---
name: convex-performance-audit
description: Convexの遅いread、subscription負荷、OCC conflict、function limitを実測とcode pathから診断し、必要なら限定的に改善する。Health/Insightsの指摘、read amplification、write contention、timeout調査に使う。根拠のない予防最適化や純粋なschema migrationには使わない。
---

# Convex Performance Audit

一つの症状を、一つのproblem classとして計測、診断、検証する。

## 最初に読む

1. `convex/_generated/ai/guidelines.md`
2. `convex/AGENTS.md`
3. 対象flowのclient callsite、entrypoint function、schema、近いテスト

runtime情報を使う場合は、installed Convex CLIと公式文書でcommandを確認する。
production deploymentへの問い合わせは、対象と実行が依頼範囲に含まれる場合だけ行う。

## Workflow

1. 遅さ、bytes/documents read、OCC retry、subscription数、timeoutなどの症状を一つに絞る。
2. Health/Insights、ユーザー提供log、再現結果、code auditのうち最も強い根拠を集める。
3. client callsiteからtableのread/writeまで経路を追う。
4. problem classを選び、対応するreferenceを読む。
5. 原因候補を実測済み、codeから確定、仮説に分ける。
6. 最小の改善から適用し、同じtable familyの近いreader・writerに同種問題がないか確認する。
7. behaviorと性能指標を変更前後で比較する。

## Problem Class

| 症状 | 読むreference |
|---|---|
| read amplification、JS filtering、不要なjoin | `references/hot-path-rules.md` |
| OCC conflict、write contention、retry | `references/occ-conflicts.md` |
| subscription過多、不要なreactivity | `references/subscription-cost.md` |
| timeout、transaction size、payload | `references/function-budget.md` |

複数にまたがる場合も、最も強い症状から一件ずつ扱う。

## Guardrails

- small dataや低trafficでは単純な実装を優先する。
- 実測、明確なunbounded path、既知のhot pathがなければ構造変更を提案しない。
- digest table、denormalization、document split、index追加を自動的な正解にしない。
- invasive、cross-cutting、migration-sensitiveな修正は、編集前に選択肢と影響を示す。
- 保存済みデータ形式を変える場合は`convex-migration-helper`を併用する。
- audit依頼だけではcodeを変更しない。

## Output and Verification

次の順で報告する。

1. 症状と確認範囲
2. 根拠とbaseline
3. 原因または仮説
4. 最小の改善案
5. 大きい案を見送る理由
6. 検証結果と残る不確実性

改善後は、結果の同一性、削減対象のread/write、fallback、関連reader・writer、変更前後の指標を確認する。
