# 公開サイト

> 文書種別: feature
>
> 最終コード照合: 2026-07-23
>
> 基準commit: `b61100a680e80d154a74f576d03c53712846e062`

公開サイトは、登録前の製品理解と、利用中の疑問解消をつなぐ認証不要のページ群である。
ルート`/`を入口に、機能紹介、FAQ、HowTo、記事、操作デモへ利用者を案内する。

## ページの役割

| パス | 役割 | 主な実装 |
|---|---|---|
| `/` | 価値、利用の流れ、提出方法、利用例、FAQと記事への入口、登録導線をまとめるTOP | `src/pages/home/`、`src/components/features/LandingPage/` |
| `/features` | 希望回収、未提出確認、シフト作成、確定通知など、できることを詳しく示す | `src/pages/features/`、`FeatureSection`、`BenefitsSection` |
| `/faq` | 導入前から利用中までの質問を、カテゴリと検索から探せるようにする | `src/pages/faq/`、`src/components/features/FaqSite/` |
| `/howto` | 画面上の場所、操作、結果、失敗時の対処を、利用場面から探せるようにする | `src/pages/howto/`、`src/components/features/HowToSite/` |
| `/articles` | シフト運営に関する記事とカテゴリへの入口を示す | `src/pages/articles/`、`ArticleListPage` |
| `/articles/:slug` | 一つの記事を表示し、関連する製品情報へつなぐ | `ArticlePage`、`ArticleSite/content/articles/` |
| `/articles/categories/:categorySlug` | 同じ課題領域の記事をまとめる | `ArticleCategoryPage`、`ArticleSite/content/categories/` |
| `/demo/flow` | 募集作成から確定通知までの流れを、登録なしで順番に試せるようにする | `src/pages/demo-flow/`、`Demo/ShiftoriDemoFlow/` |
| `/demo/shiftboard` | PC向けシフト表の入力と調整を、登録なしで試せるようにする | `src/pages/demo-shift-board/`、`Demo/DemoShiftBoardPage/` |

TOPは`src/routes/index.tsx`から`HomePage`を呼び、`HomePage`が`LandingPage`を構成する。
`LandingPage`は`PublicPageLayout`の中に、Hero、課題の軽減、利用の流れ、提出方法、比較、利用例、FAQと記事、CTAの各sectionを並べる。

FAQ、HowTo、記事、デモは同じ公開サイトに属するが、内容の置き場所は分かれている。
FAQは`FaqSite`、HowToはMDXを含む`HowToSite`、記事は`ArticleSite`、操作できるデモは`Demo`が所有する。
HowToの詳細な編集規則は [`howto.md`](howto.md) を参照する。

## 公開サイトから接続する機能

問い合わせ、法務文書、認証は公開URLを持つが、公開サイトのコンテンツとは別の機能契約を持つ。

| 接続先 | 公開URL | 正本 |
|---|---|---|
| 問い合わせ | `/contact` | [`contact.md`](contact.md) |
| 利用規約とプライバシーポリシー | `/terms`、`/privacy`と対象別URL | [`legal-consent.md`](legal-consent.md) |
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

公開コンテンツの表示にはClerkとConvexを使わない。
`vite.config.ts`はTanStack Routerの自動code splittingを有効にし、`AuthProviders`は認証route、未登録スタッフroute、認証画面の近くに置いている。
このため、TOP、FAQ、HowTo、記事、デモの初期bundleにはClerkとConvexを含めない。

FAQ、HowTo、記事、デモを表示するためのConvex APIもない。
問い合わせなど、公開サイトから遷移する別機能のAPIは、その機能文書を参照する。

## コンテンツと導線の分担

| 場所 | 利用者の問い | 内容の責務 |
|---|---|---|
| TOP | 自分の店舗で何が楽になるか | 価値と利用の流れを短く示し、詳しい入口を選べるようにする |
| 機能紹介 | どの作業を支援できるか | 主な機能と利用場面を比較できるようにする |
| FAQ | 料金、通知、導入、運用について結論を知りたい | 質問ごとに結論と必要な注意点を示す |
| HowTo | 画面でどう操作し、失敗時にどう戻るか | 操作場所、手順、結果、回復方法を示す |
| 記事 | シフト運営の課題をどう判断するか | 課題の整理、選択肢、関連する製品導線を示す |
| デモ | 登録前に操作と結果を確かめたい | 実データを保存せず、主要な操作の流れを体験できるようにする |

TOPのFAQ抜粋は`src/components/features/FaqSite/landingFaqContent.ts`、総合FAQは`faqContent.ts`が所有する。
同じ質問を両方へ置く場合も、表示内容と構造化データが一致するようにする。

HowToの追加と更新には`write-help-content`、デモの設計には`demo-ux`を使う。
記事の構造とメタデータは`src/components/features/ArticleSite/AGENTS.md`に従う。

## 静的生成とメタデータ

`scripts/prerender.ts`はTOP、機能紹介、FAQ、HowTo、問い合わせ、記事一覧、汎用の法務文書、二つのデモを固定routeとしてprerenderする。
記事詳細とカテゴリは`ArticleSite/content/`のslugから対象routeを組み立てる。

`public/sitemap.xml`は検索エンジンへ公開するURL、`public/llms.txt`は機械可読な公開コンテンツの入口を持つ。
記事別OGPは`scripts/generateArticleOgp.ts`と`public/ogp/articles/`が所有し、prerender時に不足を検出する。

全ページのfallback metadataは`index.html`、route別metadataとJSON-LDは対応する`src/pages/*/meta.ts`とコンテンツfeatureが所有する。
FAQ、BlogPosting、BreadcrumbListなどの構造化データは、画面に表示する現在内容と一致させる。

buildとprerender後の`dist/`はCloudflare Pagesへ配信する。
実際のdeployment状態はこの機能文書から推測せず、CI/CDの手順と実行結果で確認する。

## 関連ファイル

- `src/routes/index.tsx`、`src/pages/home/`、`src/components/features/LandingPage/`：公開TOP
- `src/routes/features.tsx`、`src/pages/features/`：機能紹介
- `src/routes/faq.tsx`、`src/pages/faq/`、`src/components/features/FaqSite/`：総合FAQ
- `src/routes/howto.tsx`、`src/pages/howto/`、`src/components/features/HowToSite/`：使い方とヘルプ
- `src/routes/articles*.tsx`、`src/pages/articles/`、`src/components/features/ArticleSite/`：記事一覧、記事詳細、カテゴリ
- `src/routes/demo.*.tsx`、`src/pages/demo-*/`、`src/components/features/Demo/`：公開デモ
- `src/components/templates/PublicPageLayout/`：公開ページ共通layout
- `vite.config.ts`：route単位の自動code splitting
- `src/pages/*/meta.ts`、`src/lib/seo/`：ページ別metadataと共通SEO処理
- `scripts/prerender.ts`、`public/sitemap.xml`、`public/llms.txt`：静的HTMLと公開URL
- `scripts/generateArticleOgp.ts`、`public/ogp/articles/`：記事別OGP画像
