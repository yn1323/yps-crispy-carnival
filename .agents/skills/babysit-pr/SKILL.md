---
name: babysit-pr
description: ユーザーが`$babysit-pr`を明示したとき、現在のcheckoutの依頼範囲にある未push変更をcommit・pushしてPull Requestを作成し、GHAと自動レビューを最新headまで監視する。自動レビューの全指摘を優先度にかかわらず検証し、有効なら修正・対象確認・再commit・pushして監視をやり直す。通常の実装、テスト実行、commit、PR相談では自動的に使わない。
---

# PRチェックと自動レビューを最新headで完遂する

このSkillの明示的な呼び出しを、依頼範囲の修正、テスト更新、commit、push、Pull Request作成、自動レビューの再依頼と指摘への返信、CI再実行の許可として扱う。
新しいbranchやworktreeの作成、依頼外の変更、secretの変更、VRT差分の承認は許可に含めない。

## 併用スキル

複数fileにまたがる大規模なlocal diff、取得済みの巨大なGHA logを、原因判断から独立した事実へ圧縮できる場合だけ、`$delegate-bounded-repo-work`を併用する。
対象判定、固定model、委譲契約は同Skillを正本とする。
GitHub・GHAへの接続と監視、失敗原因と修正要否の判断、修正、対象test、rerun、stage、commit、push、Pull Request作成は本Skillの親Agentが判断・実行する。
最後の関連変更より後に同じworkspace状態で成功した検証は再利用し、監視段階へ進んだという理由だけで再実行しない。

## ゴールを設定する

goal追跡機能を利用でき、未完了のgoalがない場合は、次の内容を一つのgoalとして設定する。

> 依頼範囲の未push変更をcommit、pushしてPull Requestを作成し、GHAと自動レビューを監視する。失敗または有効な指摘があればローカルで修正・対象確認を行い、最新head SHAのVRT compare以降を除くcheckをすべて成功させ、自動レビューの全指摘を判断済みにする。

未完了のgoalがある場合は勝手に置き換えず、今回の完了条件を作業基準として扱う。
長い処理ではplanを更新し、進捗、失敗原因、次の対応を簡潔に共有する。

## 最初に読む

1. rootと対象に近い`AGENTS.md`
2. `package.json`、PlaywrightとVitestの設定
3. `.github/workflows/`と`doc/manual/ci-cd.md`
4. テストを追加または変更する場合は`test-strategy`
5. PR本文を書く場合は`japanese-tech-writing`

コマンド、test project、workflow、check名の現在値はリポジトリを正本とし、このSkillの例より優先する。

## 1. 変更範囲とpushの安全性を確認する

default branchの最新remote-tracking refを取得してから、会話上の依頼に属する変更だけを特定する。
bareなlocal branchは更新が遅れている可能性があるため、比較元に使わない。

```bash
git status --short
git branch --show-current
base_branch="$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')"
git fetch --no-tags origin "refs/heads/${base_branch}:refs/remotes/origin/${base_branch}"
base_ref="origin/${base_branch}"
git rev-parse --verify "$base_ref"
git merge-base "$base_ref" HEAD
git log "$base_ref"..HEAD --oneline
git diff "$base_ref"...HEAD --stat
```

- 現在のcheckoutから移動せず、新しいbranchやworktreeを作らない。
- fetchまたはremote base refの検証に失敗した場合は、古いlocal refへfallbackせず停止する。
- 現在branchが空、base branchそのもの、またはPRに不要なcommitを含む場合はpushしない。
- 既存の未commit変更はユーザーの変更として扱う。依頼範囲だと確認できないファイルを編集、復元、stageしない。
- 依頼範囲に属する既存の未push commitは、現在branchからまとめてpushする。依頼外のcommitが混在する場合は安全に分離できるまでpushしない。
- stage済みの依頼外変更を安全に分離できない場合はcommit前に停止する。
- `.env*`、credential、secret、個人情報をcommit、PR本文、logへ含めない。

同じhead branchのopen Pull Requestがある場合は、commitやpushより前に既存の自動レビューinline commentを取得し、最新コードでも成立する指摘を今回の修正へ含める。
解消すると分かっている指摘を残したまま、まもなく置き換えるhead SHAへ再レビューを依頼しない。

## 2. 実装とテスト契約を整える

GHAが失敗した場合は、変更に近いテストから確認し、失敗原因を実装、期待値、fixture、環境に分ける。初回push前にローカルの全テスト、全E2E、全体lint・type-check・buildは実行せず、先にcommit、push、Pull Request作成へ進み、GHAの結果を確認する。

- 意図した仕様変更で既存契約が変わった場合、またはテスト自体に欠陥がある場合だけテストケースを修正する。
- 実装不具合を期待値の緩和で隠さない。
- testのskip、対象tagの除外、retry増加、assertion削除だけで成功させない。
- 新しい契約や回帰を追加する場合は`test-strategy`で主担当層を選び、同じ契約を複数層へ重複させない。
- E2Eを追加または変更する前に`e2e/AGENTS.md`を読み、既存Page Objectとfixtureを使う。
- 開発serverは新規起動せず、ユーザーが起動しているserverを使う。

## 3. GHA失敗時だけローカルで検証する

初回push後はGHAの失敗を起点に調査する。GHAが成功した場合、追加のローカル全体テストは要求しない。

- 最初に失敗したstepとlogを確認し、原因をコード、テスト、fixture、設定、runner、外部serviceに分類する。
- コード、テスト、fixture、設定の修正が必要な場合は、ローカルで修正してから、失敗境界に対応する対象だけを確認する。lint、type-check、build、単体テストは現在のpackage scriptとtest projectに合わせた対象限定コマンドを優先し、全体実行を必須にしない。
- ローカル確認が成功した修正だけをcommit、pushする。push後は新しいhead SHAのGHAを最初から監視する。
- runnerや外部serviceの一時障害と確認できる場合は、コードを変更せず、該当jobの再実行を検討する。失敗原因を確認せず、成功するまで機械的に再実行しない。

### E2E失敗を調べる

E2Eが失敗した場合は、追加のE2Eを一括実行せず、失敗したテスト単体をローカルで実行して確認する。

1. GHAの失敗step、trace、screenshot、logと、失敗したspec・testを特定する。
2. そのテスト単体を、現在のrepoのscript・project・fixtureに合わせてローカル実行する。
3. ローカルでも再現する場合は、実装不具合、selector、待機、fixture、共有状態などを調査して修正する。修正後もそのテスト単体と、変更に直接関係する必要最小限の確認だけを行う。
4. ローカルで再現せず、GHAの一時的なtimeout、runner、外部service、共有状態などの兆候がある場合は、Flakyまたは環境要因の可能性を記録して評価する。失敗一回だけを根拠にテストを弱めたり、不要なretryを追加したり、アプリコードを変更したりしない。
5. Flakyの可能性を確認するための再実行は回数を限定し、失敗logと実行履歴を踏まえて修正要否を判断する。再実行で成功しただけではコード修正完了とみなさない。

## 4. 自己レビューしてcommitする

初回push前、またはGHA失敗への修正後に差分を読み直し、不要な複雑さ、重複、弱めた検証、依頼外変更がないことを確認する。

1. `git status`、unstaged diff、staged diffを確認する。
2. 今回の依頼に属するファイルだけを個別に`git add <path>`する。`git add .`と`git add -A`は使わない。
3. 意味のあるrevert単位へ分け、日本語のConventional Commitでcommitする。
4. `--amend`、`--no-verify`、対話的Git commandを使わない。
5. hookがファイルを変更した場合は差分を確認し、修正に対応する対象限定のローカル確認を再実行してから新しいcommitを作る。

## 5. pushしてPull Requestを作成する

push直前に上記のfetchとremote base refの解決をもう一度行い、`origin/<base>..HEAD`のcommit、
`origin/<base>...HEAD`のdiff、merge-baseを再確認する。
依頼外の履歴がなく、対象変更がすべてcommit済みの場合だけ現在branchをpushする。

同じhead branchのopen Pull Requestがあれば重複作成せず再利用する。
なければ、変更の目的、利用者に見える差分、実施した確認を日本語で記載し、非draftのPull Requestを作成する。
PR URL、number、base、head branch、head SHAを記録する。

自動レビューは新しい非draft Pull Requestの作成時に開始されるため、直後に重複依頼しない。GHAとVRT compare開始まで到達しても最新SHAのレビュー完了を確認できない場合は、そのSHAへ一度だけ明示的に依頼する。
既存Pull Requestへのpushと、自動レビューまたはGHAの指摘を直した後のpushでは、pushだけを再レビュー開始の証拠にせず、最新head SHAにつき一度だけ`@codex review`をコメントして再レビューを依頼する。
commentには`<!-- babysit-pr:review-head=<full-head-sha> -->`を含める。再開時はこのmarkerを検索してから依頼し、同じSHAのmarkerがあれば重複投稿しない。
依頼時のhead SHA、comment ID、作成時刻と、依頼前から存在するCodexのreview・reaction IDを記録する。同じSHAへ待ち時間を理由に再依頼を重ねない。

```bash
gh api repos/<owner>/<repo>/issues/<pr>/comments \
  --raw-field body="@codex review

<!-- babysit-pr:review-head=${head_sha} -->" \
  --jq '{id,created_at,html_url}'
```

## 6. 最新SHAのcheckと自動レビューを並行監視する

60秒を超えて無言で待たず、30から60秒間隔の短いpollで状態変化を確認する。

```bash
gh pr view <pr> --json headRefOid,url
gh pr checks <pr> --json name,workflow,bucket,state,link
gh run list --workflow=vrt.yml --commit <head-sha> --event pull_request --json attempt,conclusion,databaseId,headSha,status,url --limit 10
gh api --paginate repos/<owner>/<repo>/pulls/<pr>/reviews
gh api --paginate repos/<owner>/<repo>/pulls/<pr>/comments
gh api --paginate repos/<owner>/<repo>/issues/<pr>/comments
gh api --paginate repos/<owner>/<repo>/issues/<pr>/reactions
gh api --paginate repos/<owner>/<repo>/issues/comments/<review-request-comment-id>/reactions
```

- PRの`headRefOid`がpushしたcommit SHAと一致することを確認する。
- checkが0件、未起動、pendingの場合は成功扱いせず待つ。
- 失敗時はcheckのlinkから該当runを特定し、最初に失敗したstepとlogを確認する。
- コードまたはテストの失敗は、まず対象をローカルで確認する。修正した場合は対象限定のローカル確認を通し、新しいcommitをpushする。E2Eは失敗したテスト単体だけをローカルで実行し、Flakyや環境要因の可能性を評価してから修正要否を決める。
- 一時的なrunnerまたは外部service障害だとlogで確認できた場合だけfailed jobを再実行する。コード失敗をrerunで通そうとしない。
- flaky testは成功するまで無制限に再実行せず、共有状態、時刻、待機、selector、fixture、runnerの原因を切り分ける。再実行で成功しただけの場合は、修正済みとも失敗原因解消とも扱わない。
- workflowやテストを無効化し、必須checkを減らして成功させない。
- 新しいpush後は古いrunと古い自動レビュー完了を捨て、最新head SHAのcheckと自動レビューを最初から確認する。
- VRT workflowは最新head SHAに一致するrunを確認し、`prepare`、`build`、全`capture`が成功して`compare`が開始されるまで待つ。
- `compare`が開始された後は、`compare`の完了、VRT Reportの公開、VRT Reportコメント、`VRTApprove`を待たない。

### 自動レビューの完了を最新SHAへ結び付ける

GHA checkだけではレビュー完了を判定できない。現在のrepositoryではCodex reviewのactorを`chatgpt-codex-connector[bot]`として確認し、RESTとGraphQLで表記が異なる場合は`chatgpt-codex-connector`のprefixを同一actorとして扱う。

自動レビューの完了は、head SHAが監視開始時から変わっておらず、次のいずれかを確認できた場合だけ成立する。明示的な依頼commentへのCodexの👀は受付または開始のsignalであり、完了ではない。

1. **指摘あり:** Codexのsubmitted reviewの`commit_id`が最新head SHAと一致する。review本体だけで終えず、そのreviewに属するinline commentをすべて取得する。
2. **SHA付きの指摘なし:** Codexのissue commentが`Reviewed commit`、`headSha`、または同等のfieldで最新head SHAを示し、`Codex Review: Didn't find any major issues`や`<!-- codex-pull-request-review-summary -->`の成功statusなどで指摘なしを明示する。
3. **reactionによる指摘なし:** 新規Pull Requestでは、作成後にCodexの新しい👍 reactionが作られ、その間headが変わっていない。既存Pull Requestへのpush後は、最新SHAのmarker付き`@codex review`依頼より後に、依頼前のsnapshotにはなかったCodexの👍 reactionが作られている。PR本体と再レビュー依頼commentの両方のreactionを確認する。既存Pull Requestで依頼前からあるreactionは、作成時刻にかかわらず最新SHAの証拠に使わない。

review threadの`isResolved`や`isOutdated`が必要な場合はGraphQLの`reviewThreads`も取得する。`outdated`は行位置が古いことしか示さないため、指摘内容が最新headにも成立するかをコードで確認する。
reviewが遅い間にGHAが完了しても待機を続ける。固定timeoutは設けず、経過時間だけを理由にレビュー完了、指摘なし、失敗とは判断しない。同じSHAへ再依頼を連打せず、poll間隔を維持して状態を共有する。
GitHubが明示的な失敗を返す、PRが閉じる、headが第三者により変わる、または認証・権限不足で結果を取得できない場合は、事実を確認してから監視をやり直すかユーザーへ必要な対応を求める。
botが応答したのに既存reactionと区別できないなど、最新SHAへ結び付く完了証拠をGitHub APIから得られない場合は、推測で完了にせず、観測できない証拠と必要な人手確認を示す。

### 自動レビューの全指摘を判断する

最新reviewだけでなく、以前のheadに付いた未判断の自動レビュー指摘も列挙する。古い指摘は、最新headですでに直ったか、まだ成立するかを確認する。

| 判定 | 対応 |
|---|---|
| 最新headでも成立する | 優先度にかかわらず修正し、変更契約に対応する対象限定のローカル確認を行う |
| すでに修正済み | 修正されたコードと必要なテストを確認し、追加変更が不要な根拠を記録する |
| false positive、重複、またはPR変更と無関係 | コード、テスト、仕様の具体的な根拠を確認し、簡潔に返信する |
| 正当だが新しい権限や独立した製品判断が必要 | 自分で先送りして完了にせず、未達条件と必要な判断をユーザーへ示す |

P0からP3などのpriorityは影響度の情報であり、修正不要の理由ではない。PRの変更で生じる、または変更契約に含まれる有効な指摘は、P2やP3でも修正する。
「軽微」「今回は見送る」「別PRで対応する」だけで不要判定にしない。修正しない判断には、誤検知、最新headで解消済み、重複、PRと無関係、または新しい権限・製品判断が必要であることの具体的な根拠を要求する。

有効な指摘を修正した場合は、自己レビューと対象限定のローカル確認を通し、意味のある単位でcommit、pushする。その時点で前のCIとレビュー完了は無効となるため、新しいhead SHAへ一度だけ`@codex review`を依頼し、GHAと自動レビューを両方最初から監視する。

### VRT compare以降の例外

例外にできるのは、`compare`が開始された後の`compare`、VRT Reportの公開、VRT Reportコメント、
VRT差分を人が確認するためのapproval gateである`VRTApprove`とする。
`prepare`、`build`、全`capture`の成功前はこの例外を適用しない。
表示名が変わっている場合は、`.github/workflows/vrt.yml`のapproval jobと`vrt-approval` environmentの組合せで同一性を確認する。
名前に`VRT`を含むprepare、build、captureなど、`compare`より前のjobは例外にしない。
`VRTApprove`を自動承認したり、environment protectionを回避したりしない。

VRTの`compare`以降を除き、最新head SHAに対する全checkが成功状態であることを要求する。
cancelled、failure、pending、想定外のskippedまたはmissingをオールグリーンと数えない。

## 7. 完了を判定する

次のすべてを満たした場合だけ完了とする。

- 初回push前のローカル全体テストは不要とする。GHA失敗へのコードまたはテスト修正を行った場合は、該当する対象限定のローカル確認が成功している。
- E2E失敗に修正を加えた場合は、失敗したE2Eテスト単体のローカル確認が成功している。ローカルで再現しなかった場合は、Flakyまたは環境要因の根拠と修正不要と判断した理由を確認している。
- 依頼範囲の変更がcommit、push済みで、Pull Requestのhead SHAと一致する。
- 最新head SHAのVRT `prepare`、`build`、全`capture`が成功し、`compare`が開始された。
- 最新head SHAのVRT `compare`以降を除く全checkが成功した。
- 最新head SHAに結び付くCodex review、指摘なしcomment・summary、またはPull Request作成・レビュー依頼後の新しい👍を確認している。
- 新旧headの自動レビューinline commentをすべて列挙し、有効な指摘は修正済み、それ以外は具体的な根拠を記録済みで、未判断の指摘がない。
- 依頼外の既存変更を編集、stage、commitしていない。

goal追跡を開始していた場合は、この時点でだけcompleteにする。
PR URL、最新SHA、ローカル検証結果、PR check結果、VRTが`compare`へ到達したこと、自動レビューの完了根拠と各指摘の判断、残した依頼外変更を報告する。

現在branchの履歴が安全にPR化できない、必要なserverやcredentialがない、`VRTApprove`以外の人手承認が必要、または外部障害が続く場合は、勝手にbranch作成、secret変更、check回避を行わない。
確認済みの事実と必要な対応を示し、完了条件を未達のまま報告する。
