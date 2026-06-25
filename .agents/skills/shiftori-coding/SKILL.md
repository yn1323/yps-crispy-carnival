---
name: shiftori-coding
description: シフトリ / yps-crispy-carnival 固有の実装規約、コード配置、技術スタックの書き方を扱う。Use when Codex implements, edits, reviews, or explains application code in this repo, especially React/Vite/TanStack Router/Chakra UI v3/React Hook Form/Zod/Jotai/Convex code, route/page/feature/domain placement, validation, date handling, Storybook stories, tests, docs, or when the user corrects project coding style so this skill can be updated.
---

# Shiftori Coding

シフトリのコードを書く時に、一般的な技術スタックの知識をこのリポジトリの実装境界へ落とし込むためのスキル。
コード変更、レビュー、実装方針説明の入口として使う。

## 最初に読む

1. 必ず `doc/rules/testing-strategy.md` を読む。
2. 対象ディレクトリに近い `AGENTS.md` を読む。`src/` は `src/AGENTS.md`、Convex は `convex/AGENTS.md`、E2E は `e2e/AGENTS.md`、CI/CD は `.github/AGENTS.md` を優先する。
3. Convex コードを扱う場合は `convex/_generated/ai/guidelines.md` も読む。
4. 近い既存実装、Story、テスト、Feature Doc を探してから編集する。
5. UI/UXなら `ui-architect`、テスト設計なら `test-strategy`、Convex migrationなら `convex-migration-helper` も併用する。

このリポジトリでは Vite / Storybook / Convex dev server はユーザーが起動する。
新規で起動しない。

## 作業の進め方

1. 変更を「route/page/feature/domain/ui/convex/e2e/doc」に分類する。
2. 置き場所、責務、既存パターンを確認する。
3. Submit 系、通知、削除、権限、課金、法務同意、日付境界、永続データ形状のリスクを先に見る。
4. 実装と同時に必要なテスト、Story、Feature Doc を更新する。
5. `pnpm lint`、`pnpm type-check`、変更範囲に応じたテストを実行する。
6. 最後にセルフレビューし、不要な複雑さ、薄いラッパー、重複、境界違反を整理する。

## 参照ファイル

必要な時だけ読む。

- `references/project-map.md`: 技術スタック、主要ディレクトリ、調査元、関連スキル。
- `references/frontend-patterns.md`: React / TanStack Router / Chakra UI / RHF / Zod / Jotai / Storybook の書き方。
- `references/convex-patterns.md`: Convex の use-case slice、query/mutation/action、認可、日付、migration。
- `references/testing-and-verification.md`: テスト層の選び方、検証コマンド、sandbox 注意点。

## 基本ルール

- 既存の境界を優先する。新しい抽象やフォルダを作る前に、近い実装へ寄せる。
- `routes/` はURL定義だけ、`pages/` は読み取りと状態分岐、`components/features/` は操作と機能UI、`domains/` は純粋ロジックにする。
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
3. テスト規約なら `test-strategy` と `doc/rules/testing-strategy.md`、UI/文言なら `ui-architect`、Convex migrationなら `convex-migration-helper` も更新対象にする。
4. 既存記述と矛盾する場合は、ユーザー指摘を優先し、古い記述を残さず整理する。
5. 更新後は `agents/openai.yaml` の説明が古くないか確認し、`quick_validate.py` を実行する。
