/**
 * 記事別OGP画像の生成スクリプト
 *
 * ArticleSite の各記事 (content/articles/<slug>/index.md) の frontmatter から
 * タイトル・カテゴリを読み取り、1200x630 の PNG を public/ogp/articles/<slug>.png に
 * 書き出す。SNS共有時に全ページ共通ロゴではなく記事タイトル入りの画像を出すための資産。
 *
 * 使い方: pnpm ogp:articles  (記事の追加・タイトル変更時に実行し、生成物をコミットする)
 *
 * 注意:
 * - ビルドパイプラインには組み込まない（CI に日本語フォントがない環境でも壊れないよう、
 *   生成物を public/ にコミットして配信する方式）。
 * - 日本語フォント (Noto Sans CJK / Noto Sans JP / ヒラギノ等) がある環境で実行すること。
 * - 参照側のパス規約は src/components/features/ArticleSite/articleContent.ts の
 *   getArticleOgpImagePath と一致させる。
 */

import { mkdir, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { parseMarkdownDocument } from "../src/helpers/markdown";

const ARTICLES_DIR = join("src", "components", "features", "ArticleSite", "content", "articles");
const OUTPUT_DIR = join("public", "ogp", "articles");
const LOGO_PATH = resolve("public", "textlogo_black.png");
const WIDTH = 1200;
const HEIGHT = 630;

// ロゴ・LPで使っているブランドティール系の色
const BRAND_TEAL = "#35948c";
const CHIP_TEAL = "#22726b";
const CHIP_BG = "#e3f2f0";

type ArticleOgpSource = {
  slug: string;
  title: string;
  categoryLabel: string;
};

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function listArticleSources(): Promise<ArticleOgpSource[]> {
  const entries = await readdir(ARTICLES_DIR, { withFileTypes: true });
  const sources = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const markdown = await readFile(join(ARTICLES_DIR, entry.name, "index.md"), "utf-8");
        const { frontmatter } = parseMarkdownDocument(markdown, entry.name);
        if (!frontmatter.title || !frontmatter.categoryLabel) {
          throw new Error(`[ogp] ${entry.name} の frontmatter に title / categoryLabel がありません`);
        }
        return { slug: entry.name, title: frontmatter.title, categoryLabel: frontmatter.categoryLabel };
      }),
  );

  return sources.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** タイトルの「｜」前をメイン、後ろをサブとして分割する（サブなしも可） */
function splitTitle(title: string): { main: string; sub?: string } {
  const [main, ...rest] = title.split("｜");
  const sub = rest.join("｜").trim();
  return { main: main.trim(), sub: sub || undefined };
}

/** メインタイトルの長さに応じてはみ出さないフォントサイズを選ぶ */
function mainTitleFontSize(main: string): number {
  if (main.length <= 18) return 62;
  if (main.length <= 28) return 56;
  return 50;
}

function buildTemplate(source: ArticleOgpSource, logoDataUri: string): string {
  const { main, sub } = splitTitle(source.title);

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
      body {
        font-family: "Noto Sans CJK JP", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif;
        background: ${BRAND_TEAL};
        padding: 36px;
      }
      .card {
        width: 100%;
        height: 100%;
        background: #fff;
        border-radius: 28px;
        padding: 52px 60px 44px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .chip {
        align-self: flex-start;
        color: ${CHIP_TEAL};
        background: ${CHIP_BG};
        border-radius: 999px;
        padding: 10px 26px;
        font-size: 27px;
        font-weight: 700;
      }
      .title {
        color: #1c2430;
        font-size: ${mainTitleFontSize(main)}px;
        font-weight: 800;
        line-height: 1.42;
        letter-spacing: 0.01em;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .subtitle {
        margin-top: 20px;
        color: #55606e;
        font-size: 32px;
        font-weight: 700;
        line-height: 1.5;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .footer img { height: 54px; }
      .footer span { color: #7b8694; font-size: 26px; font-weight: 600; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="chip">${escapeHtml(source.categoryLabel)}</div>
      <div>
        <div class="title">${escapeHtml(main)}</div>
        ${sub ? `<div class="subtitle">${escapeHtml(sub)}</div>` : ""}
      </div>
      <div class="footer">
        <img src="${logoDataUri}" alt="" />
        <span>shiftori.app</span>
      </div>
    </div>
  </body>
</html>`;
}

async function main(): Promise<void> {
  const sources = await listArticleSources();
  console.log(`[ogp] Generating ${sources.length} article OGP image(s)`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  // setContent したページ (about:blank) からは file:// を参照できないため data URI で埋め込む
  const logoDataUri = `data:image/png;base64,${(await readFile(LOGO_PATH)).toString("base64")}`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });

  try {
    for (const source of sources) {
      await page.setContent(buildTemplate(source, logoDataUri), { waitUntil: "load" });
      // FontFaceSet はシリアライズ不能なため undefined に変換して待つ
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const outPath = join(OUTPUT_DIR, `${source.slug}.png`);
      await page.screenshot({ path: outPath, type: "png" });
      console.log(`[ogp] Wrote ${outPath}`);
    }
  } finally {
    await browser.close();
  }

  console.log("[ogp] Done");
}

main().catch((err: unknown) => {
  console.error("[ogp] Failed:", err);
  process.exit(1);
});
