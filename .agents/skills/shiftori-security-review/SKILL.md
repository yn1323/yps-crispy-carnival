---
name: shiftori-security-review
description: シフトリのsecurity-sensitiveな計画・設計・実装・レビューに、actor、asset、trust boundary、abuse case、server-side enforcementの観点を適用する。認証・認可、IDOR、token/capability、招待・登録、Webhook・通知、billing、PII・log・retention、Convex public APIを触る時に使う。一般的なSASTや無関係な局所実装には使わない。
---

# Shiftori Security Review

security-sensitiveな変更では、UIより先にserver側の権限とlifecycleを確定する。

## 最初に読む

1. `doc/rules/security-strategy.md`
2. `references/review-checklist.md`
3. 対象に近いpublic API、schema、認証wrapper、policy、test、scenario fixture

Convexを扱う場合は`convex/_generated/ai/guidelines.md`、`doc/rules/convex-design-strategy.md`、`convex/AGENTS.md`も読む。
テスト層を選ぶ場合は`test-strategy`、保存済みデータ形式を変える場合は`convex-migration-helper`を併用する。

## Plan Workflow

1. 対象surfaceとpublic entrypointを列挙する。
2. actor、asset、trust boundary、user-controlled inputを特定する。
3. tenant越境、stale token、replay、spam、重複delivery、削除競合など現実的なabuse caseを作る。
4. authorityを導くserver-side checkと、rate limit・idempotency・lifecycle・recoveryを決める。
5. unsafe behaviorを再現できる回帰testを決める。
6. planへSecurity Lensを記載してから実装詳細を確定する。

### Security Lens

- Actor:
- Asset:
- Trust boundary:
- Abuse case:
- Server-side enforcement:
- Rate limit / idempotency:
- Lifecycle / recovery:
- Logs / PII:
- Regression test:

## Review and Implementation

- authorityはfrontend stateやclient-provided IDではなく、認証identity、active membership、staff session、対象objectの関係から導く。
- user-supplied IDは取得後にtenant、owner、deleted stateを確認する。
- public APIを増やす前にinternal functionと既存wrapperで閉じられないか確認する。
- public responseとlogは必要最小限にし、token、secret、raw provider response、PIIを露出しない。
- capabilityにはscope、TTL、reuse/revoke規則、cleanupを定義する。
- 外部副作用にはdedupe、idempotency、retry、failure recovery、deletionとの競合規則を定義する。
- review依頼ではfindingを先に示し、実装を依頼されていなければcodeを変更しない。
- 実装を依頼された場合は、該当する回帰testを同じ変更に含める。

詳細なsurface別確認は`references/review-checklist.md`だけに置き、このSKILL.mdへ複製しない。

## Review Output

各findingに次を含める。

1. severityとcode pointer
2. attack pathと影響する境界
3. 現在のserver-side enforcement
4. 修正後の契約
5. 回帰test

findingがない場合も、確認したsurfaceと未確認範囲を示す。

durableな追加指示を文書へ反映する依頼では`doc/rules/agent-instructions.md`の配置基準に従い、security原則は`doc/rules/security-strategy.md`、作業手順はこのSkillまたはchecklistへ置く。
