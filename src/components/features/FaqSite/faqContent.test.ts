import { describe, expect, it } from "vitest";
import { helpArticles } from "../HowToSite/helpContent";
import {
  createFaqPageJsonLd,
  FAQ_CATEGORIES,
  type FaqEntry,
  faqEntries,
  normalizeFaqSearchText,
  searchFaqEntries,
} from "./faqContent";
import { createLandingFaqPageJsonLd, featuredFaqEntries as landingFaqEntries, landingFaqs } from "./landingFaqContent";

const expectedFaqJsonLd = (entries: Array<Pick<FaqEntry, "question" | "answer" | "points">>) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: entries.map((entry) => ({
    "@type": "Question",
    name: entry.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: [...entry.answer, ...(entry.points ?? [])].join("\n"),
    },
  })),
});

describe("FAQコンテンツ", () => {
  it("IDと質問が重複せず、すべて既存カテゴリに属する", () => {
    expect(new Set(faqEntries.map((entry) => entry.id)).size).toBe(faqEntries.length);
    expect(new Set(faqEntries.map((entry) => entry.question)).size).toBe(faqEntries.length);

    const categoryIds = new Set(FAQ_CATEGORIES.map((category) => category.id));
    expect(
      faqEntries
        .filter((entry) => !categoryIds.has(entry.category))
        .map((entry) => ({ id: entry.id, category: entry.category })),
    ).toEqual([]);
  });

  it("トップページにはfeaturedの7件だけを表示する", () => {
    expect(landingFaqEntries).toHaveLength(7);
    expect(landingFaqEntries.map((entry) => entry.id)).toEqual(
      faqEntries.filter((entry) => entry.featured).map((entry) => entry.id),
    );
    expect(landingFaqs).toEqual(
      landingFaqEntries.map((entry) => ({
        q: entry.question,
        a: entry.answer[0],
      })),
    );
  });

  it.each([
    ["LINE 届かない", ["line-not-delivered", "confirmed-link-unavailable"]],
    ["下書き 再提出", ["draft-after-resubmission"]],
    ["利用人数 複数店舗", ["usage-count"]],
    ["時間指定 日ごと 勤務区分", ["submission-patterns"]],
    ["スタッフ 別店舗", ["add-staff"]],
    ["催促 予約されない", ["automatic-reminder"]],
    ["管理者 招待 期限切れ", ["manager-invite-unavailable"]],
  ])("複数語の検索「%s」で該当するFAQだけを返す", (query, expectedIds) => {
    expect(searchFaqEntries(faqEntries, query).map((entry) => entry.id)).toEqual(expectedIds);
  });

  it("全角文字と空白をNFKCで正規化して検索する", () => {
    expect(normalizeFaqSearchText(" ＬＩＮＥ　　届かない ")).toBe("line 届かない");
    expect(searchFaqEntries(faqEntries, " ＬＩＮＥ　　届かない ").map((entry) => entry.id)).toEqual([
      "line-not-delivered",
      "confirmed-link-unavailable",
    ]);
  });

  it("FAQページのJSON-LDが全FAQの表示内容と一致する", () => {
    expect(createFaqPageJsonLd()).toEqual(expectedFaqJsonLd(faqEntries));
  });

  it("トップページのJSON-LDがトップページの表示内容と一致する", () => {
    expect(createLandingFaqPageJsonLd()).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: landingFaqs.map((faq) => ({
        "@type": "Question",
        name: faq.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.a,
        },
      })),
    });
  });

  it("詳しい手順へのリンクがHowToページ内のアンカーを指す", () => {
    const howToHrefs = faqEntries.flatMap((entry) => (entry.howTo ? [entry.howTo.href] : []));
    const helpSlugs = new Set(helpArticles.map((article) => article.slug));

    expect(howToHrefs.length).toBeGreaterThan(0);
    expect(howToHrefs.filter((href) => !/^\/howto#[a-z0-9]+(?:-[a-z0-9]+)*$/.test(href))).toEqual([]);
    expect(howToHrefs.filter((href) => !helpSlugs.has(href.slice("/howto#".length)))).toEqual([]);
  });
});
