import { describe, expect, it } from "vitest";
import { legacyHelpGuideRedirects, resolveLegacyHelpGuideHref } from "./helpAliases";
import {
  buildHelpIndexMetas,
  type FaqIndexMetadata,
  faqIndexMetas,
  type HelpIndexMetadata,
  helpIndexMetas,
} from "./helpIndexData";
import {
  buildHelpMetas,
  createHelpFaqPageJsonLd,
  createLandingFaqPageJsonLd,
  faqMetas,
  getGuideMeta,
  getRelatedHelpMetas,
  guideMetas,
  helpIdFromPath,
  helpMetas,
  homeFeaturedFaqMetas,
  landingFaqs,
} from "./helpMeta";
import { resolveLegacyHelpHash } from "./helpNavigation";
import { normalizeHelpSearchText, searchHelpMetas } from "./helpSearch";
import { HELP_TASKS } from "./helpTasks";

const extractedMdxTextModules = import.meta.glob<string[]>("../../../lib/mdx/test-content/plain-text.mdx", {
  eager: true,
  query: "?mdx-text",
  import: "default",
});

const FAQ_PATH = "./content/faqs/example-faq.mdx";
const GUIDE_PATH = "./content/guides/example-guide.mdx";

function faqFrontmatter(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "faq",
    title: "テスト用の質問ですか？",
    task: "staff-management",
    audience: "manager",
    keywords: [],
    featureIds: [],
    related: [],
    order: 10,
    homeFeatured: false,
    ...overrides,
  };
}

function guideFrontmatter(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "guide",
    title: "テスト用の使い方",
    task: "staff-management",
    audience: "manager",
    keywords: [],
    featureIds: [],
    related: [],
    order: 10,
    homeFeatured: false,
    ...overrides,
  };
}

function buildSingleFaq(frontmatter: Record<string, unknown> = faqFrontmatter(), text = ["最初の回答です。"]) {
  return buildHelpMetas({ [FAQ_PATH]: frontmatter }, { [FAQ_PATH]: text });
}

function searchFixture(overrides: Partial<FaqIndexMetadata> & Pick<FaqIndexMetadata, "id">): FaqIndexMetadata {
  const { id, ...rest } = overrides;
  return {
    id,
    kind: "faq",
    title: `${id}のタイトル`,
    task: "staff-management",
    audience: "manager",
    keywords: [],
    featureIds: [],
    related: [],
    order: 10,
    homeFeatured: false,
    summary: `${id}の概要`,
    bodyText: `${id}の本文`,
    answerText: `${id}の本文`,
    href: `/help/tasks/staff-management#${id}`,
    ...rest,
  };
}

describe("HelpCenterの実コンテンツ", () => {
  it("全taskに公開コンテンツを用意し、primaryGuideを同じtaskへ接続する", () => {
    for (const task of HELP_TASKS) {
      expect(helpMetas.filter((meta) => meta.task === task.id).length).toBeGreaterThan(0);
    }

    for (const faq of faqMetas) {
      if (faq.primaryGuide) {
        expect(getGuideMeta(faq.primaryGuide)?.task).toBe(faq.task);
      }
    }
  });

  it("本文由来のsummary・bodyText・answerTextとkind別hrefを生成する", () => {
    expect(helpMetas.every((meta) => meta.summary.length > 0)).toBe(true);
    expect(helpIndexMetas.every((meta) => meta.bodyText.length >= meta.summary.length)).toBe(true);
    expect(
      faqIndexMetas.every(
        (meta) => meta.answerText === meta.bodyText && meta.href === `/help/tasks/${meta.task}#${meta.id}`,
      ),
    ).toBe(true);
    expect(guideMetas.every((meta) => meta.href === `/help/${meta.id}`)).toBe(true);
  });

  it("トップ掲載FAQを6件以内に保ち、同じ内容からJSON-LDを生成する", () => {
    expect(homeFeaturedFaqMetas.length).toBeGreaterThan(0);
    expect(homeFeaturedFaqMetas.length).toBeLessThanOrEqual(6);
    expect(landingFaqs).toEqual(
      homeFeaturedFaqMetas.map((meta) => ({ q: meta.title, a: meta.summary, href: meta.href })),
    );
    expect(createHelpFaqPageJsonLd(homeFeaturedFaqMetas)).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: homeFeaturedFaqMetas.map((meta) => ({
        "@type": "Question",
        name: meta.title,
        acceptedAnswer: { "@type": "Answer", text: meta.summary },
      })),
    });
    expect(createLandingFaqPageJsonLd()).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: homeFeaturedFaqMetas.map((meta) => ({
        "@type": "Question",
        name: meta.title,
        acceptedAnswer: { "@type": "Answer", text: meta.summary },
      })),
    });
  });
});

describe("HelpCenterの旧hash URL", () => {
  it("taskとFAQの旧hashを新しいページへ解決する", () => {
    expect(resolveLegacyHelpHash("#task-staff-management")).toBe("/help/tasks/staff-management");
    expect(resolveLegacyHelpHash("#add-staff-methods")).toBe("/help/tasks/staff-management#add-staff-methods");
    expect(resolveLegacyHelpHash("#first-steps")).toBe("/help/scenarios/shift-management");
    expect(resolveLegacyHelpHash("#choose-staff-status-change")).toBe("/help/tasks/staff-management");
    expect(resolveLegacyHelpHash("#deletion-scope-differences")).toBe("/help/tasks/organization-billing");
    expect(resolveLegacyHelpHash("#task-getting-started")).toBe("/help/scenarios/shift-management");
    expect(resolveLegacyHelpHash("#unknown-help")).toBeUndefined();
    expect(resolveLegacyHelpHash("#%E0%A4%A")).toBeUndefined();
  });
});

describe("HelpCenterの旧使い方URL", () => {
  it("削除した公開slugを現在のシナリオまたはtaskへ解決する", () => {
    expect(Object.keys(legacyHelpGuideRedirects)).toHaveLength(8);
    expect(resolveLegacyHelpGuideHref("start-shift-management")).toBe("/help/scenarios/shift-management");
    expect(resolveLegacyHelpGuideHref("add-staff")).toBe("/help/tasks/staff-management");
    expect(resolveLegacyHelpGuideHref("unknown-help")).toBeUndefined();
  });
});

describe("HelpCenter frontmatterとpath", () => {
  it("strict schemaでunknown key、task、feature、配列重複、正のorderを検証する", () => {
    expect(() => buildSingleFaq(faqFrontmatter({ unknown: "value" }))).toThrow('"unknown"');
    expect(() => buildSingleFaq(faqFrontmatter({ task: "unknown-task" }))).toThrow("frontmatter");
    expect(() => buildSingleFaq(faqFrontmatter({ featureIds: ["unknown-feature"] }))).toThrow("frontmatter");
    expect(() => buildSingleFaq(faqFrontmatter({ keywords: ["重複", "重複"] }))).toThrow("重複しています");
    expect(() => buildSingleFaq(faqFrontmatter({ related: ["same", "same"] }))).toThrow("重複しています");
    expect(() => buildSingleFaq(faqFrontmatter({ featureIds: ["auth-pages", "auth-pages"] }))).toThrow(
      "重複しています",
    );
    expect(() => buildSingleFaq(faqFrontmatter({ order: 0 }))).toThrow("frontmatter");
  });

  it("kindと配置の不一致、guideのprimaryGuide・homeFeaturedを拒否する", () => {
    expect(() => buildHelpMetas({ [GUIDE_PATH]: faqFrontmatter() }, { [GUIDE_PATH]: ["回答です。"] })).toThrow(
      "配置と一致しません",
    );
    expect(() =>
      buildHelpMetas(
        { [GUIDE_PATH]: guideFrontmatter({ primaryGuide: "another-guide" }) },
        { [GUIDE_PATH]: ["手順です。"] },
      ),
    ).toThrow('"primaryGuide"');
    expect(() =>
      buildHelpMetas({ [GUIDE_PATH]: guideFrontmatter({ homeFeatured: true }) }, { [GUIDE_PATH]: ["手順です。"] }),
    ).toThrow("frontmatter");
  });

  it("kebab-caseのファイル名をIDとして使い、旧階層と本文・frontmatterの欠落を拒否する", () => {
    expect(helpIdFromPath(FAQ_PATH, "faq")).toBe("example-faq");
    expect(() => helpIdFromPath("./content/faqs/Bad_Id.mdx")).toThrow("kebab-case");
    expect(() => helpIdFromPath("./content/faqs/example-faq/index.mdx")).toThrow("<id>.mdx");
    expect(() => buildSingleFaq(faqFrontmatter(), [])).toThrow("表示本文が見つかりません");
    expect(() => buildHelpMetas({ [FAQ_PATH]: faqFrontmatter() }, {})).toThrow("表示本文が見つかりません");
    expect(() => buildHelpMetas({}, { [FAQ_PATH]: ["回答です。"] })).toThrow("frontmatterが見つかりません");
  });

  it("FAQと使い方を通したID・titleと、task・kind内のorder重複を拒否する", () => {
    const duplicateGuidePath = "./content/guides/example-faq.mdx";
    expect(() =>
      buildHelpMetas(
        { [FAQ_PATH]: faqFrontmatter(), [duplicateGuidePath]: guideFrontmatter() },
        { [FAQ_PATH]: ["回答です。"], [duplicateGuidePath]: ["手順です。"] },
      ),
    ).toThrow("ID「example-faq」が重複しています");

    const secondFaqPath = "./content/faqs/second-faq.mdx";
    expect(() =>
      buildHelpMetas(
        {
          [FAQ_PATH]: faqFrontmatter(),
          [secondFaqPath]: faqFrontmatter({ order: 20 }),
        },
        { [FAQ_PATH]: ["回答です。"], [secondFaqPath]: ["別の回答です。"] },
      ),
    ).toThrow("title");

    expect(() =>
      buildHelpMetas(
        {
          [FAQ_PATH]: faqFrontmatter(),
          [secondFaqPath]: faqFrontmatter({ title: "別の質問ですか？" }),
        },
        { [FAQ_PATH]: ["回答です。"], [secondFaqPath]: ["別の回答です。"] },
      ),
    ).toThrow("order");
  });
});

describe("HelpCenter relation", () => {
  it("self relatedと、公開・下書きのどちらにもないrelatedを拒否する", () => {
    expect(() => buildSingleFaq(faqFrontmatter({ related: ["example-faq"] }))).toThrow("自分自身");
    expect(() => buildSingleFaq(faqFrontmatter({ related: ["missing-help"] }))).toThrow(
      "related「missing-help」が見つかりません",
    );
  });

  it("公開ヘルプから下書きへのrelatedを公開metadataから除外する", () => {
    const [meta] = buildHelpMetas(
      { [FAQ_PATH]: faqFrontmatter({ related: ["draft-guide"] }) },
      { [FAQ_PATH]: ["回答です。"] },
      new Set(["draft-guide"]),
    );
    expect(meta.related).toEqual([]);
  });

  it("relatedを片側だけ記載しても両方のコンテンツから解決する", () => {
    const metas = buildHelpMetas(
      {
        [FAQ_PATH]: faqFrontmatter({ related: ["example-guide"] }),
        [GUIDE_PATH]: guideFrontmatter(),
      },
      { [FAQ_PATH]: ["回答です。"], [GUIDE_PATH]: ["手順です。"] },
    );
    const faq = metas.find((meta) => meta.id === "example-faq");
    const guide = metas.find((meta) => meta.id === "example-guide");
    if (!faq || !guide) throw new Error("relation testのヘルプが見つかりません");

    expect(getRelatedHelpMetas(faq, metas).map((meta) => meta.id)).toEqual(["example-guide"]);
    expect(getRelatedHelpMetas(guide, metas).map((meta) => meta.id)).toEqual(["example-faq"]);
  });

  it("primaryGuideは公開中の使い方だけを参照する", () => {
    const otherFaqPath = "./content/faqs/other-faq.mdx";
    expect(() =>
      buildHelpMetas(
        {
          [FAQ_PATH]: faqFrontmatter({ primaryGuide: "other-faq" }),
          [otherFaqPath]: faqFrontmatter({ title: "別の質問ですか？", order: 20 }),
        },
        { [FAQ_PATH]: ["回答です。"], [otherFaqPath]: ["別の回答です。"] },
      ),
    ).toThrow("使い方を参照してください");

    const [faqWithoutDraftGuide] = buildHelpMetas(
      { [FAQ_PATH]: faqFrontmatter({ primaryGuide: "draft-guide" }) },
      { [FAQ_PATH]: ["回答です。"] },
      new Set(["draft-guide"]),
    );
    expect(faqWithoutDraftGuide.kind === "faq" ? faqWithoutDraftGuide.primaryGuide : "guide").toBeUndefined();
  });

  it("homeFeaturedのFAQが7件以上なら拒否する", () => {
    const frontmatterByPath: Record<string, unknown> = {};
    const textByPath: Record<string, string[]> = {};
    for (let index = 1; index <= 7; index += 1) {
      const path = `./content/faqs/featured-${index}.mdx`;
      frontmatterByPath[path] = faqFrontmatter({
        title: `掲載質問${index}ですか？`,
        order: index,
        homeFeatured: true,
      });
      textByPath[path] = [`回答${index}です。`];
    }
    expect(() => buildHelpMetas(frontmatterByPath, textByPath)).toThrow("6件以内");
  });
});

describe("HelpCenter検索", () => {
  it("title、keywords、summary、task、bodyの順で一致を評価する", () => {
    const entries: HelpIndexMetadata[] = [
      searchFixture({ id: "body-hit", bodyText: "通知を確認します。", answerText: "通知を確認します。" }),
      searchFixture({ id: "task-hit", task: "notifications" }),
      searchFixture({ id: "summary-hit", summary: "通知を確認します。" }),
      searchFixture({ id: "keyword-hit", keywords: ["通知"] }),
      searchFixture({ id: "title-hit", title: "通知を確認する" }),
    ];

    expect(searchHelpMetas(entries, "通知").map((entry) => entry.id)).toEqual([
      "title-hit",
      "keyword-hit",
      "summary-hit",
      "task-hit",
      "body-hit",
    ]);
  });

  it("複数語をAND検索し、NFKC・小文字・空白を正規化する", () => {
    const entries = [
      searchFixture({ id: "both", title: "LINE通知", keywords: ["履歴"] }),
      searchFixture({ id: "line-only", title: "LINE通知" }),
      searchFixture({ id: "history-only", title: "通知履歴" }),
    ];

    expect(normalizeHelpSearchText(" ＬＩＮＥ　　履歴 ")).toBe("line 履歴");
    expect(searchHelpMetas(entries, " ＬＩＮＥ　　履歴 ").map((entry) => entry.id)).toEqual(["both"]);
  });

  it("同点ではtask order、FAQ、content order、IDの順に並べる", () => {
    const entries: HelpIndexMetadata[] = [
      {
        ...searchFixture({ id: "later-task", task: "notifications", bodyText: "共通語", answerText: "共通語" }),
        order: 1,
      },
      {
        ...searchFixture({ id: "guide-first-task", bodyText: "共通語", answerText: "共通語" }),
        kind: "guide",
        href: "/help/guide-first-task",
        primaryGuide: undefined,
      },
      { ...searchFixture({ id: "faq-order-20", bodyText: "共通語", answerText: "共通語" }), order: 20 },
      { ...searchFixture({ id: "faq-order-10-b", bodyText: "共通語", answerText: "共通語" }), order: 10 },
      { ...searchFixture({ id: "faq-order-10-a", bodyText: "共通語", answerText: "共通語" }), order: 10 },
    ];

    expect(searchHelpMetas(entries, "共通語").map((entry) => entry.id)).toEqual([
      "faq-order-10-a",
      "faq-order-10-b",
      "faq-order-20",
      "guide-first-task",
      "later-task",
    ]);
  });

  it("featureIdsとMDXのJSX名・属性を検索対象へ混ぜない", () => {
    const extractedText = Object.values(extractedMdxTextModules)[0];
    expect(extractedText).toEqual(["最初の回答とリンクの文言です。", "一つ目", "二つ目"]);

    const [baseMeta] = buildSingleFaq(faqFrontmatter({ featureIds: ["line-notification"] }), extractedText);
    const [meta] = buildHelpIndexMetas([baseMeta], { [FAQ_PATH]: extractedText });
    expect(searchHelpMetas([meta], "line-notification")).toEqual([]);
    expect(searchHelpMetas([meta], "TestVisual")).toEqual([]);
    expect(searchHelpMetas([meta], "検索へ含めない属性")).toEqual([]);
    expect(searchHelpMetas([meta], "最初 回答")).toEqual([meta]);
  });
});
