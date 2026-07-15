---
name: shiftori-coding
description: シフトリ / yps-crispy-carnival 固有の実装規約、コード配置、既存境界内での最小実装を扱う。Use when Codex implements, edits, reviews, or explains application code in this repo, especially React/Vite/TanStack Router/Chakra UI v3/React Hook Form/Zod/Jotai/Convex code, route/page/feature/domain placement, validation, date handling, Storybook stories, tests, docs, or when the user corrects project coding style so this skill can be updated.
---

# Shiftori Coding

シフトリのコードを書く時に、一般的な技術スタックの知識をこのリポジトリの実装境界へ落とし込むためのスキル。
コード変更、レビュー、実装方針説明の入口として使う。

## 最初に読む

1. 対象ディレクトリに近い `AGENTS.md` を読む。`src/` は `src/AGENTS.md`、Convex は `convex/AGENTS.md`、E2E は `e2e/AGENTS.md`、CI/CD は `.github/AGENTS.md` を優先する。
2. `src/` を扱う場合は `doc/rules/frontend-architecture.md` を読み、配置とファイル責務の Source of Truth とする。
3. テスト層や配置を選ぶ、既存のカバレッジ契約を変える、または大規模回帰を扱う場合は `doc/rules/testing-strategy.md` を読む。同じ層の近い既存テストを追従更新するだけなら、その既存パターンを優先する。テスト方針を変えない文書編集では読まない。
4. Convexコードを扱う場合は、追加で `convex/_generated/ai/guidelines.md` を読む。`doc/rules/convex-design-strategy.md` は、複数use caseをまたぐ設計、public API境界、Capability、非同期workflow、データ寿命、運用契約を変更する場合だけ読む。
5. 対象と同じ層の近い既存実装、Story、テスト、Feature Docを必要な範囲で確認する。
6. UI/UXを変更する場合は `ui-architect`、テスト層・配置・新しい検証契約を設計する場合は `test-strategy`、persisted shapeを変更する場合は `convex-migration-helper` を併用する。`convex-design-review` は、ユーザーが横断レビューを求めた場合か、実際に複数use caseの設計契約を変更する場合だけ使い、通常のquery / mutation実装では使わない。

このリポジトリでは Vite / Storybook / Convex dev server はユーザーが起動する。
新規で起動しない。

## 実装スコープ

- 通常の変更は、近い既存実装と同じ境界に置く最小差分をデフォルトにする。
- 指示に並ぶリスク項目は適用判定のチェックリストであり、変更に関係する項目だけ扱う。キーワードが出ただけで、横断監査や関連基盤の新設へ広げない。
- 新しいtable、job、queue、state machine、service、helper、wrapper、registry、runner、監視基盤は、依頼の契約または確認できた現在の問題に必要な場合だけ追加する。将来使うかもしれない、一般論として堅牢になる、という理由だけでは追加しない。
- 単一箇所で完結し、既存境界を壊さないロジックはその場に保つ。重複や独立した業務責務がない段階で薄い抽象化を作らない。
- 認証、認可、店舗境界、入力検証、persisted shapeの互換性、外部副作用の冪等性など、変更に直接関係する安全契約は省略しない。既存wrapperと既存policyを優先して最小限に実装する。
- テストは変更契約を最も速く直接検証できる一層を主担当にする。別の失敗境界を検知する場合だけ他層を追加し、すべてのテスト層を一律に積まない。
- ユーザーが明示していないrepo全体の監査、汎用基盤化、大規模リファクタ、Full Regressionへ作業を広げない。実装に不可欠なら、必要性と追加範囲を先に説明する。

## 作業の進め方

1. 変更を「route/page/feature/domain/ui/convex/e2e/doc」に分類する。
2. 変える契約と変えない契約を分け、既存パターン内の最小経路を選ぶ。
3. Submit系、通知、削除、権限、課金、法務同意、日付境界、永続データ形状のうち、変更に該当するリスクだけ先に確認する。
4. 実装と同時に必要なテスト、Story、Feature Doc を更新する。
5. targeted testを先に実行し、`pnpm lint`、`pnpm type-check`、関連suiteなど変更範囲に応じた検証を行う。
6. 最後にセルフレビューし、不要な複雑さ、薄いラッパー、重複、境界違反を整理する。

## 参照ファイル

必要な時だけ読む。

- `references/project-map.md`: 技術スタック、主要ディレクトリ、調査元、関連スキル。
- `references/frontend-patterns.md`: React / TanStack Router / Chakra UI / RHF / Zod / Jotai / Storybook の書き方。
- `references/convex-patterns.md`: Convex の use-case slice、query/mutation/action、認可、日付、migration。
- `references/testing-and-verification.md`: テスト層の選び方、検証コマンド、sandbox 注意点。

## 基本ルール

- `doc/rules/frontend-architecture.md` に適合する既存境界を優先する。方針と競合する既存実装は参考パターンとして踏襲しない。
- フロントエンドの配置とファイル責務は `doc/rules/frontend-architecture.md` に従う。
- `routes/` はURL定義、`pages/` はroute-wide query、metadata、状態分岐、`components/features/` はfeature-local queryと操作、`domains/` は画面非依存の純粋な業務ロジックにする。
- `index.tsx` と対になる非UIコードは `script.ts` に置き、実装を持つ `index.ts` と共存させない。
- `useMutation` / `useAction` は page に置かず、feature hook または feature component に置く。
- mutation 共有 Zod schema は `convex/{useCase}/schemas.ts` に置き、UI固有の refinement だけ `src/` 側で重ねる。
- Submit 系は `loading/disabled` だけに頼らず、`useSingleFlight` などの同期ガードと必要な backend idempotency を考える。
- フロントの `YYYY-MM-DD` は dayjs または `src/domains/shift/date.ts` を使う。`new Date().toISOString()` 由来で作らない。
- Convex 本番コードの業務日付は `convex/_lib/dateFormat.ts` の helper を使い、JST暦日とUnix msの意味を混ぜない。
- `convex/_generated/`、`src/routeTree.gen.ts`、`pnpm-lock.yaml` は手動編集しない。
- コメントは「なぜ」「業務ルール」「壊しやすい前提」に絞って普通量で書く。

## 自己更新

ユーザーから次のような指摘を受けたら、実装修正だけで終わらせない。

- 「次からこうして」
- 「この配置は違う」
- 「この書き方はシフトリではやめて」
- 「このテスト/Story/文言/Convexの見方が足りない」
- 「AGENTS.md/スキルにも残して」

対応手順:

1. 指摘が一回限りの仕様か、今後も使う repo 規約かを判定する。
2. 今後も使うなら、このスキルの `SKILL.md` または該当 `references/*.md` を更新する。
3. テスト規約なら `test-strategy` と `doc/rules/testing-strategy.md`、UI/文言なら `ui-architect`、Convex設計方針なら `convex-design-review` と `doc/rules/convex-design-strategy.md`、Convex migrationなら `convex-migration-helper` も更新対象にする。
4. 既存記述と矛盾する場合は、ユーザー指摘を優先し、古い記述を残さず整理する。
5. 更新後は `agents/openai.yaml` の説明が古くないか確認し、`quick_validate.py` を実行する。
