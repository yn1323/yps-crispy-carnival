import { describe, expect, it } from "vitest";
import {
  createArticleJsonLd,
  getArticle,
  getRepresentativeArticle,
  parseArticleMarkdown,
  parseCategoryMarkdown,
  parseSitePageMarkdown,
} from "./articleContent";

const sitePageMarkdown = `---
title: "小さなお店のシフト作成ガイド"
description: "毎月のシフト作成で起きやすい困りごとを整理します。"
breadcrumbLabel: "お役立ち情報"
concernTitle: "よくある困りごとから探す"
latestTitle: "新着記事"
ctaTitle: "シフト作成の手間を軽くしませんか？"
ctaDescription: "希望回収から共有までをまとめます。"
ctaPrimaryLabel: "見てみる"
ctaPrimaryHref: "/demo/flow"
ctaSecondaryLabel: "無料で試す"
ctaSecondaryHref: "/signup"
concernSlugs: "shift-request, excel-recording"
landingPreviewTitle: "シフト作成のヒント"
landingPreviewDescription: "LINE回収やExcel転記などのポイントを整理します。"
landingPreviewLimit: 2
landingPreviewLinkLabel: "記事一覧を見る"
---`;

const categoryMarkdown = `---
slug: "shift-request"
title: "LINEでシフト希望を集める"
description: "希望提出の声かけやルールを整理します。"
breadcrumbLabel: "LINEでシフト希望を集める"
pointTitle: "このカテゴリのポイント"
pointDescription: "提出しやすい仕組みづくりが大切です。"
concerns: "提出依頼が流れてしまう, 書き方がバラバラになる, 未提出者を見つけにくい"
representativeSlug: "line-shift-collection-guide"
relatedConcernSlugs: "excel-recording, staff-sharing"
ctaTitle: "LINEで集めたシフト希望を、一覧で確認しませんか？"
ctaDescription: "提出状況と希望内容をまとめて見られると、確認や転記の手間を減らせます。"
---

カテゴリ本文です。
`;

const articleMarkdown = `---
title: "LINEでシフト希望を集めるときに起きやすい困りごと"
description: "LINEで希望を集めるときに起きがちな問題を整理します。"
heroImageSrc: "/lp/shiftForm.webp"
heroImageAlt: "シフト希望入力画面"
heroImageWidth: 340
publishedAt: "2026-05-20"
updatedAt: "2026-05-21"
categorySlug: "shift-request"
categoryLabel: "シフト希望の回収"
author: "シフトリ編集部"
readingMinutes: 6
keywords: "LINE, 希望シフト"
relatedSlugs: "excel-shift-sheet-hard"
featured: true
canonicalPath: "/articles/line-shift-collection-guide"
ogTitle: "LINEでシフト希望を集めるときに起きやすい困りごと"
ogDescription: "LINE回収の困りごとを整理します。"
---

# LINEでシフト希望を集めるときに起きやすい困りごと

LINEは便利ですが、集め方のルールが曖昧だと確認が大変になります。

![シフト希望入力画面](/lp/shiftForm.webp "希望提出フォームの例"){width=360 align=right}

::: media align=right width=320
![シフト希望入力画面](/lp/shiftForm.webp "希望提出フォームの例")

入力場所を1つにまとめると、LINEのトークをさかのぼる手間を減らせます。
:::

## LINEで集めるときに起きやすいこと

| 困りごと | 対策 |
| --- | --- |
| 提出が流れる | 期限を固定する |

## 今日からできること

- 期限を決める
- 提出先をまとめる
`;

describe("ArticleSite markdown content", () => {
  it("page md frontmatter を読み取れる", () => {
    expect(parseSitePageMarkdown(sitePageMarkdown, "articles")).toMatchObject({
      title: "小さなお店のシフト作成ガイド",
      concernSlugs: ["shift-request", "excel-recording"],
      ctaPrimaryHref: "/demo/flow",
      landingPreviewTitle: "シフト作成のヒント",
      landingPreviewDescription: "LINE回収やExcel転記などのポイントを整理します。",
      landingPreviewLimit: 2,
      landingPreviewLinkLabel: "記事一覧を見る",
    });
  });

  it("LP preview frontmatter が未指定ならデフォルト値を使う", () => {
    const markdown = sitePageMarkdown
      .replace('landingPreviewTitle: "シフト作成のヒント"\n', "")
      .replace('landingPreviewDescription: "LINE回収やExcel転記などのポイントを整理します。"\n', "")
      .replace("landingPreviewLimit: 2\n", "")
      .replace('landingPreviewLinkLabel: "記事一覧を見る"\n', "");

    expect(parseSitePageMarkdown(markdown, "articles")).toMatchObject({
      landingPreviewTitle: "シフト作成のヒント",
      landingPreviewDescription: "LINE回収やExcel転記など、シフト作成でつまずきやすいポイントを整理しています。",
      landingPreviewLimit: 3,
      landingPreviewLinkLabel: "記事一覧を見る",
    });
  });

  it("category md frontmatter を読み取れる", () => {
    expect(parseCategoryMarkdown(categoryMarkdown, "shift-request").meta).toMatchObject({
      slug: "shift-request",
      concerns: ["提出依頼が流れてしまう", "書き方がバラバラになる", "未提出者を見つけにくい"],
      representativeSlug: "line-shift-collection-guide",
      relatedConcernSlugs: ["excel-recording", "staff-sharing"],
      ctaTitle: "LINEで集めたシフト希望を、一覧で確認しませんか？",
    });
  });

  it("article body から目次と表を生成できる", () => {
    const article = parseArticleMarkdown(articleMarkdown, "line-shift-collection-guide");

    expect(article.meta).toMatchObject({
      slug: "line-shift-collection-guide",
      canonicalPath: "/articles/line-shift-collection-guide",
      ogDescription: "LINE回収の困りごとを整理します。",
      heroImage: {
        src: "/lp/shiftForm.webp",
        alt: "シフト希望入力画面",
        width: 340,
      },
    });
    expect(article.toc).toEqual([
      { id: "lineで集めるときに起きやすいこと", text: "LINEで集めるときに起きやすいこと" },
      { id: "今日からできること", text: "今日からできること" },
    ]);
    expect(article.blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "image",
      "media",
      "heading",
      "table",
      "heading",
      "unorderedList",
    ]);
    expect(article.blocks[1]).toMatchObject({
      type: "image",
      image: {
        src: "/lp/shiftForm.webp",
        alt: "シフト希望入力画面",
        caption: "希望提出フォームの例",
        width: 360,
        align: "right",
      },
    });
    expect(article.blocks[2]).toMatchObject({
      type: "media",
      align: "right",
      image: {
        src: "/lp/shiftForm.webp",
        alt: "シフト希望入力画面",
        caption: "希望提出フォームの例",
        width: 320,
        align: "right",
      },
      text: "入力場所を1つにまとめると、LINEのトークをさかのぼる手間を減らせます。",
    });
  });

  it("画像属性が未指定なら中央寄せと幅未指定で扱う", () => {
    const article = parseArticleMarkdown(
      articleMarkdown.replace("{width=360 align=right}", ""),
      "line-shift-collection-guide",
    );

    expect(article.blocks[1]).toMatchObject({
      type: "image",
      image: {
        width: undefined,
        align: "center",
      },
    });
  });

  it("ヒーロー画像のaltがない場合はエラーにする", () => {
    const markdown = articleMarkdown.replace('heroImageAlt: "シフト希望入力画面"\n', "");

    expect(() => parseArticleMarkdown(markdown, "line-shift-collection-guide")).toThrow("heroImageAlt");
  });

  it("structured data 用の値を作れる", () => {
    const article = parseArticleMarkdown(articleMarkdown, "line-shift-collection-guide");

    expect(createArticleJsonLd(article)).toMatchObject({
      "@type": "BlogPosting",
      headline: "LINEでシフト希望を集めるときに起きやすい困りごと",
      dateModified: "2026-05-21",
      mainEntityOfPage: "/articles/line-shift-collection-guide",
    });
  });

  it("representativeSlug と slug 不一致の状態を扱える", () => {
    const category = parseCategoryMarkdown(categoryMarkdown, "shift-request");

    expect(getRepresentativeArticle(category)?.meta.slug).toBe("line-shift-collection-guide");
    expect(getArticle("missing-article")).toBeUndefined();
  });

  it("frontmatter がない記事はエラーにする", () => {
    expect(() => parseArticleMarkdown("# title", "broken")).toThrow("frontmatter");
  });
});
