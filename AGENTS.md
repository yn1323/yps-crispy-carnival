# AGENTS.md

このファイルは、リポジトリ全体で常に守る制約と参照先を示す。
設計原則や作業手順をここへ複製しない。

## 適用範囲

- このファイルはリポジトリ全体に適用する。
- 対象ファイルに近い `AGENTS.md` がある場合は、ルートと併せて読む。
- 下位の `AGENTS.md` は、その配下に限り、ルートより具体的な指示を追加する。
- 新しいルールを追加する前に `doc/rules/agent-instructions.md` で配置先を決め、既存の正本を更新する。
- 同じ規則を複数のファイルへ書かず、正本へのリンクだけを置く。

## プロジェクト

店舗スタッフのシフト管理SaaS。
主要構成は React、Vite、TanStack Router、Chakra UI v3、Convex である。

## 言語

- Pull Requestのレビューコメントは日本語で簡潔に書く。
- レビュー結果をユーザーへ伝える場合も日本語で説明する。

## 正本と参照順

作業対象に応じて、次の正本を読む。

- 指示の配置: `doc/rules/agent-instructions.md`
- フロントエンド: `doc/rules/frontend-architecture.md` と `src/AGENTS.md`
- UI/UX: `doc/rules/ui-design.md` と `ui-architect`
- テストの層・配置・検証契約: `doc/rules/testing-strategy.md` と `test-strategy`
- セキュリティ: `doc/rules/security-strategy.md` と `shiftori-security-review`
- Convexの横断設計: `doc/rules/convex-design-strategy.md` と `convex-design-review`
- Convex実装: `convex/_generated/ai/guidelines.md` と `convex/AGENTS.md`
- 保存済みデータ形式の変更やbackfill: `convex-migration-helper`
- E2E: `e2e/AGENTS.md`
- CI/CD: `.github/AGENTS.md`
- 現在の機能概要: `doc/features/` と `doc/features/INDEX.md`
- 文書全体の入口: `doc/INDEX.md`
- 人が行う運用手順: `doc/manual/`

同じ層の近い実装を追従更新するだけなら、既存パターンを優先する。
設計方針や検証契約を新設・変更する場合は、対応する規約とSkillを使う。

## Skillの発動条件

- UI/UX、画面構造、レイアウト、状態、マイクロコピーを変更する場合は `ui-architect` を使う。
- テスト層、配置、新しい検証契約を判断する場合は `test-strategy` を使う。
- 認証、認可、IDOR、token、Capability、Webhook、外部副作用、billing、個人情報、retention、redactionに触れる相談・計画・設計・実装・レビューでは、プラン確定前に `shiftori-security-review` を使う。
- Convexの複数ユースケース、public API境界、Capability、永続ワークフロー、データ寿命、運用契約を横断して扱う場合は `convex-design-review` を使う。
- 保存済みデータの形を変える、既存documentが新schemaに合わなくなる、またはbackfillが必要な場合は `convex-migration-helper` を使う。

Skillは特定作業の進め方であり、常時制約や設計原則の正本にしない。

## UI配色

- `teal.50`〜`teal.400`は、ページ、section、card、callout、icon、avatar、badge、選択card、カレンダーの日付範囲、非操作の選択列など、内容を載せる面の背景fillに限って明示的に使用してよい。背景fillであればopacity suffixやgradientも使用してよい。
- 保存、送信、遷移などのaction button、Accordion（店舗詳細のスタッフ一覧トリガーを除く）、DateRail、日付sort、週選択、シフト割当toggleの背景には、通常、hover、active、selectedを含めて`teal.50`〜`teal.400`を使用しない。実装要素がButtonでも、値を選ぶselection cardは背景fillの例外に含める。
- クリック可能なrowのrootとhoverには原則として`teal.50`〜`teal.400`を使用しない。Dashboardのスタッフ一覧と、組織設定・店舗詳細・スタッフ詳細でスタッフや店舗を開くdrilldown list cardは、管理者rowの背景とlist card全体のhover背景に`teal.50`〜`teal.400`を使える。店舗詳細のスタッフ一覧トリガーも、スタッフリストカードと同じ`teal.50`のhover背景を使える。
- border、outline、境界として使うbox-shadow、focus ring、divider、progress connector、通常のshadow、文字とiconのforegroundには、`teal.50`〜`teal.400`を使用しない。
- 操作要素内のicon、avatar、badgeの背景は使用してよい。禁止対象のaccentには`teal.500`以上、弱い操作面と境界にはwhite、gray、blackAlphaまたは既存の中立semantic tokenを使う。
- 低階調tealの面にiconやavatarの低階調teal背景を重ねる場合は、内側を外側より1段以上濃くし、背景へ同化させない。
- 操作面のselected、active、割当済みをtealで強く示す場合は、背景に`teal.500`以上、文字とiconにwhiteを使う。

## 変更範囲

- 近い既存実装と同じ境界に置く最小差分を基本とする。
- 依頼に関係しない監査、汎用基盤化、大規模リファクタへ広げない。
- 新しいtable、job、queue、state machine、service、helper、wrapper、registry、runner、監視基盤は、現在の問題または依頼された契約に必要な場合だけ追加する。
- 認証、認可、店舗境界、入力検証、migration、外部副作用の冪等性など、変更に直接関係する安全契約は省略しない。
- 既存のwrapper、policy、共通基盤を優先する。
- テストは変更契約を直接検証する主担当層を一つ選び、異なる失敗境界を検知する場合だけ他層を追加する。

## 作業環境とGit

- 新しいbranchやworktreeを作らず、現在のcheckoutで作業する。
- 依頼外の既存変更は残し、revert、削除、stageをしない。
- commit、push、Pull Request作成は、ユーザーが明示した場合だけ行う。
- Convex、Storybook、Viteの開発サーバーはユーザーが起動しているため、新規起動しない。
- `.env`は直接複製しない。`pnpm convex:env:setup`は`scripts/setupEnv.ts`のallowlistにある変数を、現在選択中のdeploymentへ同期する。Productionまたは別projectでは使わず、完全修飾deployment名を指定したConvex CLIまたはDashboardで設定する。
- 秘密値や個人情報をログ、文書、コミットへ含めない。

## 自動生成ファイル

次のファイルは手動で編集しない。

- `convex/_generated/`
- `src/routeTree.gen.ts`
- `pnpm-lock.yaml`

## 検証

変更範囲に応じて、`package.json` に定義された検証を実行する。

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

- 局所変更では対象test projectや対象ファイルを先に実行してよい。
- `lint`のwarningも解消する。
- `pnpm lint`やブラウザを使う検証がsandboxのIPC、listen、ブラウザ起動制限で失敗した場合は、コードの失敗と区別する。
- 実装後に自己レビューを行い、不要な複雑さと重複を除く。
- ブラウザをAI Agentが手動操作する確認は追加せず、必要な契約は自動テストで検証する。

## 文書

- 現在の機能概要を変えた場合は、対応する `doc/features/` を更新する。
- 新しい機能文書を追加した場合は`doc/features/INDEX.md`にリンクする。
- 詳細な実装仕様はコードと設定を正とし、文書へ複製しない。
- `doc/plans/` は意思決定と実装計画の履歴であり、現在仕様の正本にしない。
- `doc/plans/INDEX.md` で未決提案を `Proposed`、進行中を `Active`、完了済みを `History` に分類する。
- 廃止、置換、棄却された資料と時点監査は `doc/archive/` へ移し、現行文書の正本にしない。
- plan文書には参考にしたファイルのパスを記載する。


## mdファイルのコツ

改行は2種類あります。
段落を意識した文章を書くようにしてください。
また、段落内の文章の`。`後は空白を2つ入れて改行することをおすすめします。

- 半角スペースを2つ入れる方法
```md
1行目  
2行目
```

- 段落を分ける方法
```md
1段落目

2段落目
```

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
