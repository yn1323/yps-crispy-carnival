---
name: test-strategy
description: シフトリ / yps-crispy-carnival のテスト方針・テストケース設計・テストコードの書き方を扱う。Use when Codex edits or reviews `*.test.ts`, `*.stories.tsx`, Storybook play function / Behavior Test, VRT, Convex Function Test, Convex Scenario Test, E2E / Playwright, prepares Full Regression or a large refactor, audits missing or excessive coverage, or implements changes that require adding, updating, deleting, or choosing tests. Also use when the user points out missing cases, weak perspectives, flaky tests, false positives, or preferred testing style so the skill and `doc/rules/testing-strategy.md` can be updated.
---

# Test Strategy

シフトリの実装変更に対して、どのテスト層で何を保証するかを決めるためのスキル。
正式な方針は `doc/rules/testing-strategy.md` を Source of Truth とし、このスキルは実装時の細かい書き方・レビュー観点・自己更新ルールを担う。

## 最初に読む

1. 必ず `doc/rules/testing-strategy.md` を読む。
2. Convex コードを扱う場合は `convex/_generated/ai/guidelines.md` も読む。
3. 細かいテストコードの書き方、観点、レビュー基準は `references/test-writing-rules.md` を読む。
4. 対象に近い既存テスト・Story・E2E Page Object・Scenario Fixture を確認し、既存の型、命名、fixture、assertion の書き方に合わせる。

## 基本姿勢

- 自動テストは「変更し続けるための根拠ある自信」を作るために書く。
- 100% 網羅を目的にしない。リスク、変更頻度、壊れた時の影響、ユーザー導線で厚みを決める。
- 速く細かい層と、遅いが本番に近い層を混ぜない。
- E2E に寄せすぎない。業務状態遷移は Convex Scenario Test、画面の振る舞いは Storybook Behavior Test、見た目は VRT に分担する。
- テストが実装詳細に寄りすぎている場合は、ユーザーから見える振る舞いか、公開 API の契約に寄せて書き直す。
- E2E のシナリオ名をそのまま別層へ複製せず、ブラウザ接続は E2E、単一 public API 境界は Function Test、複数 API 後の状態と永続化は Scenario Test へ契約を分解する。
- 「含まれる」だけでなく「余計な対象がない」「1件だけ」「古い capability が使えない」が契約なら、対象を絞った完全一致と件数で保証する。

## 実装変更時の手順

1. 変更内容を「純粋ロジック」「UI状態/操作」「Convex API契約」「複数APIの業務フロー」「実ブラウザ接続」に分ける。
2. Full Regressionまたは大規模リファクタ前なら、利用中のpublic APIとE2E主要シナリオを棚卸しし、保証層を対応付ける。未使用public APIはテスト追加前に削除・internal化を検討する。
3. `doc/rules/testing-strategy.md` の判断基準でテスト層を選ぶ。
4. 既存のテストが同じ契約を持っているなら更新する。新しい契約や過去に壊れた観点なら追加する。仕様から消えた契約を守るテストは削除する。
5. UI 変更では同階層の Story を更新し、操作が重要なら play function を追加または更新する。
6. Convex 変更では、認証・店舗境界・token・単一副作用を Function Test、最終永続化・通知・capability遷移を Scenario Test に分ける。
7. シナリオ名が提出・再送・閲覧・復旧までを約束するなら、その最終操作を実行し、DBまたは公開queryの最終状態まで検証する。
8. 最後に `references/test-writing-rules.md` のレビュー観点でセルフレビューする。

## Full Regression の監査手順

1. 現行suiteを変更前に実行し、失敗とテスト件数を基準値として記録する。
2. 利用中のpublic query / mutation / actionを列挙し、正常系だけでなく認証、IDOR、論理削除、token状態、副作用なしを直接見るFunction Testがあるか確認する。
3. `@smoke` / `@release` E2Eから、複数API後のDB状態・通知・snapshot・旧新linkの契約をScenario Testへ落とせるか確認する。
4. `arrayContaining`、`toContain`、`.some()`、`.find()`、fixture内throwを検索し、完全性・一意性・禁止対象を見逃す偽陽性がないか確認する。
5. 重複する狭いテスト、実行基盤の存在確認だけのテスト、未使用APIを固定するテストを削除候補にする。
6. 対象テストから始め、最後に変更層の全suite、型、lintを実行する。

## テスト層の短い選び方

| 変更内容 | 主に書く場所 |
|---|---|
| 日付、時刻、ソート、正規化、schema、表示変換 | Logic UT |
| UI の代表状態、空/エラー/長文/モバイル差分 | Storybook Story / VRT |
| クリック後に進む、エラーが出る、確認文言が出る | Storybook play function |
| query/mutation 単体の認証、認可、IDOR、副作用 | Convex Function Test |
| 複数 mutation/query 後の dashboard、通知、集計、スナップショット | Convex Scenario Test |
| 認証済みブラウザで主要導線が完了すること | E2E |

## ユーザー指摘を受けた時の自己更新

ユーザーからテストについて次のような指摘を受けたら、実装修正だけで終わらせない。

- 「このテスト観点が足りない」
- 「このケースも見るべき」
- 「この書き方はやめて」
- 「次からこうして」
- 「E2EではなくScenarioで見るべき」
- 「Story/VRT/Behaviorの分け方が違う」

対応手順:

1. 指摘が今回だけの仕様なのか、今後も使うテスト規約なのかを判定する。
2. 今後も使うなら `references/test-writing-rules.md` に具体的な書き方やレビュー観点を追記する。
3. 方針、層の分担、実行ルールにも関係するなら `doc/rules/testing-strategy.md` も同時に更新する。
4. 既存記述と矛盾する場合は、ユーザー指摘を優先し、古い記述を残さず整理する。
5. 更新後はこのスキルの `SKILL.md` と `agents/openai.yaml` の description が古くなっていないか確認する。

## 検証コマンド

変更範囲に応じて選ぶ。

```bash
pnpm lint
pnpm type-check
pnpm test:logic
pnpm test:ui
pnpm test:convex
pnpm test:convex:logic
pnpm test:convex:scenario
pnpm e2e
pnpm vrt
```

Codex で `pnpm lint`、`pnpm test:ui`、`pnpm e2e`、`pnpm vrt` など IPC や Playwright / ブラウザ起動を伴う検証を実行する場合は、最初から権限付きで実行する。
それでも `EPERM`、ブラウザ起動不可、IPC/listen 失敗が出た場合は、テスト失敗ではなく実行環境由来の問題として切り分ける。
