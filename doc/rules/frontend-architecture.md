# フロントエンドアーキテクチャ方針

## 目的

このドキュメントは、メインアプリの `src/` におけるディレクトリ、依存方向、ファイル内部の責務を定義する。

新規実装、修正、レビュー、リファクタリングでは、このドキュメントをフロントエンド配置判断の Source of Truth とする。

`apps/analytics-dashboard/` は独立した内部BIであり、この方針の対象外とする。
内部BIでは `apps/analytics-dashboard/AGENTS.md` を優先する。

## 設計原則

### 変更理由が同じコードをまとめる

ディレクトリとファイルは、技術要素ではなく変更理由で分ける。

同じユーザー操作や業務ルールによって一緒に変わるコードは同じfeatureへ置く。
画面が異なっても同じ意味を持つ業務ルールはdomainへ置く。
見た目だけを共有する部品はuiへ置く。

### 上位層は流れを組み立てる

上位のfeature containerまたはcontrollerは、処理を呼ぶ順序、非同期状態、画面状態、ユーザー操作後の遷移を担当する。

業務判定、正規化、ソート、計算を上位コンポーネントへ直接書くわけではない。
画面が変わっても意味が変わらない業務ルールは `domains/`、そのfeatureだけで使うテスト対象または複雑な純粋処理は `script.ts` へ置く。
数行で完結し、JSXを読むために必要な表示固有の導出はViewに残してよい。

```text
route
  -> page
       -> feature container / controller
            -> domain または script.ts
            -> ready-to-renderなViewModel
                 -> view / leaf component
```

下位componentは、準備済みの値を表示し、ユーザーの意図をcallbackで上位へ返す。
下位componentがraw DTOから業務上の操作可否や状態を再計算しない。

### 依存は上位から下位へ一方向にする

下位層は上位層をimportしない。
循環依存を避けるため、共有型をcomponentファイルからimportしない。

認可、店舗境界、token有効性、課金権限はフロントエンドの状態や表示で保証しない。
これらの正はConvex側の検証とし、フロントエンドは検証結果を表示する。

### 最も近い所有者へ置く

配置は次の順序で決める。

1. 一つのcomponentだけで使う業務判定、テスト対象、またはViewを読みにくくする純粋処理は、同階層の `script.ts` に置く。
2. 同じfeature内の複数componentで使う純粋処理は、共通の親featureの `script.ts` または意味名を持つ純粋ファイルに置く。
3. 独立した複数featureで同じ意味を持つ業務ルールは、`domains/{domain}/` に置く。
4. 独立した複数featureで使う業務知識を持つUIは、`components/shared/` に置く。

二つの画面で使うという理由だけでdomainへ移さない。
画面を取り除いても同じ業務用語と入出力で説明できる場合にdomainとする。

## 標準ディレクトリ構成

メインアプリの `src/` は次の責務で構成する。
責務が存在しないディレクトリを、構成を揃える目的だけで作成しない。

```text
src/
  routes/                 URL境界
  pages/                  route単位の画面構成、route-wide query、metadata
  components/
    features/             ユーザー操作またはユースケース
    shared/               複数featureで使う業務UI
    templates/            ページやアプリのレイアウト
    ui/                   ドメイン非依存のUI基盤
  domains/                画面非依存の業務型と純粋ロジック
  providers/              React ProviderとSDK初期化
  hooks/                  横断的なReact hook
  stores/                 アプリ横断のclient state
  lib/                    業務知識を持たない技術的な共通処理
  configs/                JSXを持たない設定
  constants/              真にアプリ横断の定数
  assets/                 複数featureで共有するimport asset
  devtools/               本番から参照しない開発用UI
```

`src/utils/` と `src/helpers/` は使用しない。
コードは、所有feature、`domains/`、`lib/` のいずれかへ配置する。

React Providerは `src/providers/`、Storybook用previewは `src/devtools/` へ置く。
`src/components/mock/` のような用途横断のmock置き場は作らず、Story fixtureは所有feature、開発専用UIは `src/devtools/` へ置く。

## 命名規則

- UI componentのディレクトリとcomponent名は `PascalCase` にする。
- pageのディレクトリはroute slugに対応する `kebab-case` にし、公開componentは `{Name}Page` とする。
- domainのディレクトリは `shift` のような業務上の名詞にし、純粋ファイルは `date.ts`、`sortStaffs.ts` のように内容を表す名前にする。
- 子componentは `PascalCase.tsx`、hookは `use{Name}.ts`、意味名を持つ純粋処理は `buildSubmissionInput.ts` のように命名する。
- Storyとtestは対象ファイルのbasenameへ合わせる。
- `common`、`misc`、`utils`、`helpers` のように所有者や変更理由が分からない新規ディレクトリとファイルは作らない。

`Page`、`View`、`Provider`、`Guard` のsuffixは、実際にその責務を持つcomponentだけに付ける。
画面全体を表すという理由だけで巨大なfeatureへ `Page` を付けない。

## ディレクトリの責務

### `src/routes/`

routeはURL境界だけを担当する。

書いてよい内容は次のとおりとする。

- `createFileRoute`
- `head`
- `validateSearch`
- paramsとsearchの受け渡し
- route groupのProvider、guard、layout、`Outlet`
- page componentの呼び出し

leaf routeは `src/pages/{page}/index.tsx` を呼ぶ。
静的ページでも同じ境界を使い、routeからfeature内部を直接組み立てない。

`head` から使うtitle、description、JSON-LDなどは、対応するpageの `meta.ts` で組み立てる。
routeはpage componentと同じpageディレクトリの `meta.ts` だけを参照し、content featureやSEO helperを直接importしない。

例外は `__root.tsx`、route group、redirectだけを行うrouteとする。

`__root.tsx` とroute groupでは、global provider、Toaster、guard、trackerを置いてよい。
ただし、route内でpathnameを判定して画面を切り替えず、index routeまたはchild routeで表現する。

routeには `useQuery`、`useMutation`、`useAction`、業務状態、業務上のJSX分岐を書かない。

### `src/pages/`

pageはroute単位の画面構成と、route全体の成立に必要な読み取りを担当する。

書いてよい内容は次のとおりとする。

- route全体の成立に必要な `useQuery` と `usePaginatedQuery`
- route params、search、認証済み店舗などから作るquery引数と `"skip"` の判定
- route全体のloading、error、null、empty、normalの分岐
- route全体に必要なProviderまたはtemplateの組み立て
- route params、search、query結果から正常系featureへ渡す入力の選択

pageは `useMutation` と `useAction` を定義しない。
single-flight、Toast、Dialog、submit後の状態遷移もfeature側へ置く。

pageはroute全体の成立判定に必要なdomainの純粋関数を呼んでよい。
複数entityのfilter、sort、group、ViewModel生成はpageで行わず、domain、featureの `script.ts`、またはcontrollerのいずれか一つへ置く。

特定のDialog、tab、一覧だけが必要とするlazy query、pagination、再読み込みは、そのfeature containerが所有する。
pageへ全queryを集約することを目的にしない。

### `src/components/features/`

featureは、一つのユーザー操作、ユースケース、または独立して変更される業務機能を担当する。

画面名をそのまま巨大なfeature境界にしない。
Dashboardのような画面featureは、募集管理、スタッフ管理、店舗設定などの子featureを並べるcompositionに限定する。

feature containerまたはcontrollerが担当する内容は次のとおりとする。

- feature内だけで必要な `useQuery` と `usePaginatedQuery`
- `useMutation` と `useAction`
- 複数componentにまたがる状態、状態遷移、ref、effect
- `useSingleFlight`
- 業務Dialogのopen/close、confirm intent、非同期処理順序とToastの制御
- navigation
- domainと `script.ts` を呼ぶ順序
- ViewModelとintent callbackの生成

一つのcontrollerへ複数の独立したmutation群を集約しない。
mutationとDialogは、それを利用するユースケースfeatureが所有する。
DialogのmarkupはViewが描画し、controllerは業務上の開閉理由と確定処理を所有する。

feature-local queryは、そのfeatureを表示しなくてもroute全体が成立する場合に限る。
route全体のaccess、主要entityの存在、page全体のloadingを決めるqueryはpageへ置く。

認証guardのようにroute group全体を保護するcomponentは、例外としてqueryを利用できる。
このqueryは表示都合ではなくroute accessの判定に限定し、サーバー側の認可を代替しない。

### `src/components/shared/`

sharedは、複数featureから使う業務知識を持つUIを担当する。

次の条件をすべて満たす場合だけsharedへ置く。

- 独立した複数featureに利用箇所がある
- 業務上の名前を持つ
- query、mutation、actionを実行しない
- 特定featureの状態機械を所有しない

法務文書リンクやスタッフ向け案内のような部品はshared候補となる。
単なる見た目の再利用は `components/ui/` に置く。

### `src/components/templates/`

templateは、複数のslotや領域を持つページまたはアプリのレイアウトを担当する。

Header、StaffLayout、公開ページshellのように、子要素の配置と共通navigationを所有するcomponentを置く。

単一の `Stack` や `Container` を包むだけの薄いwrapperはtemplateにしない。
業務mutation、query、業務上の操作可否はtemplateへ置かない。

認証ボタンなどの操作が必要な場合は、feature側で組み立てたslotまたはcallbackを受け取る。

### `src/components/ui/`

uiは、ドメイン知識を持たないUI基盤を担当する。

Chakra UIのwrapper、recipeを適用したprimitive、汎用Dialog、汎用Toast描画を置く。

uiは次のものをimportしない。

- Convex APIと `ConvexError`
- feature
- domain固有の型と文言
- Jotaiの業務store
- template

業務エラーからユーザー向け文言への変換はuiではなく、featureまたはsharedのfeedback境界に置く。

### `src/domains/`

domainは、画面が変わっても意味が変わらない業務型、値、純粋関数を担当する。

代表例は、シフト期間判定、時刻変換、割当計算、業務上のソート、正規化である。

domainは次のものへ依存しない。

- ReactとReact hook
- Convex API、generated type、schema
- Chakra UI
- TanStack Router
- Jotai
- DOM、window、localStorage
- 画面固有のUI文言とcomponent Props

domainの入力は、その判定に必要なfieldだけを持つplainな構造型にする。
Convex DTO全体を複製した型は作らず、構造的型付けで必要なfieldだけを受け取る。
複数featureで共有する正規の業務entityが必要な場合だけ、DTOではなく業務概念としてdomain型を定義する。

field名、単位、nullability、集合形状が異なる場合は、feature配下のadapterでdomain inputへ変換する。
構造がそのまま適合する場合は、薄いadapterを作らず、featureから必要なfieldを明示して渡すかDTOを直接渡してよい。
どちらの場合もdomainからConvex generated typeをimportしない。

画面をまたいで意味と表記が安定している日時、期間、業務値のformatはdomainに置いてよい。
画面固有の見出し、説明文、操作文言、色、Chakra tokenはdomainへ置かない。

純粋であっても、特定画面の日本語見出し、step、表示色、form初期値、API payload変換はdomainへ置かない。
これらはfeatureの `script.ts` に置く。

### `src/providers/`

providerは、React Contextと外部SDK clientの初期化を担当する。

Clerk、Convex、ChakraなどのProviderを置く。
providerは機能UIや業務フローを持たない。

### `src/hooks/`

root hooksは、独立した複数featureで使う横断的なReact hookだけを担当する。

`useSingleFlight` やVisual Viewport処理のように、特定の業務featureを所有しないhookを置く。

StaffSessionのように業務用語と状態機械を持つhookは、所有featureへ置く。
feature内だけで使うhookもfeatureへ置く。

### `src/stores/`

storeは、複数のrouteまたはfeatureをまたいで共有するclient stateを担当する。

feature内で閉じる状態はfeature内のstateまたはscoped Jotai Providerへ置く。
server stateをatomへ複製せず、Convex queryの結果を正とする。

### `src/lib/`

libは、業務知識を持たず、独立した複数featureまたはアプリ基盤から使う技術的な共通処理を担当する。

SEO、MDX、GTM、browser判定のような技術領域ごとにサブディレクトリを作る。
`utils.ts` や `common.ts` のような用途不明のファイルを作らない。

業務ルールはlibへ置かず、domainまたはfeatureへ置く。
一つのfeatureだけが使うbrowser、URL、sanitize処理は、技術処理であっても所有featureへ置く。

### `src/configs/`

configsは、JSXを持たない設定を担当する。

theme、Zod、environment、test setupのような初期設定を置く。
React Providerは `providers/` に置く。

### `src/constants/`

constantsは、複数の業務領域で同じ意味を持つ固定値だけを担当する。

feature内の固定値はfeature、業務上の固定値はdomain、環境変数はconfigsへ置く。
共通に見えるという理由だけでroot constantsへ移さない。

### `src/assets/`

assetsは、独立した複数featureからimportする画像やfontを担当する。

一つのfeatureだけが使うassetは所有featureへco-locationする。
stable URL、favicon、manifest、OGP用途は `public/` に置く。
MDX固有の画像は対応するcontentと同じ領域へ置く。

### `src/devtools/`

devtoolsは、Storybook previewや開発時の確認UIを担当する。

production codeからdevtoolsをimportしない。
devtools内の純粋parserにはLogic UTを置いてよい。

## import方向

基本の依存方向を次に示す。
表にない上位層への依存は追加しない。

| import元 | importしてよい主な依存先 |
|---|---|
| leaf route | 対応するpageの `index.tsx` と `meta.ts` |
| `__root.tsx`、route group | providers、templates、ui、lib、route境界専用のguard featureの公開entry |
| pages | featureの公開entry、templates、shared、ui、providers、domains、root hooks、stores、lib、configs、Convexのroute-wide query |
| features | 自身の子featureの公開entry、compositionからtop-level再利用leaf featureの公開entry、shared、ui、domains、root hooks、stores、lib、configs、Convex client hooks |
| shared | 同じshared層、templates、ui、domains、root hooks、lib、configs |
| templates | 同じtemplate層、ui、root hooks、lib、configs |
| ui | 同じui層、ドメイン非依存hook、lib、configs、React、Chakra UI |
| providers | configs、lib、外部SDK |
| root hooks | domains、stores、lib、configs、必要な外部client |
| stores | domains、lib、configs、Jotai |
| domains | 同一domain、依存方向が定まった別domain、純粋な外部ライブラリ |
| lib | 同じlib層、configs、技術的な外部ライブラリ |
| configs | 同じconfigs層、設定対象の外部ライブラリ |
| devtools | production側の公開entry |

root `constants/` はdomainから参照しない。
業務定数は所有domain、表示定数は所有feature、設定値はconfigsへ置き、root `constants/` はそれ以外の真にアプリ横断の固定値だけにする。

共有 `assets/` はpages、features、shared、templates、ui、configs、devtoolsから参照できる。
一つのfeatureだけが使うassetは所有featureへco-locationする。
production codeから `devtools/` はimportしない。

feature外からは、原則として対象featureディレクトリrootの公開entryだけをimportする。
`script.ts`、`adapter.ts`、controller hook、子componentへのdeep importはしない。
`index.tsx` が外部へ公開するのはcomponentとそのcontract型だけとし、内部controller hookはre-exportしない。

ArticleSiteの `articleMeta.ts` のように、UI bundleと分ける必要がある静的content metadataは、意味名を持つsecondary public entryとして公開してよい。
secondary public entryは副作用、React hook、状態を持たず、該当featureの `AGENTS.md` または機能文書へ公開用途を記載する。
`script.ts`、adapter、controller hook、子componentをsecondary public entryとして扱わない。

通常のleaf feature同士はimportしない。
親featureは、自身のディレクトリ配下にある子featureの公開entryをimportしてよい。

複数featureのcallback接続や状態遷移を担当する明示的なcomposition featureは、top-levelの再利用leaf featureの公開entryをimportしてよい。
依存はcompositionからleafへのDAGにし、leafからcompositionへの逆参照、循環依存、deep importを禁止する。
独立して並べるだけならpage、feature間の操作を調整するならcomposition featureが組み立てる。

子featureが別のpageまたは別compositionからも使われる場合は、親配下に置かずtop-level featureへ昇格する。
業務知識を持つ表示だけを共有し、状態機械を持たない場合はshared候補とする。

共有したいものが純粋な業務ルール、feature-localな導出、業務UIの場合は、それぞれdomain、所有feature、sharedへ移す。

## ファイルごとの責務

### `index.tsx`

`index.tsx` は、そのディレクトリの公開componentを置く。

feature rootでは、controller hookとViewを接続し、必要な状態分岐とcallback bindingを行う。
leaf componentでは、propsからJSXを描画する。

一つの `index.tsx` に複数の独立した画面、フォーム、状態機械を置かない。
他ファイルから利用する純粋関数を `index.tsx` からexportしない。
feature外へ公開するProps、intent、resultなどのcontract型は、`index.tsx` で定義またはtype re-exportしてよい。

### `script.ts`

`script.ts` は、同階層の `index.tsx` に対応するfeature-localな純粋処理を置く。

次は配置候補であり、すべてを一つの `script.ts` へ集めるためのchecklistではない。

- 同ファイルの関数だけが使うinput/output型
- form初期値
- UI固有のZod refinement
- domain inputまたはcontrollerが準備したplain dataからViewModelへの変換
- submit payloadの生成
- 表示状態の純粋な導出
- component固有の定数

`script.ts` にはJSX、React hook、Chakra UI、Jotai、DOM、browser storage、Toast、router、query、mutation、actionを書かない。
変換関数の入出力はplain dataにし、Chakra tokenやcomponentを返さない。
共有Convex schemaとdomainの純粋関数はimportしてよいが、Convex client hookはimportしない。

`script.ts` をbarrelや雑多なhelper置き場にしない。
一つの `script.ts` も一つの変更理由だけを持つ。
責務へ明確な名前を付けられる段階で、`schema.ts`、`adapter.ts`、`buildSubmissionInput.ts` のような意味名を持つファイルへ分割する。

一度だけ使う短い表示計算や定数は `index.tsx` またはViewに残してよい。
Chakra token、座標、表示部品へのmappingを分離する必要がある場合は、`presentation.ts` のような意味名を使う。

同じディレクトリに `index.tsx` と実装を持つ `index.ts` を置かない。
`index.tsx` と対になる汎用的な非UI companion名は `script.ts` に統一する。
責務を表す `schema.ts`、`adapter.ts`、`stores.ts`、`presentation.ts`、`buildSubmissionInput.ts` などの追加ファイルは使用してよい。

`index.ts` は、UIを持たないディレクトリの公開entryとして使用できる。
実装に固有の業務名や技術名がある場合は、`index.ts` に集約せず意味のあるファイル名を付ける。

### `use*.ts`

`use*.ts` はReact hookだけを置く。

feature controller hookは、複数componentにまたがる状態、複雑な状態遷移、effect、ref、ConvexまたはClerkとの接続、storage接続、single-flightを担当する。
JSXと純粋な業務アルゴリズムを書かない。

hook名は一つのユースケースまたは横断的な技術責務を表す。
複数の独立したmutationを一つの巨大なcontroller hookへ移し替えない。

### `*View.tsx`

Viewは、準備済みのViewModelを描画し、intent callbackを呼ぶ。

Viewに置いてよい状態は、開閉、選択、focus、hoverなど表示に閉じた局所状態とする。
一度だけ使う短い表示計算、Chakra tokenや座標への変換、DialogのmarkupもViewへ置いてよい。
API、Toast、navigation、storage、raw DTOからの業務判定を置かない。

大規模な編集UIでは、feature-scopedなpresentation selector atomまたはhookをleaf Viewから読んでよい。
selectorの返り値は描画準備済みの値に限定し、leaf Viewでraw DTOの再解釈や業務計算を行わない。
selectorとatomの定義は `stores.ts` が所有し、業務draftの更新はintent callbackまたはwrite-only intent atomを経由する。

`View` という名前を付けたcomponentがform controllerやmutationを持たない。

### `types.ts`

`types.ts` は、同じfeatureまたはdomainの複数ファイルで共有する型だけを置く。

関数、日付判定、ソート、ラベル生成、component固有Propsを書かない。
component Propsは利用componentのファイルへ置く。
関数のinput/output型は、原則としてその関数と同じファイルへ置く。
ロジックを持たないcross-file contractになった場合だけ `types.ts` へ移す。
業務上の正規型はdomainへ置く。

### `schema.ts`

`schema.ts` は、複数ファイルまたは複数フォームで共有するまとまったschemaを置く。

mutationと共有するschemaの正は `convex/{useCase}/schemas.ts` とする。
frontendではresolver接続とUI固有refinementだけを追加する。

一つのcomponentに閉じる小さなschemaは `script.ts` に置いてよい。

### `adapter.ts`

feature配下の `adapter.ts` は、外部またはConvexのDTOをdomain inputまたはfeature内で使うplain dataへ変換する。

adapterはReactへ依存しない。
adapterは境界としてConvex generated typeをimportしてよいが、その型をdomainへ漏らさない。
adapter内で認可を判断せず、サーバーが返したcapabilityまたはstatusを変換する。

field名、単位、nullability、集合形状が変わる外部境界はadapterが担当する。
すでに内部化されたplain dataから画面固有のViewModelを導出する処理は `script.ts` が担当する。
型名を変えるだけの薄いadapterは作らない。

### `stores.ts`

feature配下の `stores.ts` は、feature-scopedなJotai atom、selector、write-only intent atomを置く。

leaf Viewは描画準備済みのselectorを読んでよい。
選択日、表示mode、開閉などpresentation stateはleaf Viewから直接更新してよい。
業務draftの更新はintent callbackまたは `stores.ts` が所有するwrite-only intent atomを経由し、raw atomをleaf Viewから直接更新しない。

`stores.ts` にはJSX、Convex hook、Toast、navigation、browser effect、永続化処理を書かない。
serverへの保存とその成功後の遷移はcontrollerが担当する。

### `presentation.ts`

`presentation.ts` は、domainまたはViewModelの判定済みの値を、label、semantic token、座標などfeature-localな表示値へ変換する純粋処理を置く。

React hook、JSX、DOM操作、API接続、業務判定を書かない。
一つの表示概念だけを扱い、責務が増えたら `datePresentation.ts` のような意味名を優先する。

### `constants.ts`

`constants.ts` は、そのディレクトリ内の複数ファイルで共有する一つの意味領域の固定値だけを置く。

単一componentだけが使う固定値は `index.tsx` または `script.ts` に置く。

### `meta.ts`

page配下の `meta.ts` は、routeの `head` へ渡すtitle、description、canonical、OGP、JSON-LDを組み立てる純粋処理を置く。

content metadataの正は所有featureに置き、rootまたは宣言済みsecondary public entryから参照する。
共通のSEO生成基盤は `lib/seo/` に置き、pageの `meta.ts` がcontent metadataとSEO基盤を接続する。

`meta.ts` にはJSX、React hook、query、mutation、browser stateを書かない。

### Storyとtest

公開componentのStoryは同階層の `index.stories.tsx` に置く。
純粋処理のtestは対象と同じbasenameにし、`script.ts` なら `script.test.ts` とする。

Story専用fixtureはfeature内の `stories/fixtures.ts` など用途が分かる場所へ置く。
Story fixtureを `__mocks__` に置かない。

テスト層と粒度は `doc/rules/testing-strategy.md` を正とする。
共有schemaの境界値をfrontend側で重複して検証しない。

## ロジックの配置判断

次の表で配置を決める。

| 問い | 配置 |
|---|---|
| 表示だけに閉じる小さなstate、refか | 利用するView |
| 複数componentにまたがるstate、複雑なeffect、外部接続か | featureの `use*.ts` |
| route全体を成立させるqueryと状態分岐か | `pages/` |
| 特定Dialog、tab、一覧だけのlazy query、paginationか | 所有featureのcontainerまたはcontroller hook |
| mutation、action、Toast、業務Dialog、navigationの順序か | feature containerまたはcontroller hook |
| 画面が変わっても同じ意味の業務判定か | `domains/{domain}/` |
| 一つのfeatureだけのform初期値、payload、ViewModelか | 同階層または親featureの `script.ts` |
| 外部DTOのfield名、単位、nullability、集合形状を変えるか | featureの `adapter.ts` |
| 内部化済みの値から画面固有ViewModelを作るか | featureの `script.ts` |
| DOM座標、drag、scroll、focus、responsive判定か | まず所有feature。業務非依存で複数featureに再利用するprimitiveだけui、hookだけroot hooks |
| 複数featureで使う業務UIか | `components/shared/` |
| 見た目だけを共有するprimitiveか | `components/ui/` |
| SEO、MDX、browser APIなど技術的な共通処理か | `lib/` |

## 分割を検討する条件

行数だけで分割しない。
次のいずれかに該当したら、責務による分割を検討する。

- 独立して変更されるユースケースが二つ以上ある
- 独立したmutationまたはactionが三つ以上ある
- 複数の状態機械またはフォームを管理している
- API接続、Toastまたはnavigation、form controller、大きなJSXのうち二種類以上が同居している
- propsが増え、業務領域ごとのViewModelへまとめられる
- 下位componentがraw DTOから業務上の操作可否を導出している
- 純粋ロジックをcomponentから切り離さないとLogic UTを書けない
- 一つの変更で無関係な画面やflowまで同じファイルを編集する

400行超は調査開始の目安とし、機械的な分割条件にはしない。
描画だけで責務が揃っているファイルは、短くても責務が混在したファイルより分割優先度が低い。

## 現行コードを使った判断例

### Dashboard

`src/pages/dashboard/index.tsx` は店舗や初期表示などroute全体を成立させるqueryとloading状態を所有するpageとして扱う。
特定の一覧、tab、Dialogだけで使うpaginationまたはlazy queryは、対応するDashboard子featureが所有する。

`DashboardContent` は各Dashboard子featureのcompositionに限定する。
スタッフ管理、募集管理、店舗設定、通知復旧のmutation、Dialog、Toastは、それぞれ `StaffManagement`、`RecruitmentManagement`、`ShopSettings`、`NotificationFailureRecovery` が所有する。

Dashboardだけが組み立てる子ユースケースは `Dashboard/{ChildFeature}/` に置く。
独立したrouteまたは別compositionからも使うユースケースはtop-level featureへ置き、pageまたは明示的なcomposition featureから公開entryを使う。

Dashboardの複数子featureを接続するcontract型は `Dashboard/types.ts`、一つの子featureだけで使う型はその所有者へ置く。
募集状態、期間判定、ソートのうち画面を超えて同じ意味を持つ処理はdomainへ置く。
日本語見出しを含むDashboard固有group生成はDashboardの `script.ts` に置く。

### Auth

Auth rootはlogin、signup、password reset、SSO callbackのflow選択を担当する。

各flowは個別のcontroller hook、View、schemaまたはscriptを所有する。
Clerk状態機械と複数のformを一つの `index.tsx` に置かない。

Auth guardはroute group境界の例外としてqueryを利用できる。
ただし、guardと表示制御はサーバー側認可の代わりにならない。

### StaffSubmit

`SubmitForm` rootはRHF controllerと締切後確認flowを所有し、`SubmitFormView` は準備済みの値の描画とintent callbackに限定する。

```text
SubmitForm/
  index.tsx                    controllerとViewの接続
  useSubmitFormController.ts   RHF、送信、確認flow、single-flight
  SubmitFormView.tsx           描画とintent callback
  script.ts                    初期値とselection変換
  buildSubmissionInput.ts      submit payload生成
```

初期entry生成、selection変換、submit payload生成は `script.ts` または意味名を持つ純粋ファイルへ置く。
日別cardは準備済みのpropsを描画し、submission DTO全体を受け取らない。

### ShiftForm

シフト期間、割当範囲、休憩除外、勤務時間集計はdomain候補とする。

timeline座標、hit testing、responsive分岐、Chakraの色tokenはfeature側へ残す。
PCとSPは同じdomainとViewModelを使い、表示構造だけを分ける。

ShiftFormは状態機械を持つ再利用leaf featureなのでsharedへ移さない。
ShiftBoard、StaffView、Demoなどのcomposition featureは、ShiftFormの公開componentとcontract型だけを使って操作を接続する。

性能上leaf ViewからJotaiを読む場合は、`stores.ts` が定義したpresentation selectorだけを使う。
選択日や表示modeは直接更新してよいが、shift draftはwrite-only intent atomまたはcontroller callbackを経由して更新する。
leaf Viewはraw shift DTOを再解釈せず、業務上の割当や保存payloadを計算しない。

### 公開ページ

公開ページ共通Header、main、Footerのshellは `components/templates/PublicPageLayout/` が所有する。

LandingPage、ArticleSite、HowToSiteが互いの内部componentやassetをimportしない。
複数featureで共有するassetは `assets/` へ置く。
コンテンツmetadata本体は所有feature、metadataのparseやloading基盤だけを複数featureで使う場合は `lib/` へ置く。
route用title、description、JSON-LDへの変換は対応pageの `meta.ts` が担当する。

## 適用方法

新規コードはこの方針へ合わせる。

既存コードは、対象機能を変更するときに関連範囲だけ段階的に直す。
別機能の移動を同じ変更へ混ぜず、挙動変更と配置変更を可能な範囲で分ける。

配置変更では、移動前後で同じ契約を守るテスト層を `doc/rules/testing-strategy.md` から選ぶ。
認証、token、session、通知、登録、招待を扱う場合は `doc/rules/security-strategy.md` も適用する。

この方針と実コードの差分は、次のフロントエンド構成監査でファイル単位に棚卸しする。
