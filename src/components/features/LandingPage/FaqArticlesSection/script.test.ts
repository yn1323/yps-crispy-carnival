import { describe, expect, it } from "vitest";
import { createLandingFaqPageJsonLd, landingFaqs } from "../faqs";
import { splitLandingFaqAnswerSentences } from "./script";

describe("トップページFAQの回答表示", () => {
  it("句点ごとに次の文を改行する", () => {
    expect(splitLandingFaqAnswerSentences("一文目です。 二文目です。三文目です。")).toEqual([
      "一文目です。",
      "二文目です。",
      "三文目です。",
    ]);
  });

  it("表示中の5件からFAQPage構造化データを生成する", () => {
    expect(landingFaqs).toHaveLength(5);
    for (const faq of landingFaqs) {
      expect(faq.a.split("\n")).toEqual(splitLandingFaqAnswerSentences(faq.a));
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
