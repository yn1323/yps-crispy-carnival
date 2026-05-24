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
title: "シフト作成の困りごとメモ"
description: "毎月のシフト作成でよくある困りごとを整理します。"
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
---`;

const categoryMarkdown = `---
slug: "shift-request"
title: "シフト希望が集まらない"
description: "希望提出の声かけやルールを整理します。"
breadcrumbLabel: "シフト希望が集まらない"
pointTitle: "このカテゴリのポイント"
pointDescription: "提出しやすい仕組みづくりが大切です。"
representativeSlug: "line-shift-collection-guide"
relatedConcernSlugs: "excel-recording, staff-sharing"
---

カテゴリ本文です。
`;

const articleMarkdown = `---
title: "LINEでシフト希望を集めるときに起きやすい困りごと"
description: "LINEで希望を集めるときに起きがちな問題を整理します。"
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
      title: "シフト作成の困りごとメモ",
      concernSlugs: ["shift-request", "excel-recording"],
      ctaPrimaryHref: "/demo/flow",
    });
  });

  it("category md frontmatter を読み取れる", () => {
    expect(parseCategoryMarkdown(categoryMarkdown, "shift-request").meta).toMatchObject({
      slug: "shift-request",
      representativeSlug: "line-shift-collection-guide",
      relatedConcernSlugs: ["excel-recording", "staff-sharing"],
    });
  });

  it("article body から目次と表を生成できる", () => {
    const article = parseArticleMarkdown(articleMarkdown, "line-shift-collection-guide");

    expect(article.meta).toMatchObject({
      slug: "line-shift-collection-guide",
      canonicalPath: "/articles/line-shift-collection-guide",
      ogDescription: "LINE回収の困りごとを整理します。",
    });
    expect(article.toc).toEqual([
      { id: "lineで集めるときに起きやすいこと", text: "LINEで集めるときに起きやすいこと" },
      { id: "今日からできること", text: "今日からできること" },
    ]);
    expect(article.blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "heading",
      "table",
      "heading",
      "unorderedList",
    ]);
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
