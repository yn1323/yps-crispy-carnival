import { describe, expect, it } from "vitest";
import { articleMetas } from "@/src/components/features/ArticleSite/articleMeta";
import { createProductFeatureFaqPageJsonLd, getProductFeature, PRODUCT_FEATURES } from "./productFeatureContent";
import { PRODUCT_FEATURE_SLUGS } from "./productFeatureRoutes";

describe("機能ページの内容", () => {
  it("公開slugと同じ順番で、すべての機能ページを1件ずつ持つ", () => {
    expect(PRODUCT_FEATURES.map((feature) => feature.slug)).toEqual([...PRODUCT_FEATURE_SLUGS]);
    expect(PRODUCT_FEATURES.map((feature) => feature.href)).toEqual(
      PRODUCT_FEATURE_SLUGS.map((slug) => `/features/${slug}`),
    );
    expect(getProductFeature("unknown-feature")).toBeUndefined();
  });

  it("関連する機能は自分以外の公開済みの機能を重複なく指す", () => {
    for (const feature of PRODUCT_FEATURES) {
      expect(feature.related).not.toContain(feature.slug);
      expect(new Set(feature.related).size).toBe(feature.related.length);
      for (const slug of feature.related) {
        expect(getProductFeature(slug)).toBeDefined();
      }
    }
  });

  it("関連記事は公開済みの記事だけを指す", () => {
    const publishedSlugs = new Set(articleMetas.map((article) => article.slug));
    for (const feature of PRODUCT_FEATURES) {
      expect(feature.articleSlugs.length).toBeGreaterThan(0);
      for (const slug of feature.articleSlugs) {
        expect(publishedSlugs.has(slug), `${feature.slug} -> ${slug}`).toBe(true);
      }
    }
  });

  it("画面に表示するFAQと同じ内容からFAQPage構造化データを作る", () => {
    for (const feature of PRODUCT_FEATURES) {
      expect(feature.faqs.length).toBeGreaterThan(0);
      expect(createProductFeatureFaqPageJsonLd(feature)).toEqual({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: feature.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.q,
          acceptedAnswer: { "@type": "Answer", text: faq.a },
        })),
      });
    }
  });
});
