# フロントエンドアーキテクチャ方針

## 目的と範囲

この文書は、メインアプリの `src/` における責務、依存方向、配置判断を定める。
`apps/analytics-dashboard/` は独立した内部BIであり、対象外とする。

現在のディレクトリと公開APIはコードを正本とする。
この文書は構造を丸ごと転記せず、新しい変更をどの境界へ置くかを決める。

## 設計原則

### 変更理由でまとめる

コードは技術要素ではなく、同じ理由で変更される単位にまとめる。
同じユーザー操作やユースケースで変わるコードはfeature、画面が変わっても意味が変わらない業務ルールはdomain、見た目だけを共有する部品はUI基盤が所有する。

### 上位層は処理の流れを組み立てる

上位層は、データ取得、非同期状態、ユーザー操作、画面遷移を組み立てる。
下位層は準備済みの値を表示し、利用者の意図をcallbackで上位へ返す。

```text
route
  -> page
       -> feature container / controller
            -> domain または feature-localな純粋処理
            -> ViewModel
                 -> view / leaf component
```

下位componentでraw DTOから業務上の操作可否や状態を再計算しない。
数行で完結し、JSXを理解するために必要な表示固有の導出はViewに残してよい。

### 依存を一方向にする

下位層から上位層をimportしない。
共有型をcomponent実装から逆向きにimportせず、所有する境界のcontractとして定義する。

認証、認可、店舗境界、課金権限は、表示状態だけでは保証できない。
Convex側の判定を正とし、フロントエンドは結果と回復方法を表示する。

### 最も近い所有者へ置く

再利用の可能性だけを理由に共通化しない。
一つのcomponentだけが使う処理は同じ場所、同じfeatureの複数componentが使う処理はfeature、独立した複数featureで同じ意味を持つ業務ルールはdomainが所有する。

画面を取り除いても同じ業務用語と入出力で説明できる場合にdomainとする。
二箇所から呼ばれることだけではdomainにしない。

## レイヤーの責務

存在しない責務のために、空のディレクトリや薄いwrapperを作らない。

| 配置 | 責務 | 置かないもの |
|---|---|---|
| `src/routes/` | URL、params、search、head、route group、redirect | query、mutation、業務状態、画面固有のJSX分岐 |
| `src/pages/` | route全体のquery、成立判定、loading、error、主要featureの構成 | mutation、submit flow、特定Dialogだけの状態 |
| `src/components/features/` | 一つのユーザー操作またはユースケース、mutation、action、状態遷移 | 無関係な複数ユースケース、横断的なUI基盤 |
| `src/components/shared/` | 複数featureで使う業務知識を持つ表示 | query、mutation、特定featureの状態機械 |
| `src/components/templates/` | 複数領域を持つページまたはアプリのレイアウト | 業務判定、業務API |
| `src/components/ui/` | ドメイン非依存のprimitive、Chakra UI wrapper、recipe | Convex API、業務型、業務文言、feature |
| `src/domains/` | 画面非依存の業務型、値、純粋関数 | React、Convex generated type、Chakra UI、router、DOM |
| `src/providers/` | React Context、外部SDK clientの初期化 | 機能UI、業務flow |
| `src/hooks/` | 複数featureで使うドメイン非依存のReact hook | 一つのfeatureだけの状態機械 |
| `src/stores/` | routeまたはfeatureをまたぐclient state | server stateの複製、feature内だけのstate |
| `src/lib/` | 業務知識を持たない技術的な共通処理 | 業務ルール、特定featureだけのhelper |
| `src/configs/` | JSXを持たない初期設定 | Provider、業務定数 |
| `src/assets/` | 複数featureで共有するimport asset | 一つのfeatureだけが使うasset |
| `src/devtools/` | Storybook preview、開発専用UI | production codeからの参照 |

`src/utils/`、`src/helpers/`、用途不明の `common.ts`、`misc.ts` は作らない。
所有者をfeature、domain、libのいずれかで表す。

## routeとpage

leaf routeは、対応するpageの公開入口を呼ぶ。
routeの `head` が使うmetadataは、対応するpageの `meta.ts` が組み立てる。

route全体が成立するために必要なqueryと主要entityの存在判定はpageが所有する。
特定のDialog、tab、一覧だけが必要とする遅延queryやpaginationは、そのfeatureが所有する。

route groupのguardはアクセス可否を表示上で制御できるが、サーバー側の認可を代替しない。

## 表示ライフサイクルと読み込み

### route成立と段階表示

ページ全体をLoadingにするqueryは、認証、routeの主要entity、画面を安全に成立させる判定に限る。
補助情報や独立したsectionのqueryは、未取得でもpage shellと取得済みのsectionを表示できる構造にする。
一つの子featureがLoadingであることを理由に、取得済みの兄弟featureまでpage全体のSkeletonへ戻さない。
互いの結果を引数に使わないqueryは並列に開始し、一方の完了を待ってから次を開始するwaterfallを作らない。

再取得中も直前の値を表示してよい場合は、最後に成立した値を保持し、更新中であることだけを対象sectionで示す。
権限、対象店舗、削除状態など、古い値の表示が誤操作につながる場合は保持せず、成立判定をやり直す。

### 非表示UIと購読

componentがReact treeに存在することと、APIを購読する必要があることを同一視しない。
Dialog、非選択tab、折りたたみ領域、viewport外の下位sectionが専用に使うqueryは、表示中または利用者が短時間で到達する状態になってから開始する。
feature containerまたはcontrollerが表示条件を所有し、`enabled`または`"skip"`で購読開始を制御する。
CSSによる非表示やTabsの非選択状態だけでは、hookと購読が停止したとみなさない。

mount、module取得、API購読は別のライフサイクルとして設計する。

- **lazy mount（`lazyMount`）**：初回表示までsubtreeをmountしない。重いフォーム、専用query、複数tabを持つDialogと非選択tabでは既定候補とする。
- **再非表示時のunmount（`unmountOnExit`）**：閉じるたびにsubtreeを破棄する。入力、scroll位置、未確定の局所状態を失ってよい場合か、非表示中の継続コストを止める必要がある場合だけ使う。
- **moduleのlazy load**：dynamic importでJSの取得と評価を初回利用まで遅らせる。大きなフォーム、editor、tour、chart、任意の外部SDKを候補とし、小さなleaf componentを無条件に分割しない。

moduleのlazy loadには、対象領域と同じ大きさのLoadingとError Boundaryを置く。
chunkの取得失敗やdeployment更新後の不整合が起きても、認証済み画面全体を空白にせず、対象領域で再試行または再読み込みへ回復できるようにする。

表示条件が成立し、query引数も確定している場合は、module取得と副作用のないreadを独立して開始してよい。
lazy moduleの評価とmountが終わるまでread開始も待つ直列処理を既定にせず、待ち時間が問題になるfeatureではcontrollerから同じ開始条件でpreloadとprewarmを行う。

一度表示したtabやDialogの入力状態を保持する必要がある場合は、subtreeをmountしたまま専用queryだけ停止してよい。
再表示時は、保持した状態と再取得したserver stateの競合をfeatureの契約として処理する。

mutation、外部副作用を持つaction、課金状態の変更、通知送信は、preload、hover、focus、viewport進入だけを理由に実行しない。
データの事前取得は、認可済みで副作用がなく、呼び出しコストを制限できるreadに限る。

### preloadとviewport

preloadは待ち時間を利用者の操作前へ移す最適化であり、成功しなくても通常のclickまたは表示開始から同じ結果へ到達できなければならない。
route navigationはTanStack RouterのLinkを優先し、buttonから命令的に遷移する場合は、同等のintent preloadが必要か確認する。

route moduleは、hover、focus、pointer intentなど、遷移確率が高まった時点でpreloadしてよい。
一覧の全行や未表示の全routeを一括でpreloadせず、通信量、module size、遷移確率から対象を絞る。

Convex queryをprewarmする場合は、queryと引数が遷移先の購読と一致し、引数が決定的で、保持時間が有限であることを確認する。
paginated query、時刻や乱数で毎回変わる引数、一覧行ごとの大量購読は、共有可能なquery keyと総購読数を設計できない限りprewarmしない。

長いページの下位sectionは、Intersection Observerなどでviewportへ入る少し前にmodule取得と副作用のないreadを開始してよい。
初期viewport内の主作業、認可判定、操作可否に必要なデータはviewport依存で遅延しない。
anchor linkやfocus移動などで下位sectionが直接対象になった場合は、viewportの監視結果を待たずに表示を開始する。

### 計測と分割の判断

APIの呼び出し箇所数だけで画面の遅さを判断しない。
同じqueryと引数の購読がclient内で共有される場合もあるが、それを重複した取得責務の根拠にはしない。
利用者を待たせる依存関係、購読の生存時間、再評価される範囲、queryの読み取り量を合わせて確認する。

CSR遷移は初回表示のWeb Vitalsだけでは評価できない。
利用者のclickまたはkeyboardによる遷移開始から、route moduleの取得と評価、route成立、主要contentの表示、遅延sectionの表示までを分けて計測する。
hoverやfocusからclickまでのintent preloadは別に記録し、preloadのhitとmiss、cache条件が異なる値を一つの分布へ混ぜない。
最適化前後は、正規化したroute単位のp50とp95で比較し、最も遅い依存を特定してから変更する。
計測名へdocument ID、店舗ID、検索語、個人情報を含めない。

module分割はproduction buildで、初期routeが読む総量、遅延chunkの大きさと個数、共通chunkの重複を変更前後で確認する。
小さなcomponentを細かく分割してrequestと失敗境界だけを増やさず、routeまたは独立したfeatureの境界を優先する。

遅延境界のテスト層と待機契約は `testing-strategy.md` が所有する。
利用者へ見せるLoadingとErrorの状態は `ui-design.md` が所有する。

## feature、shared、template

featureは、一つの操作、ユースケース、独立した変更理由のいずれかで切る。
画面名だけを理由に、独立したmutation、Dialog、状態機械を一つへ集約しない。

feature containerまたはcontrollerは、API接続、複数componentにまたがる状態、single-flight、Toast、Dialogの業務上の開閉理由、navigationを所有する。
Viewは準備済みのViewModelを描画し、intent callbackを呼ぶ。

sharedへ置く業務UIは、独立した複数featureで利用し、API接続と状態機械を持たないものに限る。
templateは複数のslotと共通navigationを所有し、単一のContainerを包むだけのcomponentにはしない。

薄い名前付きwrapperを作る前に、そのwrapperが業務上の意味、状態分岐、レイアウト責務のいずれかを持つか確認する。
propsを流すだけなら既存componentを直接使う。

## domainと境界変換

domainの入力は、判定に必要なfieldだけを持つplainな構造型にする。
Convex DTOを正規のdomain型として複製しない。

mutation引数をフロントエンドと共有するschemaは、所有するConvexのユースケースに置く。
フォーム表示だけに必要な制約は、フロントエンド側でそのschemaへ合成する。

field名、単位、nullability、集合形状が異なる外部境界は、featureのadapterでdomain inputへ変換する。
構造がそのまま適合する場合は、名前を変えるだけのadapterを作らない。

業務上の暦日は、既存の共通date helperで生成、変換する。
UTCへの変換結果を文字列として切り出し、店舗の業務日付に代用しない。

画面固有の見出し、説明、色、form初期値、API payloadはdomainへ置かない。
feature-localな純粋処理が所有する。

## importの境界

| import元 | 主な依存先 |
|---|---|
| leaf route | 対応するpageの公開入口とmetadata |
| page | featureの公開入口、template、shared、UI基盤、domain、横断基盤 |
| feature | 子featureの公開入口、shared、UI基盤、domain、横断基盤、Convex client hooks |
| shared | shared、template、UI基盤、domain、横断基盤 |
| template | template、UI基盤、横断基盤 |
| UI基盤 | 同じUI層、ドメイン非依存hook、lib、configs、React、Chakra UI |
| domain | 同じdomain、依存方向を決めた別domain、純粋な外部ライブラリ |
| lib | 同じlib、configs、技術的な外部ライブラリ |
| devtools | production側の公開入口 |

feature外からは、原則としてfeature rootの公開入口だけをimportする。
controller、adapter、純粋処理、子componentへdeep importしない。

UI bundleと分ける必要がある静的metadataは、副作用、hook、状態を持たないsecondary public entryとして公開してよい。
公開する理由と利用者を機能文書へ記録する。

leaf feature同士を直接接続しない。
複数featureのcallbackや状態遷移を接続する場合は、pageまたは明示的なcomposition featureから一方向に依存させる。

## ファイルの責務

| ファイル | 責務 |
|---|---|
| `index.tsx` | 公開component、feature rootでのcontrollerとViewの接続 |
| `script.ts` | 同階層に閉じる純粋処理、初期値、ViewModel、payload生成 |
| `use*.ts` | React hook、外部接続、effect、複数componentの状態遷移 |
| `*View.tsx` | 準備済みの値の描画、表示に閉じた局所状態、intentの通知 |
| `types.ts` | 複数ファイルで共有するcontract型 |
| `schema.ts` | 複数ファイルまたは複数formで共有するschema |
| `adapter.ts` | 外部DTOから内部のplain dataへの境界変換 |
| `stores.ts` | feature-scopedなatom、selector、write-only intent atom |
| `presentation.ts` | 判定済みの値からlabel、semantic token、座標への変換 |
| `meta.ts` | title、description、canonical、OGP、JSON-LDの組み立て |

責務を一語で表せる場合は、`buildSubmissionInput.ts` のような意味名を優先する。
一つの `script.ts` へ純粋処理を無条件に集めない。

component Propsは利用component、関数のinputとoutput型はその関数と同じファイルに置く。
複数ファイルのcontractになった場合だけ `types.ts` へ移す。

## 分割と共通化

行数だけで分割しない。
独立したユースケース、状態機械、フォーム、変更理由が同居したときに責務で分ける。

次の状態は分割を検討する合図になる。

- 独立したmutationまたはactionを複数管理している。
- API接続、Toast、navigation、form、大きなJSXのうち複数が同じファイルにある。
- 下位componentがraw DTOから業務判断を作り直している。
- 一つの変更で無関係なflowまで同じファイルを編集する。
- 純粋ロジックを切り出さないと契約をテストできない。

共通化は、現在の利用箇所と意味が一致すると確認できた範囲で行う。
将来の利用可能性だけを理由にwrapper、registry、helperを追加しない。

## 適用

新規コードはこの方針に従う。
既存コードは対象機能を変更するときに関連範囲だけ直し、無関係な再配置を同じ変更へ混ぜない。

実装とレビューの進め方は、対象範囲の `AGENTS.md` を参照する。
テスト層は `testing-strategy.md`、UIの判断は `ui-design.md`、セキュリティ境界は `security-strategy.md` が所有する。
