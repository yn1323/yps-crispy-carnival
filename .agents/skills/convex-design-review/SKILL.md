---
name: convex-design-review
description: シフトリのConvex設計を横断レビューし、API境界、tenant、schema不変条件、Capability、非同期workflow、データ保持・運用の不足と完成形を整理する。複数ユースケースの設計監査や設計文書更新に使う。局所実装、security単独レビュー、性能診断、migration実行には使わない。
---

# Convex Design Review

シフトリのConvexバックエンドを、個別関数ではなく永続的な設計契約としてレビューする。

## 最初に読む

1. `convex/_generated/ai/guidelines.md`
2. `doc/rules/convex-design-strategy.md`
3. `convex/AGENTS.md`
4. 関連するFeature Doc、schema、public/internal API、job、テスト

security-sensitiveな境界では`shiftori-security-review`、保存済みデータ形式の変更では`convex-migration-helper`、実測性能では`convex-performance-audit`、テスト契約では`test-strategy`を併用する。

## Workflow

1. 依頼を現状監査、目標設計、実装計画レビュー、設計文書更新に分類する。
2. actor、tenant、API、data、state、side effect、lifecycle、operationの境界を図示または表で整理する。
3. 現状の主張をコードと文書で裏付け、事実、推測、未確認事項を分ける。
4. `doc/rules/convex-design-strategy.md`と照合し、維持する契約と不足を分ける。
5. 不足を現在の不具合、未定義の判断、将来機能の前提、実測が必要な事項に分類する。
6. migration、security、performance、testへ影響する項目を対応Skillへ振り分ける。
7. 完成形、移行順、検証契約、運用・復旧条件を優先度順にまとめる。

全件監査は、ユーザーが求めた場合か、代表調査で重大な同種問題が広がっている根拠を得た場合だけ行う。
レビュー依頼だけではコードを変更しない。

## Evidence and Scope

- 現状の事実にはファイルやコード位置を示す。
- 提案は現状と分け、満たすべき契約として書く。
- 将来の懸念を現在発生中の不具合として扱わない。
- 既存のユースケース単位の構成、CQRS、認証wrapperを、確認できた不足なしに置き換えない。
- 実測なしにdenormalization、digest table、document splitを性能対策として断定しない。

## Output

次の順で簡潔に報告する。

1. 結論と確認範囲
2. 維持する設計
3. 優先度付きfindings
4. 最終状態の設計契約
5. migrationと互換性
6. テスト契約
7. 運用指標と復旧条件
8. 未決定事項と実測事項
9. 採用しない案

優先度は、現在の公開範囲、tenant越境、誤配信、データ損失、復旧不能性で決める。
理想との差だけで優先度を上げない。

文書更新を依頼された場合は`doc/rules/agent-instructions.md`の配置基準に従い、正本を一つだけ更新する。
