import { describe, expect, it } from "vitest";
import { helpArticles } from "../HowToSite/helpContent";
import {
  buildFaqEntries,
  createFaqPageJsonLd,
  FAQ_CATEGORIES,
  type FaqEntry,
  faqEntries,
  normalizeFaqSearchText,
  searchFaqEntries,
} from "./faqContent";
import { createLandingFaqPageJsonLd, featuredFaqEntries as landingFaqEntries, landingFaqs } from "./landingFaqContent";

const expectedFaqJsonLd = (entries: Array<Pick<FaqEntry, "question" | "answerText">>) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: entries.map((entry) => ({
    "@type": "Question",
    name: entry.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: entry.answerText,
    },
  })),
});

const examplePath = "./content/example.mdx";
const ExampleContent = () => null;
const exampleFrontmatter = {
  question: "テストの質問ですか？",
  category: "before-start",
  keywords: ["テスト"],
  audience: "all",
  order: 10,
};

describe("FAQコンテンツ", () => {
  it("現在の49件をファイル名由来のIDと表示順で読み込む", () => {
    expect(faqEntries.map((entry) => entry.id)).toEqual([
      "submit-with-line",
      "pricing",
      "staff-account",
      "without-line",
      "mobile-support",
      "automatic-reminder",
      "move-from-paper-or-excel",
      "shift-workflow",
      "submission-patterns",
      "shop-setting-changes",
      "add-staff",
      "registration-approval",
      "registration-status",
      "add-staff-during-recruitment",
      "staff-membership-differences",
      "create-recruitment",
      "change-recruitment",
      "submission-status",
      "edit-submission",
      "after-deadline",
      "reuse-previous-pattern",
      "build-before-all-submissions",
      "input-work-time",
      "warnings-and-errors",
      "save-draft",
      "draft-after-resubmission",
      "confirm-shift",
      "staff-confirmed-shift-view",
      "edit-confirmed-shift",
      "notify-confirmed-changes",
      "past-shift",
      "delete-recruitment",
      "notification-channel",
      "connect-line",
      "line-not-delivered",
      "failed-notifications",
      "individual-notification-resend",
      "notification-history",
      "confirmation-reminder",
      "organization-and-shop",
      "switch-shop",
      "manager-invite-unavailable",
      "usage-count",
      "delete-shop-or-organization",
      "submission-link-unavailable",
      "confirmed-link-unavailable",
      "login-trouble",
      "legal-consent",
      "contact-support",
    ]);
    expect(new Set(faqEntries.map((entry) => entry.question)).size).toBe(faqEntries.length);
    expect(faqEntries.every((entry) => entry.answerText.length > 0)).toBe(true);

    const categoryIds = new Set(FAQ_CATEGORIES.map((category) => category.id));
    expect(
      faqEntries
        .filter((entry) => !categoryIds.has(entry.category))
        .map((entry) => ({ id: entry.id, category: entry.category })),
    ).toEqual([]);
  });

  it("MDX component、frontmatter、表示テキストを一つのFAQへ結合する", () => {
    const [entry] = buildFaqEntries(
      { [examplePath]: ExampleContent },
      { [examplePath]: exampleFrontmatter },
      { [examplePath]: ["最初の回答です。", "次の回答です。"] },
    );

    expect(entry).toMatchObject({
      id: "example",
      question: "テストの質問ですか？",
      summary: "最初の回答です。",
      answerText: "最初の回答です。\n次の回答です。",
      featured: false,
      Content: ExampleContent,
    });
  });

  it("下書きHowToへの詳しい手順リンクを公開対象から除外する", () => {
    const [entry] = buildFaqEntries(
      { [examplePath]: ExampleContent },
      {
        [examplePath]: {
          ...exampleFrontmatter,
          howTo: { href: "/howto#draft-help", label: "詳しい手順を見る" },
        },
      },
      { [examplePath]: ["回答です。"] },
      { published: new Set(), draft: new Set(["draft-help"]) },
    );

    expect(entry.howTo).toBeUndefined();
  });

  it("不正なfrontmatterと本文の欠落を読み込み時に拒否する", () => {
    expect(() =>
      buildFaqEntries(
        { [examplePath]: ExampleContent },
        { [examplePath]: { ...exampleFrontmatter, category: "unknown" } },
        { [examplePath]: ["回答です。"] },
      ),
    ).toThrow("カテゴリ「unknown」が見つかりません");

    expect(() => buildFaqEntries({ [examplePath]: ExampleContent }, { [examplePath]: exampleFrontmatter }, {})).toThrow(
      "回答本文が見つかりません",
    );
  });

  it("トップページにはfeaturedディレクトリの7件だけを表示する", () => {
    expect(landingFaqEntries).toHaveLength(7);
    expect(landingFaqEntries.map((entry) => entry.id)).toEqual(
      faqEntries.filter((entry) => entry.featured).map((entry) => entry.id),
    );
    expect(landingFaqs).toEqual(
      landingFaqEntries.map((entry) => ({
        q: entry.question,
        a: entry.summary,
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

  it("FAQページのJSON-LDがMDXから抽出した全FAQの表示内容と一致する", () => {
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

  it("詳しい手順へのリンクが公開中のHowToページ内アンカーを指す", () => {
    const howToHrefs = faqEntries.flatMap((entry) => (entry.howTo ? [entry.howTo.href] : []));
    const helpSlugs = new Set(helpArticles.map((article) => article.slug));

    expect(howToHrefs.length).toBeGreaterThan(0);
    expect(howToHrefs.filter((href) => !/^\/howto#[a-z0-9]+(?:-[a-z0-9]+)*$/.test(href))).toEqual([]);
    expect(howToHrefs.filter((href) => !helpSlugs.has(href.slice("/howto#".length)))).toEqual([]);
  });
});
