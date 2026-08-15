---
name: delegate-bounded-repo-work
description: このリポジトリで、複数語・複数階層の関連ファイル探索、定義・call site・test・文書の対応表作成、export・test名・設定・scriptの大規模棚卸し、大きなlog・diffからの事実抽出、指定test・lint・buildの実行とログ整理を行うとき、境界明確なsubtaskを固定のGPT-5.6 Luna max Agentへ必ず委譲する。単発検索、小さい入力、実装・編集・原因診断・設計判断、security・UI/UX・Convex・migrationの結論、Production・外部副作用・Git変更には使わない。該当しない作業のAgent選択には介入しない。
---

# 境界明確なリポジトリ作業を委譲する

親Agentの判断と最終品質を維持したまま、読み取り量やログ量が多い定型作業を低コストAgentへ分離する。
このSkillは委譲対象だけを固定し、依頼全体の担当modelを置き換えない。

## 最初に適用を判定する

toolを使う前、Agentをspawnする前に、依頼から切り出すsubtaskが「必ず委譲する作業」のいずれかへ実質的に該当するか判定する。

- Skillを明示的に指定されても、対象外のsubtaskを委譲しない。
- 一つのfileまたは一つの正確な検索語を一度確認すれば終わる作業は対象外とする。
- 短いlog・diff・command出力を一度読むだけの作業は対象外とする。
- 対象外ならAgentをspawnせず、このSkillの適用を終了して通常のAgent選択へ戻す。
- 該当するか不明なら、委譲しない。親Agentが選択中のmodelで境界を確定する。

「このSkillを使う」という指示を、「必ずAgentをspawnする」という指示として解釈しない。

## 固定ルーティング

- 委譲先のmodelを`gpt-5.6-luna`、reasoning effortを`max`に固定する。
- `latest`などの可変aliasを使わず、新modelへ自動更新しない。ユーザーが明示した場合だけこのSkillとAgent定義を変更する。
- 調査系は`luna_evidence_collector`、検証実行系は`luna_validation_runner`を指定する。
- 名前付きCustom Agentを選択できない実行面では、同じmodelとeffortをspawn時に明示し、該当Agentの制約をtask promptへ含める。
- modelまたはCustom Agentを利用できない場合は、別modelへ代替しない。親Agentへ戻し、委譲できなかったことを報告する。
- 対象外の作業ではこのSkillの適用を終え、通常のAgent選択へ戻す。

## 必ず委譲する作業

次の作業に該当する境界明確なsubtaskは、親Agentが直接実行せず委譲する。

1. 複数の検索語、検索方法、またはディレクトリを横断する関連ファイル探索。
2. 定義、call site、test、文書を追跡し、対応表を作る調査。
3. 複数ディレクトリまたは多数のファイルにまたがるexport、test名、設定、scriptの棚卸し。
4. おおむね200行以上、または複数command・fileにまたがり一度のtargeted readでは整理できないlog・diffからの事実抽出。
5. 親Agentが選んだtest・lint・build commandの実行とログ整理。

一つの正確な検索語を一つのrootへ適用するだけなら、親Agentが`rg`を直接使う。
同じroleへ渡せる複数の調査は一つのtaskへまとめ、Agentのfan-outを増やさない。

## 委譲前に境界を作る

親Agentが次を定義してからspawnする。

- 目的と答える質問
- 対象root、file、diff、log、command
- 非対象と禁止事項
- 完了条件
- 返却形式と必要な根拠

full conversationをそのまま渡さない。fork範囲を選べる場合は`none`または必要最小限とし、task固有の文脈、適用される`AGENTS.md`、必要な正本だけをpromptへ含める。

一つでも定義できない場合は無理に委譲せず、親Agentが選択中のmodelで境界を確定する。境界確定後にこのSkillの対象となるsubtaskが残れば、その部分だけ委譲する。

## 調査Agentの契約

`luna_evidence_collector`には事実収集だけを依頼する。

- `rg`を優先し、実行commandと検索rootを残す。
- 主要結果を`path:line`、hit数、短い根拠とともに返す。
- 定義・call site・test・文書を混同せず分類する。
- 0件という結果には、検索語、除外、対象範囲を添える。
- 既存patternは候補収集までとし、採用判断や設計提案をしない。
- security、UI/UX、Convex、migrationを含む場合も、事実の列挙を越えて結論を出さない。
- 不足、曖昧さ、範囲外の判断が生じたら推測せず`ESCALATE`で親Agentへ返す。

## 検証Agentの契約

`luna_validation_runner`には親Agentが選んだcommandを一度だけ実行させる。

- 親Agentがscript定義とargumentを先に確認し、禁止された処理を内部で実行しないと判断したcommandだけを渡す。
- 親Agentが同時に走るfile-writing Agentやcommandを待ち、既知の出力先と許容するartifact変更をpromptへ含める。
- command、argument、cwdを勝手に変更しない。
- `--update`、`--fix`、依存関係install、seed、migration、deploy、Production接続、対話login、server起動を実行しない。
- failureを修正せず、再試行で隠さない。
- 実行前後の`git status --short`と既知の出力先を比較し、tracked changeまたは予期しないartifactが生じたら停止して報告する。
- ignored artifactを確認できない場合や並行変更を検出した場合は、workspaceへの影響を`UNKNOWN`とし、commandの副作用だと断定しない。
- 既存変更を編集、削除、revert、stage、commitしない。
- command、cwd、終了code、所要時間、pass/fail、主要failure、環境制約、workspaceへの影響を返す。

## 返却形式

Agentには次の順で短く返させる。

1. `STATUS`: `COMPLETE`、`FAILED`、`ESCALATE`のいずれか
2. `SCOPE`: 実際に調べた範囲
3. `COMMANDS`: 実行したcommand
4. `EVIDENCE`: `path:line`またはlog位置付きの事実
5. `UNKNOWNS`: 未確認事項と除外範囲
6. `WORKSPACE_EFFECTS`: `NONE`、`EXPECTED`、`UNEXPECTED`、`UNKNOWN`のいずれかと根拠

raw outputを大量に親Agentへ戻さず、件数と代表的な根拠へ圧縮する。raw outputが既存fileにある場合はその場所だけを返し、退避のためだけに新しいfileを作らない。

## 親Agentの責務

- 委譲結果をユーザーへの最終回答へそのまま転記しない。
- 重要なpositive claimと0件のnegative claimを必要な範囲でspot-checkする。
- 設計、仕様、原因、優先度、security、UI/UX、Convex、migration、最終diff、検証範囲を判断する。
- `ESCALATE`または不完全な結果を別のLuna Agentへ再委譲せず、選択中のmodelで引き取る。
- Agentに子Agentをspawnさせない。
