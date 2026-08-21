# 公開サイト

> 文書種別: feature
>
> 最終コード照合: 2026-08-15（この変更を含む）

公開サイトは、登録前の製品理解と、利用中の疑問解消をつなぐ認証不要のページ群である。
ルート`/`を入口に、機能紹介、FAQ、HowTo、記事、操作デモへ利用者を案内する。

## ページの役割

| パス | 役割 | 主な実装 |
|---|---|---|
| `/` | 価値、利用の流れ、提出方法、利用例、FAQと記事への入口、登録導線をまとめるTOP | `src/pages/home/`、`src/components/features/LandingPage/` |
| `/features` | 希望回収、未提出確認、シフト作成、確定通知など、できることを詳しく示す | `src/pages/features/`、`FeatureSection`、`BenefitsSection` |
| `/pricing` | 初回登録で利用できる支払い不要Businessと、現在公開している組織・店舗・管理ユーザー・利用人数の範囲を示す | `src/pages/pricing/`、`PricingSite` |
| `/commercial-transactions` | 有料プランの販売条件と、特定商取引法に基づく事業者情報を示す | `src/pages/commercial-transactions/`、`CommercialTransactions` |
| `/faq` | 導入前から利用中までの質問を、カテゴリと検索から探せるようにする | `src/pages/faq/`、`src/components/features/FaqSite/` |
| `/howto` | 画面上の場所、操作、結果、失敗時の対処を、利用場面から探せるようにする | `src/pages/howto/`、`src/components/features/HowToSite/` |
| `/articles` | シフト運営に関する記事とカテゴリへの入口を示す | `src/pages/articles/`、`ArticleListPage` |
| `/articles/:slug` | 一つの記事を表示し、関連する製品情報へつなぐ | `ArticlePage`、`ArticleSite/content/articles/` |
| `/articles/categories/:categorySlug` | 同じ課題領域の記事をまとめる | `ArticleCategoryPage`、`ArticleSite/content/categories/` |
| `/demo/flow` | 募集作成から確定通知までの流れを、登録なしで順番に試せるようにする | `src/pages/demo-flow/`、`Demo/ShiftoriDemoFlow/` |
| `/demo/shiftboard` | PC向けシフト表の入力と調整を、登録なしで試せるようにする | `src/pages/demo-shift-board/`、`Demo/DemoShiftBoardPage/` |

TOPは`src/routes/index.tsx`から`HomePage`を呼び、`HomePage`が`LandingPage`を構成する。
`LandingPage`は`PublicPageLayout`の中に、Hero、課題の軽減、利用の流れ、提出方法、比較、利用例、初回登録の組織・店舗・管理ユーザーと利用条件、FAQと記事、CTAの各sectionを並べる。

FAQ、HowTo、記事、デモは同じ公開サイトに属するが、内容の置き場所は分かれている。
FAQはMDXを含む`FaqSite`、HowToはMDXを含む`HowToSite`、記事は`ArticleSite`、操作できるデモは`Demo`が所有する。
HowToの詳細な編集規則は [`howto.md`](howto.md) を参照する。

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

FAQ、HowTo、記事、デモを表示するためのConvex APIもない。
問い合わせなど、公開サイトから遷移する別機能のAPIは、その機能文書を参照する。

`PricingSite`が表示する利用人数は、backend enforcementと同じbrowser-safeな`ORGANIZATION_PLAN_LIMITS.business.maxPeople`を参照する。

現在公開している店舗数と管理ユーザー数は、公開範囲に合わせてそれぞれ1件と1名を表示する。
公開ページからStripeやConvexへ問い合わせず、build時とbrowserで同じ静的内容を表示する。

## 公開する利用条件

初回登録で作る最初の組織には、支払い不要のBusinessを適用する。

初回登録時には無料体験の終了日を設定せず、支払い方法の登録を求めない。

現在の公開範囲は、1組織、1店舗、1管理ユーザーである。

利用人数はBusinessの上限である40名までとする。

複数組織、複数店舗、複数管理ユーザー、有料プランの契約と支払いは、現在の公開範囲に含めない。

追加組織作成機能が明示的に有効な場合の二つ目以降の組織に対するFreeプランと、有料プランの条件は、将来機能の内部契約として保持する。

公開ページでは、これらを現在利用できる条件として案内しない。

追加組織と有料プランの詳細は、[`organization-billing.md`](organization-billing.md)を参照する。

公開ページへ固定の金額を複製しない。
有料プランを公開していない間は、契約画面で契約できるように案内しない。

販売開始後も公開サイトは数値を推測せず、確定した販売条件だけを案内する。

## 特定商取引法に基づく表記

`/commercial-transactions`は、初回登録の利用条件と、将来提供予定の有料プランに関する販売条件を表示する。

追加組織のFreeプランは、追加組織作成機能を提供している場合の条件として表示し、初回登録の条件とは分ける。

有料プランの申込機能が未公開であることも表示する。

将来の販売条件として、役務提供事業者、運営責任者、所在地、電話番号、問い合わせ先、Pro・Businessそれぞれの販売価格、支払方法と時期、提供時期、契約期間、自動更新、追加組織のFreeプラン、解約、返金、利用上限、動作環境を表示する。

Pro・Businessの販売価格は、Production公開前にStripeへ設定する確定額と税区分を記載し、販売開始後の契約画面にも契約確定前に同じ条件を表示する。

役務提供事業者、運営責任者、所在地、電話番号は、Production公開前に`src/components/features/CommercialTransactions/index.tsx`冒頭の`MANUAL_BUSINESS_DETAILS`を実在する情報へ手動で置き換える。Pro・Businessの月額料金と税込・税別は、同じファイルの`MANUAL_SALES_PRICES`を確定した販売条件へ置き換える。
仮入力が一つでも残る間はページ内に注意を表示し、Production公開の停止条件として[リリース状態](../manual/release-status.md)にも記録する。

このページはfooterと料金ページ共通の公開layoutから到達できる一方、`noindex, nofollow`とし、sitemapと`llms.txt`には含めない。
`robots.txt`でDisallowにはせず、crawlerがrobots metaを取得できる状態を維持する。
利用規約・プライバシーポリシーと同じ`public_unmeasured`面に分類し、GTM・GA4のpage viewを送らない。

## コンテンツと導線の分担

| 場所 | 利用者の問い | 内容の責務 |
|---|---|---|
| TOP | 自分の店舗で何が楽になるか | 価値と利用の流れを短く示し、詳しい入口を選べるようにする |
| 機能紹介 | どの作業を支援できるか | 主な機能と利用場面を比較できるようにする |
| 料金・プラン | 初回登録でどこまで利用でき、支払い情報が必要か | 支払い不要Business、利用上限、現在の組織・店舗・管理ユーザーの範囲、支払い情報の要否を示す |
| FAQ | 料金、通知、導入、運用について結論を知りたい | 質問ごとに結論と必要な注意点を示す |
| HowTo | 画面でどう操作し、失敗時にどう戻るか | 操作場所、手順、結果、回復方法を示す |
| 記事 | シフト運営の課題をどう判断するか | 課題の整理、選択肢、関連する製品導線を示す |
| デモ | 登録前に操作と結果を確かめたい | 実データを保存せず、主要な操作の流れを体験できるようにする |

FAQは一つの質問を一つのMDXで管理し、ファイル名を`/faq#id`のアンカーに使う。
TOPへ掲載する質問は`content/featured/`に置き、`landingFaqContent.ts`はその質問だけから表示と構造化データを生成する。
総合FAQは同じMDX群から本文、検索対象、構造化データを生成する。
frontmatterの項目と許可値は`faqMetadata.ts`、本文で利用できる表示部品は`mdxComponents.tsx`を正本とする。

FAQ、HowTo、記事のいずれも、`_`始まりのMDX（記事とカテゴリは`_`始まりのディレクトリ）は下書きとして読み込まない。
下書きは一覧、検索、構造化データ、SSG、記事別OGPのどれにも現れず、bundleにも含めない。
HowToを下書きにした場合は、公開中のHowToからの関連記事参照とFAQからの詳細リンクも自動的に外す。

HowToの追加と更新には`write-help-content`、デモの設計には`demo-ux`を使う。
記事の構造とメタデータは`src/components/features/ArticleSite/AGENTS.md`に従う。

## 静的生成とメタデータ

`scripts/staticSite.ts`はTOP、機能紹介、料金・プラン、FAQ、HowTo、問い合わせ、記事一覧、汎用の法務文書、特定商取引法に基づく表記、二つのデモなどを固定の公開routeとして持つ。
記事詳細とカテゴリは`ArticleSite/content/`の公開済みslugから対象routeを組み立てる。
TanStack StartはこのallowlistだけをStatic Prerenderingし、認証routeやCapability routeを自動探索しない。

`scripts/sitemap.ts`は公開route manifestと記事frontmatterから`public/sitemap.xml`を生成する。
生成対象はindex可能なcanonicalだけであり、互換alias、`noindex`の公開route、CSR shell、下書きを含めない。
正確な更新日を持つ記事だけに`updatedAt ?? publishedAt`由来の`lastmod`を付け、固定ページ、一覧、カテゴリにはbuild日時を付けない。
記事URLまたは記事の日付を変更した開発者は`pnpm sitemap:generate`を明示実行し、生成物を同じ変更へ含める。
`public/llms.txt`は機械可読な公開コンテンツの入口を持つ。
記事別OGPは`scripts/generateArticleOgp.ts`と`public/ogp/articles/`が所有し、生成物検証時に不足を検出する。

全ページのfallback metadataは`src/routes/__root.tsx`、route別metadataとJSON-LDは対応する`src/pages/*/meta.ts`とコンテンツfeatureが所有する。
FAQ、BlogPosting、BreadcrumbListなどの構造化データは、画面に表示する現在内容と一致させる。

`pnpm build`はStatic Prerendering、Cloudflare用ルール生成、生成物検証、型検査を行う。
Cloudflare Pagesへ配信するのは`dist/client/`だけであり、`dist/server/`はbuild時のrenderにだけ使う。
`scripts/validateStaticBuild.ts`は公開HTMLのcanonical、metadata、H1一件、Emotion style、hydration payload、記事OGP、metadataから再生成したsitemapとの一致、CSR shell、404、Cloudflareルールを検証する。
通常の`pnpm build`は`public/sitemap.xml`を書き換えず、sourceまたは配信artifactが生成期待値と異なる場合に失敗する。
実際のdeployment状態はこの機能文書から推測せず、CI/CDの手順と実行結果で確認する。

### URLの正規化

Static Prerenderingは、ルート以外を`dist/client/features.html`のようなフラットなHTMLへ出力する。
ディレクトリindexへ出力すると、Cloudflare Pagesが末尾スラッシュ付きURLへリダイレクトし、sitemapとcanonicalが示す末尾スラッシュなしURLと食い違うためである。

sitemap、canonical、内部リンクは、ルート以外を末尾スラッシュなしで統一する。
公開済みの旧記事slugは互換URLとしてSSG対象に残し、HTMLと`Link` headerのcanonicalは現slugへ向ける。
既知の公開routeの末尾スラッシュ付きURLは、生成した`_redirects`で末尾スラッシュなしのHTMLへ`200` proxyする。
3xxを返さないため、既存端末に残ったno-slashからslashへの308 cacheが適用されても、slash側の`200`でループを終端できる。

認証、店舗、スタッフ用Capabilityのrouteは、末尾スラッシュの有無を問わずclean URLの`/_shell`へ明示的に`200` proxyする。  実体はビルド成果物の`_shell.html`だが、`.html`をproxy先へ指定するとCloudflare Pagesが`/_shell`への308を返すため、配信規則では拡張子を付けない。
shellは`noindex`、`no-store`、`no-referrer`で公開canonicalを持たず、queryや利用者情報をbuild artifactへ固定しない。
全URLをshellへ渡すcatch-allは置かず、トップレベルの`404.html`により未知URLと未知の記事slugは404にする。  Cloudflare Pagesは任意の未知URLへ同じ`404.html`を返すため、このdocumentだけはbuild時URLとのhydration mismatchを避けて静的表示のままにする。

`/cache-reset`だけは`Clear-Site-Data: "cache"`を返す。
cookieとstorageは消去せず、旧308 cacheが残る端末の回復導線として使う。

`public/robots.txt`は認証済みshellとCapability・callback routeに対する既存の`Disallow`を維持する。
route inventory testは各`Disallow`が実在するCSR routeのprefixであることを確認し、不在routeだった`/welcome`は対象に含めない。

## 関連ファイル

- `src/routes/index.tsx`、`src/pages/home/`、`src/components/features/LandingPage/`：公開TOP
- `src/routes/features.tsx`、`src/pages/features/`：機能紹介
- `src/routes/pricing.tsx`、`src/pages/pricing/`、`src/components/features/PricingSite/`：料金・プラン
- `src/routes/commercial-transactions.tsx`、`src/pages/commercial-transactions/`、`src/components/features/CommercialTransactions/`：特定商取引法に基づく表記
- `src/routes/faq.tsx`、`src/pages/faq/`、`src/components/features/FaqSite/`：総合FAQとTOP向けFAQ抜粋
- `src/components/features/FaqSite/content/**/*.mdx`：質問、回答、検索用メタデータ、表示順
- `src/components/features/FaqSite/faqMetadata.ts`、`faqContent.ts`、`landingFaqContent.ts`：frontmatter検証、検索、構造化データ
- `src/routes/howto.tsx`、`src/pages/howto/`、`src/components/features/HowToSite/`：使い方とヘルプ
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
