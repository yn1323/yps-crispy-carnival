import { describe, expect, it } from "vitest";
import { splitJapaneseSentences } from "@/src/lib/japaneseSentences";
import { createLandingFaqPageJsonLd, landingFaqs } from "../faqs";

describe("トップページFAQの回答表示", () => {
  it("表示中の8件からFAQPage構造化データを生成する", () => {
    expect(landingFaqs).toHaveLength(8);
    for (const faq of landingFaqs) {
      expect(faq.a.split("\n")).toEqual(splitJapaneseSentences(faq.a));
    }
    expect(createLandingFaqPageJsonLd()).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: landingFaqs.map((faq) => ({
        "@type": "Question",
        name: faq.q,
        acceptedAnswer: { "@type": "Answer", text: faq.a },
      })),
    });
  });
});
