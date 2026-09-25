import { describe, expect, it } from "vitest";
import { buildFeatureDetailPageHead } from "./detailMeta";

describe("buildFeatureDetailPageHead", () => {
  it("公開済みの機能ページはcanonical、パンくず、FAQの構造化データを持つ", () => {
    const { links, meta } = buildFeatureDetailPageHead("submission-reminder");

    expect(links).toEqual([{ rel: "canonical", href: "https://shiftori.app/features/submission-reminder" }]);
    expect(meta).toEqual(
      expect.arrayContaining([
        { title: "シフト未提出の催促を自動化｜提出状況を一覧で確認｜シフトリ" },
        { property: "og:url", content: "https://shiftori.app/features/submission-reminder" },
      ]),
    );

    const jsonLd = meta.flatMap((entry) =>
      "script:ld+json" in entry ? [(entry as { "script:ld+json": Record<string, unknown> })["script:ld+json"]] : [],
    );
    expect(jsonLd.map((payload) => payload["@type"])).toEqual(["BreadcrumbList", "FAQPage"]);
    expect(jsonLd[0]).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "シフトリ", item: "https://shiftori.app/" },
        { "@type": "ListItem", position: 2, name: "機能一覧", item: "https://shiftori.app/features" },
        { "@type": "ListItem", position: 3, name: "提出状況の確認と自動催促" },
      ],
    });
  });

  it("存在しない機能ページはcanonicalを出さずnoindexにする", () => {
    const head = buildFeatureDetailPageHead("unknown-feature");

    expect(head).not.toHaveProperty("links");
    expect(head.meta).toEqual(expect.arrayContaining([{ name: "robots", content: "noindex, nofollow" }]));
  });
});
