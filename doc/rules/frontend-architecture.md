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
