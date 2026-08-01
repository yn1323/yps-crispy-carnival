import { describe, expect, it } from "vitest";
import { getArticle, getRepresentativeArticle } from "./articleContent";
import {
  createArticleBreadcrumbJsonLd,
  createArticleJsonLd,
  createCategoryBreadcrumbJsonLd,
  getArticleOgpImagePath,
  parseArticleMetadata,
  parseCategoryMetadata,
  parseSitePageFrontmatter,
} from "./articleMeta";

const sitePageFrontmatter = {
  title: "シフト作成ガイド",
  description: "毎月のシフト作成で起きやすい困りごとを整理します。",
  breadcrumbLabel: "お役立ち情報",
  concernTitle: "よくある困りごとから探す",
  latestTitle: "新着記事",
  ctaTitle: "シフト作成の手間を軽くしませんか？",
  ctaDescription: "希望回収から共有までをまとめます。",
  ctaPrimaryLabel: "見てみる",
  ctaPrimaryHref: "/demo/flow",
  ctaSecondaryLabel: "無料で試す",
  ctaSecondaryHref: "/signup",
  concernSlugs: "shift-request, excel-recording",
  landingPreviewTitle: "シフト作成のヒント",
  landingPreviewDescription: "LINE回収やExcel転記などのポイントを整理します。",
  landingPreviewLimit: 2,
  landingPreviewLinkLabel: "記事一覧を見る",
};

const categoryFrontmatter = {
  slug: "shift-request",
  title: "LINEでシフト希望を集める",
  description: "希望提出の声かけやルールを整理します。",
  breadcrumbLabel: "LINEでシフト希望を集める",
  pointTitle: "このカテゴリのポイント",
  pointDescription: "提出しやすい仕組みづくりが大切です。",
  concerns: "提出依頼が流れてしまう, 書き方がバラバラになる, 未提出者を見つけにくい",
  representativeSlug: "shift-type-request-guide",
  relatedConcernSlugs: "excel-recording, staff-sharing",
  ctaTitle: "LINEで集めたシフト希望を、一覧で確認しませんか？",
  ctaDescription: "提出状況と希望内容をまとめて見られると、確認や転記の手間を減らせます。",
};

const articleFrontmatter = {
  title: "LINEでシフト希望を集めるときに起きやすい困りごと",
  description: "LINEで希望を集めるときに起きがちな問題を整理します。",
  heroImageSrc: "/lp/shiftForm.webp",
  heroImageAlt: "シフト希望入力画面",
  heroImageWidth: 340,
  publishedAt: "2026-05-20",
  updatedAt: "2026-05-21",
  categorySlug: "shift-request",
  categoryLabel: "シフト希望の回収",
  author: "シフトリ編集部",
  readingMinutes: 6,
  keywords: "LINE, 希望シフト",
  relatedSlugs: "excel-shift-sheet-hard",
  featured: true,
  canonicalPath: "/articles/line-shift-collection-guide",
  ogTitle: "LINEでシフト希望を集めるときに起きやすい困りごと",
  ogDescription: "LINE回収の困りごとを整理します。",
};

describe("ArticleSite frontmatter", () => {
  it("page frontmatter を読み取れる", () => {
    expect(parseSitePageFrontmatter(sitePageFrontmatter, "articles")).toMatchObject({
      title: "シフト作成ガイド",
      concernSlugs: ["shift-request", "excel-recording"],
      ctaPrimaryHref: "/demo/flow",
      landingPreviewTitle: "シフト作成のヒント",
      landingPreviewDescription: "LINE回収やExcel転記などのポイントを整理します。",
      landingPreviewLimit: 2,
      landingPreviewLinkLabel: "記事一覧を見る",
    });
  });

  it("LP preview frontmatter が未指定ならデフォルト値を使う", () => {
    const { landingPreviewTitle, landingPreviewDescription, landingPreviewLimit, landingPreviewLinkLabel, ...rest } =
      sitePageFrontmatter;

    expect(parseSitePageFrontmatter(rest, "articles")).toMatchObject({
      landingPreviewTitle: "シフト作成のヒント",
      landingPreviewDescription:
        "LINEでの回収やExcelへの転記など、シフト作成でつまずきやすいポイントを整理しています。",
      landingPreviewLimit: 3,
      landingPreviewLinkLabel: "記事一覧を見る",
    });
  });

  it("category frontmatter を読み取れる", () => {
    expect(parseCategoryMetadata(categoryFrontmatter, "shift-request")).toMatchObject({
      slug: "shift-request",
      concerns: ["提出依頼が流れてしまう", "書き方がバラバラになる", "未提出者を見つけにくい"],
      representativeSlug: "shift-type-request-guide",
      relatedConcernSlugs: ["excel-recording", "staff-sharing"],
      ctaTitle: "LINEで集めたシフト希望を、一覧で確認しませんか？",
    });
  });

  it("article frontmatter を読み取れる", () => {
    expect(parseArticleMetadata(articleFrontmatter, "line-shift-collection-guide")).toMatchObject({
      slug: "line-shift-collection-guide",
      canonicalPath: "/articles/line-shift-collection-guide",
      ogDescription: "LINE回収の困りごとを整理します。",
      keywords: ["LINE", "希望シフト"],
      relatedSlugs: ["excel-shift-sheet-hard"],
      featured: true,
      heroImage: {
        src: "/lp/shiftForm.webp",
        alt: "シフト希望入力画面",
        width: 340,
      },
    });
  });

  it("ヒーロー画像のaltがない場合はエラーにする", () => {
    const { heroImageAlt, ...rest } = articleFrontmatter;

    expect(() => parseArticleMetadata(rest, "line-shift-collection-guide")).toThrow("heroImageAlt");
  });

  it("frontmatter がない記事はエラーにする", () => {
    expect(() => parseArticleMetadata(undefined, "broken")).toThrow("frontmatter");
  });
});

describe("ArticleSite structured data", () => {
  const meta = parseArticleMetadata(articleFrontmatter, "line-shift-collection-guide");

  it("structured data 用の値を作れる", () => {
    expect(createArticleJsonLd(meta)).toMatchObject({
      "@type": "BlogPosting",
      headline: "LINEでシフト希望を集めるときに起きやすい困りごと",
      dateModified: "2026-05-21",
      image: "https://shiftori.app/ogp/articles/line-shift-collection-guide.png",
      publisher: {
        "@type": "Organization",
        name: "シフトリ",
        logo: { "@type": "ImageObject", url: "https://shiftori.app/logo512.png" },
      },
      mainEntityOfPage: "https://shiftori.app/articles/line-shift-collection-guide",
    });
  });

  it("記事別OGP画像のパスを組み立てられる", () => {
    expect(getArticleOgpImagePath("line-shift-submission")).toBe("/ogp/articles/line-shift-submission.png");
  });

  it("記事ページのパンくず structured data を作れる", () => {
    expect(createArticleBreadcrumbJsonLd(meta)).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "お役立ち情報", item: "https://shiftori.app/articles" },
        {
          "@type": "ListItem",
          position: 2,
          name: "シフト希望の回収",
          item: "https://shiftori.app/articles/categories/shift-request",
        },
        { "@type": "ListItem", position: 3, name: "LINEでシフト希望を集めるときに起きやすい困りごと" },
      ],
    });
  });

  it("カテゴリページのパンくず structured data を作れる", () => {
    const category = parseCategoryMetadata(categoryFrontmatter, "shift-request");

    expect(createCategoryBreadcrumbJsonLd(category)).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "お役立ち情報", item: "https://shiftori.app/articles" },
        { "@type": "ListItem", position: 2, name: "LINEでシフト希望を集める" },
      ],
    });
  });
});

describe("ArticleSite 記事の取得", () => {
  it("公開済みの旧slugから新しい記事を表示できる", () => {
    expect(getArticle("line-shift-collection-guide")?.meta).toMatchObject({
      slug: "shiftori-line-workflow",
      canonicalPath: "/articles/shiftori-line-workflow",
    });
  });

  it("実ファイルの記事に本文コンポーネントと目次がある", () => {
    const article = getArticle("shiftori-line-workflow");

    expect(article?.Content).toBeTypeOf("function");
    expect(article?.toc.length).toBeGreaterThan(0);
  });

  it("representativeSlug と slug 不一致の状態を扱える", () => {
    const category = parseCategoryMetadata(categoryFrontmatter, "shift-request");

    expect(getRepresentativeArticle(category)?.meta.slug).toBe("shift-type-request-guide");
    expect(getArticle("missing-article")).toBeUndefined();
  });
});
