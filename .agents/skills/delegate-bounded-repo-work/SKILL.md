---
name: delegate-bounded-repo-work
description: このリポジトリで、通常実装から独立した大規模なread-only調査、対応表・棚卸し、巨大な既存log・diffの圧縮、編集完了後の長時間な最終検証を、境界明確なsubtaskとしてGPT-5.6 Lunaへ委譲する。複数検索語や複数directoryという理由だけでは発動しない。実装場所を探す通常探索、原因診断、設計判断、対象test・再実行、短いcommand、Production・外部副作用・Git変更には使わない。
---

# 境界明確なリポジトリ作業を委譲する

親Agentの判断と最終品質を維持したまま、大量の入力を短い根拠へ圧縮できる定型作業を低コストAgentへ分離する。
SubAgentの待ち時間が実装のcritical pathへ入る場合や、親Agentが同じ入力を読み直す場合は委譲しない。
このSkillは適用できるsubtaskだけを扱い、依頼全体の担当modelを置き換えない。

## 最初に委譲可否を判定する

toolを使う前、Agentをspawnする前に、切り出すsubtaskが次の条件をすべて満たすか判定する。

- 成果物が事実の一覧、対応表、圧縮したlog・diff、または正確な最終検証結果である。
- 対象root、file、log、diff、commandと完了条件をspawn前に固定できる。
- 入力が十分に大きく、短い返却結果によって親Agentの読み取り量を実質的に減らせる。
- 結果を待たずに親Agentが別の有用な作業を進められるか、編集が完了した後の最終検証である。

複数の検索語、検索方法、directoryを使うこと自体は発動条件にしない。
Skillを明示的に指定されても、条件を満たさないsubtaskではAgentをspawnしない。
該当するか不明な場合は親Agentが引き取り、通常のAgent選択へ戻る。

## 固定ルーティング

- 調査系は`luna_evidence_collector`を使い、modelを`gpt-5.6-luna`、reasoning effortを`medium`に固定する。
- 検証実行系は`luna_validation_runner`を使い、modelを`gpt-5.6-luna`、reasoning effortを`low`に固定する。
- `latest`などの可変aliasを使わず、新modelへ自動更新しない。ユーザーが明示した場合だけこのSkillとAgent定義を変更する。
- 名前付きCustom Agentを選択できない実行面では、同じmodelとeffortをspawn時に明示し、該当Agentの制約をtask promptへ含める。
- modelまたはCustom Agentを利用できない場合は、別modelへ代替しない。親Agentへ戻し、委譲できなかったことを報告する。
- 対象外の作業ではこのSkillの適用を終え、通常のAgent選択へ戻す。

## 委譲する調査

最初の条件をすべて満たし、次のいずれかに該当するread-only調査を委譲する。

1. 多数のfileや複数領域を横断し、定義、call site、test、文書などの対応表自体を成果物とする調査。
2. 多数のfileにまたがるexport、test名、設定、scriptなどの大規模な棚卸し。
3. おおむね500行以上、または複数のcommandやfileにまたがる既存log・diffから、事実、件数、代表的な根拠だけを抽出する作業。

通常実装で編集場所を見つける探索、次の編集判断に直結する調査、原因診断は親Agentが行う。
一つのfile、短い入力、失敗箇所が分かっているlog・diffは親Agentが直接読む。
同じroleへ渡せる複数の調査は一つのtaskへまとめ、Agentのfan-outを増やさない。

## 任意で委譲できる最終検証

編集が完了し、file-writing Agentやcommandが残っていない場合だけ、長時間の最終的なtest・lint・buildを`luna_validation_runner`へ委譲してよい。
対象test、red-greenの確認、失敗後の再実行、短いcommand、出力が小さいcommandは親Agentが直接実行する。
検証結果が返るまで親Agentが読み取りの自己レビューなどを進められない場合は委譲しない。

同じcommandが、最後の関連変更より後に同じworkspace状態で成功している場合は、その結果を再利用する。
commit、Pull Request作成、babysitなど作業段階が変わったという理由だけで同じ検証を再委譲しない。

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

`luna_validation_runner`には、親Agentが最終検証として選んだcommandを一度だけ実行させる。

- 親Agentがscript定義とargumentを先に確認し、禁止された処理を内部で実行しないと判断したcommandだけを渡す。
- 親Agentがfile-writing Agentやcommandの完了を待ち、既知の出力先と許容するartifact変更をpromptへ含める。
- command、argument、cwdを勝手に変更しない。
- `--update`、`--fix`、依存関係install、seed、migration、deploy、Production接続、対話login、server起動を実行しない。
- failureを修正せず、再試行で隠さない。失敗後の対象確認と再実行は親Agentへ返す。
- 実行前後の`git status --short`と既知の出力先を比較し、tracked changeまたは予期しないartifactが生じたら停止して報告する。
- ignored artifactを確認できない場合や並行変更を検出した場合は、workspaceへの影響を`UNKNOWN`とし、commandの副作用だと断定しない。
- commandが生成できるのは親Agentが許可したartifactだけとする。Agent自身はcommandの実行以外で既存fileや生成fileを編集、削除、revert、stage、commitしない。
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
- 編集または最終判断に使うpositive claimと、影響の大きい0件のnegative claimだけを必要な範囲でspot-checkする。
- SubAgentの返却後に同じ入力を広く読み直す必要があると分かった場合は、以後の同種作業を親Agentが引き取る。
- 設計、仕様、原因、優先度、security、UI/UX、Convex、migration、最終diff、検証範囲を判断する。
- `ESCALATE`または不完全な結果を別のLuna Agentへ再委譲せず、選択中のmodelで引き取る。
- Agentに子Agentをspawnさせない。
