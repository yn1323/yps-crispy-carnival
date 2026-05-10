# 公開サブページ

LPの既存コンテンツを流用し、検索結果に法務ページ以外の自然な導線を出すための公開ページ群。
新規説明文は最小限にし、詳細な訴求はLPセクションをSingle Source of Truthとして扱う。

## 関連ファイル

- `src/routes/features.tsx` / `src/pages/features/index.tsx` — できることページ
- `src/routes/faq.tsx` / `src/pages/faq/index.tsx` — よくある質問ページ
- `src/components/features/LandingPage/` — 流用元のLPセクションと公開導線
- `scripts/prerender.ts` / `public/sitemap.xml` — 静的HTML生成と検索エンジン向けURL一覧

## 画面一覧

| パス | 内容 |
|---|---|
| `/features` | 希望回収、未提出確認、シフト作成、確定通知の紹介 |
| `/faq` | 導入前によくある質問 |
| `/demo/shiftboard` | 登録なしで試せる店長向けデモ |

## API一覧

なし。公開サブページはLPコンテンツの静的表示のみで、Convex APIは利用しない。
