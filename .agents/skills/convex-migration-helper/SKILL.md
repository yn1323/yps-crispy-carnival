---
name: convex-migration-helper
description: Convexの保存済みデータ形式変更をwiden-migrate-narrowで計画し、互換期間、backfill、検証、rollbackを設計・実装する。required field追加、型変更、table分割・統合、rename・削除、既存dataのbackfillに使う。既存dataへ影響しないschema追加や設計レビューだけには使わない。
---

# Convex Migration Helper

稼働中のcodeとdataを両立させながら、Convexのschemaとpersisted dataを段階的に移行する。

## 最初に読む

1. `convex/_generated/ai/guidelines.md`
2. `convex/AGENTS.md`
3. 現在のschema、reader、writer、index、近いmigrationとテスト
4. 関連するFeature Docとdeployment手順

securityやtenant境界が変わる場合は`shiftori-security-review`を併用する。
複数ユースケースの最終設計を決める場合は`convex-design-review`を併用する。

## Workflow

1. 旧shape、新shape、既存dataの有無、data量、全reader・writerを特定する。
2. 変更を互換、非互換、data削除に分類する。
3. widen、migrate、narrowの各deployで許容するshapeとcode behaviorを定義する。
4. 移行中に作られるdataを取りこぼさないwrite strategyを決める。
5. backfillを再実行可能かつboundedにし、停止・再開・失敗時の挙動を定義する。
6. dry run、進捗、残件、完了条件、rollback条件を決める。
7. 実装を依頼された場合だけcodeとmigrationを変更する。
8. `convex/AGENTS.md`の命名、連番、runner、追跡コメントの制約に従ってmigrationを追加する。
9. 後で外すschema互換とfallbackが追跡されていることを確認する。
10. 対象deploymentを再確認してから、明示的に許可された環境だけでmigrationを実行する。
11. 完了確認後に`TODO[narrow]:`を検索し、schemaをnarrowして互換codeと追跡コメントを削除する。

## Widen-Migrate-Narrow

1. Widen: 新旧shapeを受け入れ、readerは両方を扱い、writerは移行戦略に従う。
2. Migrate: 既存dataをbatchでbackfillし、並行writeを含む残件が0であることを確認する。
3. Narrow: 新shapeだけを要求し、旧shapeのread/write互換を外す。

非自明なbackfillでは`@convex-dev/migrations`を優先し、具体的なAPIはinstalled versionと公式文書で確認する。
代表的なshape変換は`references/migration-patterns.md`、componentの定義・実行・status確認は`references/migrations-component.md`を必要な場合だけ読む。

## Safety Rules

- migration関数は再実行しても同じ最終状態になるようにする。
- data量の根拠なしに`.collect()`を使わない。
- migration期間中の新規writeを必ず計画へ含める。
- fieldやdocumentの削除は、保持要件、復旧可能性、ユーザーの依頼範囲を確認してから行う。
- plan依頼ではproduction dataを変更しない。
- production実行では省略名を信用せず、対象deploymentとcommand出力を照合する。
- export検証、migration status、schema整合を別々の完了条件として扱う。

## Output

計画には次を含める。

1. 変更前後のshapeと影響するreader・writer
2. deployごとのschema・read・write契約
3. backfillの単位、再実行性、停止・再開方法
4. dry run、進捗、残件、完了条件
5. rollbackとcleanup
6. Function TestとScenario Testの契約

実行した場合は、対象deployment、実行command、status、残件確認を根拠付きで報告する。
