---
name: convex-create-component
description: Convex Componentの採否を判断し、独立したtableと小さなapp-facing APIを持つ再利用可能なbackend境界を設計・実装する。永続状態を持つ機能のcomponent化や複数app向けpackage化に使う。通常のapp内use case、認証設定、migration、性能監査には使わない。
---

# Convex Create Component

再利用に値するConvex機能を、appから独立した永続境界として作る。

## 最初に読む

1. `convex/_generated/ai/guidelines.md`
2. `convex/AGENTS.md`
3. 現在の`convex.config.ts`、schema、近いwrapperとテスト

ComponentのAPIやCLI仕様は変わりうるため、実装時はinstalled versionとConvex公式文書を確認する。

## Workflow

1. 所有する永続状態、再利用先、appとの境界を明らかにする。
2. 通常のapp codeやTypeScript libraryでは不十分かを確認する。
3. 形を選び、対応するreferenceを一つ読む。
4. 所有table、公開関数、appから渡す認証・設定・ID、app側wrapperを計画する。
5. Component固有のschemaとfunctionを実装し、appへinstallする。
6. clientまたはHTTPから使う場合は、app側で認証・認可・入力検証を行うwrapperを作る。
7. component logicとapp wrapperをそれぞれの境界で検証する。

## 形を選ぶ

| 目的 | 形 | 読むreference |
|---|---|---|
| このrepo内だけで使う | Local | `references/local-components.md` |
| 複数appへ配布する | Packaged | `references/packaged-components.md` |
| localとshared libraryの両方が明示的に必要 | Hybrid | `references/hybrid-components.md` |

迷う場合はLocalを選ぶ。
HybridはLocalとPackagedのどちらでも要件を満たせない場合だけ選ぶ。

## Boundary Rules

- Componentは自分のtableだけを所有する。
- Component functionではComponent自身のgenerated server importを使う。
- appの認証、環境変数、HTTP route、parent tableの権限判定はapp側に置く。
- parent appのIDはComponent境界でstringとして受け、app側wrapperで検証する。
- clientへComponent functionを直接公開しない。
- public contractにはruntime validatorと必要最小限の戻り値を定義する。
- query対象はindexで絞り、規模不明の全件取得を避ける。
- component化を理由に既存のtenant・security契約を弱めない。

callback、schema由来validator、static configuration、class wrapperが必要な場合だけ`references/advanced-patterns.md`を読む。

## Output and Validation

実装前に、Componentを採用する理由、所有table、app-facing API、app側に残す責務を短く示す。

検証では次を確認する。

1. Component単体の型とbehavior
2. appへのinstallとgenerated APIの整合
3. app wrapperの認証・認可・入力契約
4. package化する場合はconsumer exampleからの利用

codegenやdev serverの扱いはrootと`convex/AGENTS.md`に従う。
対話的なdeployment設定が必要になった場合は、推測せず必要な操作だけをユーザーへ依頼する。
