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
4. E2EまたはFull Regressionを扱う場合は、`e2e/AGENTS.md` と `references/e2e-full-regression-rules.md` も読む。
5. 認証、token、LINE、メール、通知配送、登録・招待を扱う場合は `shiftori-security-review` を併用し、`doc/rules/security-strategy.md` を読む。
6. 対象に近い既存テスト・Story・E2E Page Object・Scenario Fixture を確認し、既存の型、命名、fixture、assertion の書き方に合わせる。

## 基本姿勢

- 自動テストは「変更し続けるための根拠ある自信」を作るために書く。
- 100% 網羅を目的にしない。リスク、変更頻度、壊れた時の影響、ユーザー導線で厚みを決める。
- 速く細かい層と、遅いが本番に近い層を混ぜない。
- E2E に寄せすぎない。業務状態遷移は Convex Scenario Test、画面の振る舞いは Storybook Behavior Test、見た目は VRT に分担する。
- テストが実装詳細に寄りすぎている場合は、ユーザーから見える振る舞いか、公開 API の契約に寄せて書き直す。
- Full Regressionの機能一覧を既存テストから逆算しない。画面、業務ユースケース、public API、通知目的から棚卸しし、まだテストがない機能も候補に含める。
- VRT対象Storyに最初から表示される静的な見出しや文言は、存在確認だけのplay functionで重複検証しない。操作後に生じる状態遷移だけをBehavior Testで保証する。
- TypeScriptのテストファイル名は`*.test.ts`または`*.test.tsx`に統一する。React hook、jsdom、DOM APIに依存する場合は、ファイル先頭でjsdom環境を指定する。
- 共有schemaの境界値は定義元で一度だけ検証し、フロントエンドではresolver接続、submit抑止、payload、状態遷移だけを保証する。
- Behavior専用Storyは`parameters: { screenshot: { skip: true } }`でVRTから外し、見た目も守る状態は静的Storyへ分ける。
- モバイルVRTはviewport指定だけで済ませず、対応する`vrt-mobile1`または`vrt-mobile2` tagも付ける。
- URL、status、error code、検索・SEO用データ、法務version、sanitize結果、個人情報のマスキングなど、文字列自体が機械契約またはセキュリティ契約である場合はVRTへ委ねない。
- `apps/analytics-dashboard/` は本人用の内部BIとして自動テストとFull Regressionの対象外にする。新しいテストを追加・維持せず、`pnpm analytics:lint`、`pnpm analytics:type-check`、`pnpm analytics:build`で確認する。
- Full Regressionでは、主要導線、状態遷移、認証境界、通知、永続化、モバイル、アクセシビリティを契約として守り、静的文言や実装詳細の総当たりを避ける。
- E2E のシナリオ名をそのまま別層へ複製せず、ブラウザ接続は E2E、単一 public API 境界は Function Test、複数 API 後の状態と永続化は Scenario Test へ契約を分解する。
- 「含まれる」だけでなく「余計な対象がない」「1件だけ」「古い capability が使えない」が契約なら、対象を絞った完全一致と件数で保証する。

## 実装変更時の手順

1. 変更内容を「純粋ロジック」「UI状態/操作」「Convex API契約」「複数APIの業務フロー」「実ブラウザ接続」に分ける。
2. Full Regressionまたは大規模リファクタ前なら、機能×テスト層のトレーサビリティ表を作り、各P0契約の主担当層を決める。利用中のpublic APIだけでなく、管理者、スタッフ、公開面、通知目的、復旧導線から機能を列挙する。
3. `doc/rules/testing-strategy.md` の判断基準でテスト層を選ぶ。
4. 既存のテストが同じ契約を持っているなら更新する。新しい契約や過去に壊れた観点なら追加する。仕様から消えた契約を守るテストは削除する。
5. ユーザー、店舗設定、対象オプション、連絡先などを変更する場合は、保存画面だけで終えず、対象判定、入力画面、既存データ、通知、link/session、確定後閲覧まで下流consumerを追う。
6. UI 変更では同階層の Story を更新し、操作が重要なら play function を追加または更新する。
7. Convex 変更では、認証・店舗境界・token・単一副作用を Function Test、最終永続化・通知・capability遷移を Scenario Test に分ける。
8. シナリオ名が提出・再送・閲覧・復旧までを約束するなら、その最終操作を実行し、DBまたは公開queryの最終状態まで検証する。
9. 最後に `references/test-writing-rules.md` のレビュー観点でセルフレビューする。

## Full Regression の監査手順

1. `doc/features/`、route、管理者・スタッフ・公開画面、public API、通知目的を棚卸しし、機能×テスト層のトレーサビリティ表を作る。既存テストは機能一覧を作った後に対応付ける。
2. P0機能ごとにactor、前提、trigger、中間状態、reload・再アクセス、下流影響、通知・CTA、負の契約、二重送信・競合・失敗復旧、時刻境界、Mobile・a11yをシナリオ契約として記入する。
3. E2Eへ上げるのは実ブラウザ、認証境界、frontendと実backendの接続、永続化、通知受付・CTA、復旧導線に限定する。境界値の許否はLogic / Function、複数API後の完全な状態はScenario、外部provider実到着はcanaryへ分ける。
4. 全通知目的をtrigger × purpose × channel × recipient状態 × CTA/capability × retry/fallback × 除外対象で分類する。P0通知目的は専用E2E契約を持たせ、全組み合わせの網羅はFunction / Scenarioへ分担する。
5. 設定変更・ユーザー変更は、対象一覧、ShiftForm、既存draft・割当、通知対象、旧新link、確定後閲覧まで下流影響が閉じているか確認する。
6. 利用中のpublic query / mutation / actionについて、認証、IDOR、論理削除、token状態、副作用なしを直接見るFunction Testがあるか確認する。
7. `arrayContaining`、`toContain`、`.some()`、`.find()`、fixture内throwを検索し、完全性・一意性・禁止対象を見逃す偽陽性がないか確認する。
8. 件数や必須ファイル名だけを網羅性とみなさず、P0契約IDの未分類・一部実装・未実装を残していないか確認する。
9. 重複する狭いテスト、実行基盤の存在確認だけのテスト、未使用APIを固定するテストを削除候補にする。
10. 現行suiteを変更前後で実行し、最後に変更層の全suite、型、lintを確認する。詳細は `references/e2e-full-regression-rules.md` に従う。

## テスト層の短い選び方

| 変更内容 | 主に書く場所 |
|---|---|
| 日付、時刻、ソート、正規化、schema、表示変換 | Logic UT |
| React hook、jsdom、DOM API、Visual Viewport、同期ガード | Frontend Unit |
| UI の代表状態、静的文言、空/エラー/長文/モバイル差分 | Storybook Story / VRT |
| クリック後に進む、操作後にエラーや確認状態へ変わる | Storybook play function |
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
