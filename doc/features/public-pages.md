# 公開サイト

> 文書種別: feature
>
> 最終コード照合: 2026-08-30（この変更を含む）

公開サイトは、登録前の製品理解と、利用中の疑問解消をつなぐ認証不要のページ群である。
ルート`/`を入口に、機能紹介、ヘルプ、記事、操作デモへ利用者を案内する。

## ページの役割

| パス | 役割 | 主な実装 |
|---|---|---|
| `/` | 価値、利用の流れ、提出方法、利用例、料金プラン、ヘルプと記事への入口、登録導線をまとめるTOP | `src/pages/home/`、`src/components/features/LandingPage/` |
| `/features` | 希望回収、未提出確認、シフト作成、確定通知など、できることを詳しく示す | `src/pages/features/`、`FeatureSection`、`BenefitsSection` |
| `/commercial-transactions` | 有料プランの販売条件と、特定商取引法に基づく事業者情報を示す | `src/pages/commercial-transactions/`、`CommercialTransactions` |
| `/help` | 「ヘルプ・使い方」として、FAQと使い方を検索とやりたいことから探す入口を示す | `src/pages/help/`、`src/components/features/HelpCenter/` |
| `/help/tasks/:taskId` | 一つのやりたいことに属するFAQと使い方を表示する | `src/pages/help/`、`src/components/features/HelpCenter/` |
| `/help/basics/organization-structure` | 組織、店舗、スタッフ、管理者、プランの関係と利用上限の数え方を図で示す | `src/pages/help/`、`HelpOrganizationStructure` |
| `/help/scenarios/shift-management` | スタッフ追加の準備から確定通知までを、動画とStepperで順番に示す | `src/pages/help/`、`HelpShiftManagementScenario` |
| `/help/:slug` | 一つの使い方を表示し、関連するFAQと使い方へつなぐ | `src/pages/help/`、`HelpCenter/content/guides/` |
| `/articles` | シフト運営に関する記事とカテゴリへの入口を示す | `src/pages/articles/`、`ArticleListPage` |
| `/articles/:slug` | 一つの記事を表示し、関連する製品情報へつなぐ | `ArticlePage`、`ArticleSite/content/articles/` |
| `/articles/categories/:categorySlug` | 同じ課題領域の記事をまとめる | `ArticleCategoryPage`、`ArticleSite/content/categories/` |
| `/demo/shiftboard` | PC向けシフト表の入力と調整を、登録なしで試せるようにする | `src/pages/demo-shift-board/`、`Demo/DemoShiftBoardPage/` |

TOPは`src/routes/index.tsx`から`HomePage`を呼び、`HomePage`が`LandingPage`を構成する。
`LandingPage`は`PublicPageLayout`の中に、Hero、課題の軽減、利用の流れ、提出方法、比較、利用例、複数店舗・複数担当者での運用、料金プラン、CTA、ヘルプと記事の各sectionを並べる。

ヘルプ、記事、デモは同じ公開サイトに属するが、内容の置き場所は分かれている。
FAQ、使い方、TSXの基本ページは`HelpCenter`、記事は`ArticleSite`、操作できるデモは`Demo`が所有する。
ヘルプの管理形式と公開契約は[ヘルプセンター](help-center.md)を参照する。

## 公開サイトから接続する機能

問い合わせ、法務文書、認証は公開URLを持つが、公開サイトのコンテンツとは別の機能契約を持つ。

| 接続先 | 公開URL | 正本 |
|---|---|---|
| 問い合わせ | `/contact` | [`contact.md`](contact.md) |
| 利用規約とプライバシーポリシー | `/terms`、`/privacy`と対象別URL | [`legal-consent.md`](legal-consent.md) |
| 特定商取引法に基づく表記 | `/commercial-transactions` | 本文の「特定商取引法に基づく表記」 |
| ログインと登録 | `/login`、`/signup`、`/forgot-password` | [`auth-pages.md`](auth-pages.md) |

`PublicPageLayout`のheaderとfooterがこれらの入口を接続する。
問い合わせの送信、法務同意の保存、認証処理は、それぞれの機能文書とConvex実装が所有する。

## コード境界

公開サイトのrouteはURLとheadだけを定義し、対応する`src/pages/*`を呼ぶ。
pageは公開featureを構成し、ページ固有のtitle、description、canonical、構造化データは同じpageの`meta.ts`が組み立てる。

```text
src/routes/index.tsx
  -> src/pages/home/index.tsx
    -> src/components/features/LandingPage/index.tsx
      -> src/components/templates/PublicPageLayout/
```

公開コンテンツの表示にはClerk認証とConvex APIを使わない。
`vite.config.ts`はTanStack StartのStatic Prerendering対象を公開routeのallowlistから組み立て、`AuthProviders`は認証route、未登録スタッフroute、認証画面の近くに置いている。
公開HTMLはbuild時に生成し、ブラウザでは同じReact treeをhydrateする。
認証、店舗、スタッフ用Capabilityのrouteは`ssr: false`とし、利用者固有の情報を静的HTMLへ含めずCSRで表示する。

ヘルプ、記事、デモを表示するためのConvex APIもない。
問い合わせなど、公開サイトから遷移する別機能のAPIは、その機能文書を参照する。

## 公開する利用条件

公開ページ、`public/llms.txt`、記事などの公開コピーが案内する通常経路では、初回Setupの任意のプロモーションコードを空欄にした登録へ、初回登録から2か月の無料トライアルを適用する。

初回Setupには、有効なコードが入力された場合にTrialではなく支払い不要の`complimentary.pro`を付与するbackend上の例外がある。  無効なコードが入力された場合はSetupを拒否し、Trialへfallbackしない。  コードの実値と配布条件は公開コンテンツに含めず、無料トライアルの公開コピーは空欄の通常経路の案内として維持する。

無料トライアルの開始時にはクレジットカードの登録を求めない。

無料トライアルではProと同じ利用人数50名、店舗5件、有効管理ユーザー5名まで利用できる。

トライアル終了後も有料枠で利用を継続する場合はStandardまたはProを選ぶ。  有料プランを選ばない場合はデータを保持したままFreeへ移行し、Free上限内なら基本機能を継続できる。  上限を超えている場合は、上限内へ整理するか有料プランを契約するまで業務操作を制限する。

二つ目以降の組織はFreeで開始し、Free、Standard、Proの利用人数、店舗数、管理ユーザー数を共有上限定数から案内する。  StandardとProの金額、通貨、税区分、請求周期は、公開サイトのbuild時にStripeから取得して検証した販売条件を表示する。  契約画面は公開サイトのsnapshotへ依存せず、Stripeから現在の販売条件を取得して契約確定前に表示する。

追加組織と有料プランの詳細は、[`organization-billing.md`](organization-billing.md)を参照する。

公開ページのMDXやcomponentへ固定の金額を複製しない。
公開サイトは一つのbuild時料金カタログを共有し、数値を推測せず、確定した販売条件だけを案内する。  契約画面ではStripeから取得して検証した現在の販売条件を契約確定前に表示する。

### 無料トライアル表現の公開前提

2か月無料・クレジットカード登録不要の公開文言は、プロモーションコードが空欄の初回Setupで2か月のTrialを作成するbackend artifactと同時に公開する。  Repository上の契約だけで対象deploymentへの反映を推測せず、空欄経路のTrial、期限処理、Stripeオブジェクト非作成を実環境で確認するまで利用可能とは判定しない。

有効なコードによる`complimentary.pro`の付与は通常のTrial経路と分けて検証し、公開コピーのTrial断定をこの例外へ適用しない。

公開可否は[リリース状態](../manual/release-status.md)に実環境証跡を記録して判定し、LPとヘルプの静的生成に成功したことだけでTrialの利用可能性を推測しない。

## 特定商取引法に基づく表記

`/commercial-transactions`は、初回登録の利用条件と、有料プランに関する販売条件を表示する。

追加組織のFreeプランは初回登録の条件と分けて表示する。

販売条件として、役務提供事業者、運営責任者、所在地、電話番号、問い合わせ先、Standard・Proそれぞれの販売価格、支払方法と時期、提供時期、契約期間、自動更新、追加組織のFreeプラン、解約、返金、利用上限、動作環境を表示する。

Standard・Proの販売価格は、Production buildがStripeの設定済みPriceから取得した確定額、通貨、請求周期、税区分を表示する。  取得失敗、inactive、test/live不一致、固定額として扱えない課金方式、金額または税区分の不足、Standard・Pro間の通貨または請求周期の不一致ではbuildを失敗させる。  ローカルとPreviewは同じStripe Sandbox、Developは別のStripe Sandboxから取得し、両プランに設定した同一の短周期も検証用に表示できる。  StorybookとtestはStripe credentialを使わず決定的なfixtureを表示する。

役務提供事業者と運営責任者の名称、所在地、電話番号は、Production GitHub Environment Variablesの`VITE_COMMERCIAL_TRANSACTIONS_NAME`、`VITE_COMMERCIAL_TRANSACTIONS_ADDRESS`、`VITE_COMMERCIAL_TRANSACTIONS_PHONE_NUMBER`をrelease buildで取り込む。  3項目のいずれかが空ならProduction buildを失敗させ、Production以外では未設定項目をplaceholderで明示する。  所在地を改行する場合は値に`\n`を含める。  Standard・Proの販売価格は、同MDXの`PlanPrice`を介してbuild時料金カタログを参照する。  利用上限の数値は、同MDXの`PlanLimit`を介してbrowser-safeな`ORGANIZATION_PLAN_LIMITS`を参照する。
Productionの設定値と公開表示の確認状況は、[リリース状態](../manual/release-status.md)に記録する。

このページはfooterから到達できる一方、`noindex, nofollow`とし、sitemapと`llms.txt`には含めない。
`robots.txt`でDisallowにはせず、crawlerがrobots metaを取得できる状態を維持する。
利用規約・プライバシーポリシーと同じ`public_unmeasured`面に分類し、GTM・GA4のpage viewを送らない。

## コンテンツと導線の分担

| 場所 | 利用者の問い | 内容の責務 |
|---|---|---|
| TOP | 自分の店舗で何が楽になるか | 価値と利用の流れ、導入前のよくある質問を短く示し、詳しい入口を選べるようにする |
| 機能紹介 | どの作業を支援できるか | 主な機能と利用場面を比較できるようにする |
| TOPの料金プランsection | 人数と店舗数に合うプランと料金を比較したい | シフト管理の基本機能が共通であることと、Free・Standard・Proの料金と利用上限を示す。Standard・Proの金額は特定商取引法ページと同じbuild時料金カタログを使う |
| ヘルプのFAQ | 料金、通知、導入、運用について結論を知りたい | 質問ごとに結論と必要な注意点を示す |
| ヘルプの使い方 | 画面でどう操作し、失敗時にどう戻るか | 操作場所、手順、結果、回復方法を示す |
| ヘルプの組織構造 | 組織、店舗、スタッフ、管理者、プランがどう紐づくか | 組織を起点に、所属単位と利用上限の数え方を図で示す |
| ヘルプの動画シナリオ | 毎回のシフト管理をどの順番で進めるか | スタッフ追加の準備と、募集から確定通知までを一つのページで順番に示す |
| 記事 | シフト運営の課題をどう判断するか | 課題の整理、選択肢、関連する製品導線を示す |
| デモ | 登録前に操作と結果を確かめたい | 実データを保存せず、主要な操作の流れを体験できるようにする |

TOPのFAQは、導入を検討する利用者向けの5件を`LandingPage/faqs.ts`で管理する。  表示内容とTOPの`FAQPage`構造化データは同じデータから生成し、各回答は文ごとに改行して表示する。

ヘルプは利用開始後のFAQと使い方を一つのMDX形式で管理し、利用者が完了したい仕事ごとに分類する。組織構造と動画シナリオはTOPから直接開くTSXページとして分ける。
FAQは`/help/tasks/:taskId#<faq-id>`で展開・共有し、使い方は`/help/:slug`の個別ページで表示する。
FAQから案内する主な使い方は`primaryGuide`で指定する。
frontmatter、検索、関連付け、本文の表示規則は[ヘルプセンター](help-center.md)を正本とする。

ヘルプと記事は、`_`始まりのディレクトリを下書きとして読み込まない。
下書きは一覧、検索、構造化データ、SSG、記事別OGPのどれにも現れず、bundleにも含めない。
ヘルプは公開コンテンツから下書きへの関連リンクを表示せず、公開にも下書きにも存在しない参照は入力誤りとして検出する。

ヘルプの追加と更新には`write-help-content`、デモの設計には`demo-ux`を使う。
記事の構造とメタデータは`src/components/features/ArticleSite/AGENTS.md`に従う。

## 静的生成とメタデータ

`scripts/staticSite.ts`はTOP、機能紹介、ヘルプTOP・組織構造・動画シナリオ・タスクページ、問い合わせ、記事一覧、汎用の法務文書、特定商取引法に基づく表記、シフトボードデモなどを公開routeとして持つ。  現在、独立した`/pricing` routeはない。
ヘルプの使い方は`HelpCenter/content/guides/`、記事詳細とカテゴリは`ArticleSite/content/`の公開済みslugから対象routeを組み立てる。
TanStack StartはこのallowlistだけをStatic Prerenderingし、認証routeやCapability routeを自動探索しない。

`scripts/sitemap.ts`は公開route manifestと記事frontmatterから`public/sitemap.xml`を生成する。
生成対象はindex可能なcanonicalだけであり、互換alias、`noindex`の公開route、CSR shell、下書きを含めない。
正確な更新日を持つ記事だけに`updatedAt ?? publishedAt`由来の`lastmod`を付け、固定ページ、一覧、カテゴリにはbuild日時を付けない。
記事URLまたは記事の日付を変更した開発者は`pnpm sitemap:generate`を明示実行し、生成物を同じ変更へ含める。
`public/llms.txt`は機械可読な公開コンテンツの入口を持つ。
記事別OGPは`scripts/generateArticleOgp.ts`と`public/ogp/articles/`が所有し、生成物検証時に不足を検出する。

全ページのfallback metadataは`src/routes/__root.tsx`、route別metadataとJSON-LDは対応する`src/pages/*/meta.ts`とコンテンツfeatureが所有する。
FAQPage、BlogPosting、BreadcrumbListなどの構造化データは、画面に表示する現在内容と一致させる。

`pnpm build`はStatic Prerendering、Cloudflare用ルール生成、生成物検証、型検査を行う。
Cloudflare Pagesへ配信するのは`dist/client/`だけであり、`dist/server/`はbuild時のrenderにだけ使う。
`scripts/validateStaticBuild.ts`は公開HTMLのcanonical、metadata、H1一件、Emotion style、hydration payload、特定商取引法ページのStandard・Pro料金snapshot、記事OGP、metadataから再生成したsitemapとの一致、CSR shell、404、Cloudflareルールを検証する。
通常の`pnpm build`は`public/sitemap.xml`を書き換えず、sourceまたは配信artifactが生成期待値と異なる場合に失敗する。
実際のdeployment状態はこの機能文書から推測せず、CI/CDの手順と実行結果で確認する。

### URLの正規化

Static Prerenderingは、ルート以外を`dist/client/features.html`のようなフラットなHTMLへ出力する。
ディレクトリindexへ出力すると、Cloudflare Pagesが末尾スラッシュ付きURLへリダイレクトし、sitemapとcanonicalが示す末尾スラッシュなしURLと食い違うためである。

sitemap、canonical、内部リンクは、ルート以外を末尾スラッシュなしで統一する。
公開済みの旧記事slugは互換URLとしてSSG対象に残し、HTMLと`Link` headerのcanonicalは現slugへ向ける。
廃止した`/demo/flow`と末尾スラッシュ付きURLは、生成した`_redirects`で`/help/scenarios/shift-management`へ`301`転送する。
既知の公開routeの末尾スラッシュ付きURLは、生成した`_redirects`で末尾スラッシュなしのHTMLへ`200` proxyする。
3xxを返さないため、既存端末に残ったno-slashからslashへの308 cacheが適用されても、slash側の`200`でループを終端できる。

認証、店舗、スタッフ用Capabilityのrouteは、末尾スラッシュの有無を問わずclean URLの`/_shell`へ明示的に`200` proxyする。  実体はビルド成果物の`_shell.html`だが、`.html`をproxy先へ指定するとCloudflare Pagesが`/_shell`への308を返すため、配信規則では拡張子を付けない。
shellは`noindex`、`no-store`、`no-referrer`で公開canonicalを持たず、queryや利用者情報をbuild artifactへ固定しない。
全URLをshellへ渡すcatch-allは置かず、トップレベルの`404.html`により未知URLと未知の記事slugは404にする。  Cloudflare Pagesは任意の未知URLへ同じ`404.html`を返すため、このdocumentだけはbuild時URLとのhydration mismatchを避けて静的表示のままにする。

`/cache-reset`だけは`Clear-Site-Data: "cache"`を返す。
cookieとstorageは消去せず、旧308 cacheが残る端末の回復導線として使う。

`public/robots.txt`は認証済みshellとCapability・callback routeに対する既存の`Disallow`を維持する。  `/account`だけは`/account-deletion-accepted`を遮断しないよう、末尾一致の`/account$`を使う。
route inventory testは各`Disallow`が実在するCSR routeのprefixまたは完全一致patternであり、公開SSG routeと重ならないことを確認する。  不在routeだった`/welcome`は対象に含めない。

## 関連ファイル

- `src/routes/index.tsx`、`src/pages/home/`、`src/components/features/LandingPage/`：公開TOP
- `src/components/features/LandingPage/faqs.ts`：TOPのFAQ表示と`FAQPage`構造化データ
- `src/components/features/LandingPage/PricingSection/`：TOPの料金プラン比較
- `src/routes/features.tsx`、`src/pages/features/`：機能紹介
- `src/routes/commercial-transactions.tsx`、`src/pages/commercial-transactions/`、`src/components/features/CommercialTransactions/`：特定商取引法に基づく表記
- `src/routes/help.tsx`、`src/routes/help.*.tsx`、`src/pages/help/`：ヘルプTOP、タスク、使い方詳細のURL境界
- `src/components/features/HelpCenter/`：FAQ、使い方、検索、構造化データ
- `src/components/features/HelpCenter/content/**/*.mdx`：ヘルプ本文、検索用メタデータ、関連付け、表示順
- `src/routes/articles*.tsx`、`src/pages/articles/`、`src/components/features/ArticleSite/`：記事一覧、記事詳細、カテゴリ
- `src/routes/demo.*.tsx`、`src/pages/demo-*/`、`src/components/features/Demo/`：公開デモ
- `src/components/templates/PublicPageLayout/`：公開ページ共通layout
- `vite.config.ts`、`src/router.tsx`、`src/client.tsx`：TanStack StartのSSG、CSR shell、hydration
- `src/pages/*/meta.ts`、`src/lib/seo/`：ページ別metadataと共通SEO処理
- `scripts/staticSite.ts`、`scripts/sitemap.ts`、`scripts/prepareStaticDeployment.ts`、`scripts/validateStaticBuild.ts`：公開route、sitemap、静的配信ルール、生成物検証
- `src/routes/cache-reset.tsx`、`src/routes/$.tsx`：旧cache回復と404
- `src/components/features/ArticleSite/articleFrontmatter.ts`：BrowserとNodeで共有する記事frontmatter schemaとparser
- `public/sitemap.xml`、`public/llms.txt`：検索エンジンと機械向けの公開ファイル
- `scripts/generateArticleOgp.ts`、`public/ogp/articles/`：記事別OGP画像
