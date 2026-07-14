---
name: convex-design-review
description: シフトリのConvexバックエンド設計を横断レビューし、現状、暗黙の契約、不足、完成形を整理・文書化する。「convex配下の設計」「不足している設計」「バックエンド設計の見直し」「設計方針の文書化」や、店舗コンテキスト、public/internal API契約、Capabilityライフサイクル、schema不変条件、非同期workflowの回復、データ保持・削除・監査、運用・容量設計を扱う時に使う。局所的なコード実装、セキュリティだけのレビュー、実測性能の診断、migration実行を主目的にせず、必要に応じてshiftori-coding、shiftori-security-review、convex-performance-audit、convex-migration-helper、test-strategyを併用する。
---

# Convex Design Review

シフトリのConvex設計を、個別関数の書き方ではなく、永続的な設計契約としてレビューする。

## 最初に読む

1. `convex/_generated/ai/guidelines.md`
2. `doc/rules/convex-design-strategy.md`
3. `convex/AGENTS.md`
4. `doc/rules/security-strategy.md`
5. `doc/rules/testing-strategy.md`
6. 関連するFeature Doc、schema、公開API、job、テスト

現状実装を対象外にする依頼では、コードを前提にせず、仮定と未確認事項を明示する。

## Workflow

1. 依頼を「現状監査」「目標設計」「実装計画レビュー」「設計文書更新」に分類する。
2. actor、tenant、API、data、state、side effect、lifecycle、operationの境界を地図化する。
3. `doc/rules/convex-design-strategy.md`の契約と照合し、維持する設計と不足を分ける。
4. 指摘を「現在の不具合」「未定義の設計判断」「将来機能の前提」「実測が必要」に分類する。
5. 専門領域は対応skillへ委譲し、優先度付きの完成形を報告する。

## Review Depth

高レベルレビューでは、必読文書、schema、認証wrapper、public functionとHTTP routeの一覧、代表的なCapability・workflow・retention経路まで確認する。
全関数の逐語レビューへ広げず、未確認範囲とsamplingを明記する。

全public APIや全tableの監査は、ユーザーが全件監査を求めた場合か、代表調査で同種の重大な欠陥が広がっている根拠を得た場合に行う。

## Skill Routing

- 認証、認可、token、Webhook、PII、課金、公開登録は `shiftori-security-review` を併用する。
- Insights、OCC、subscription、read/write量の改善は `convex-performance-audit` に委譲する。
- persisted shapeの変更は `convex-migration-helper` を併用する。
- 実装、配置、コードレビューは `shiftori-coding` を併用する。
- 回帰テストの層と契約は `test-strategy` に委譲する。

設計レビューではデータ量の上限とboundednessを確認してよい。
実測根拠なしにdenormalization、digest table、document splitを性能対策として断定しない。

## Evidence Rules

- 現状に関する主張にはコードまたは文書の根拠を付ける。
- 提案は現状の事実と分け、最終状態の契約として記述する。
- 将来機能の前提を現在発生中の不具合として扱わない。
- 既存のUse-Case Slices、CQRS、共通認証ラッパーを、明確な不足なしに置き換えない。
- レビュー依頼だけでは実装変更を行わない。

## Review Output

次の順で簡潔に書く。

1. 結論
2. 現在の構造と維持する設計
3. 確認できた事実と推測を分けた、優先度付きfindings
4. 最終状態の設計契約
5. migrationと互換性の制約
6. Function TestとScenario Testの追加契約
7. 運用指標と障害復旧手順
8. 未決定事項と実測が必要な事項
9. 過剰設計として採用しない案

各見直し事項には、欠けている契約、影響、完成形、根拠、影響するschema、API、job、文書、テストを必要な範囲で含める。

優先度は実際の公開範囲、越境、誤配信、データ損失、復旧不能性を基準にする。
理想設計との差だけで優先度を上げない。

- P0: 現在の利用経路で越境、権限奪取、重大な誤配信・データ損失が再現する、または安全な運用継続ができない。
- P1: 現在の公開面で悪用・欠落・復旧不能へつながる設計不足があり、次の関連変更より先に契約化すべき。
- P2: 増加後の容量、障害復旧、データ寿命、運用監視の不足で、対象機能の拡張前に必要。
- P3: 将来機能の前提、局所的な整合、実測後に判断する改善。

## Documentation Updates

文書更新を依頼された場合は、次の責務を守る。

- repo横断の契約は `doc/rules/convex-design-strategy.md`
- 全体構造と入口は `doc/ARCHITECTURE.md`
- 機能固有の振る舞いは `doc/features/`
- 実装配置とコーディング規約は `convex/AGENTS.md`
- セキュリティ境界とabuse対策の詳細は `doc/rules/security-strategy.md`
- テスト層と検証契約は `doc/rules/testing-strategy.md`
- 新規文書へのナビゲーションは `doc/INDEX.md`

同じ詳細仕様を複数の文書へ複製せず、Source of Truthへリンクする。

ユーザーが durable guidance を追加した場合は、該当Source of Truthとこのskillのtriggerまたはworkflowを同じ変更で更新する。
