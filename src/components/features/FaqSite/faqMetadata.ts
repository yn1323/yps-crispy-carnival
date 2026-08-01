import { z } from "zod";
import { getUnderscorePrefixedMdxSlugs, mdxSlugFromPath } from "@/src/lib/mdx";

export const FAQ_CATEGORIES = [
  { id: "before-start", label: "はじめる前に", order: 10 },
  { id: "setup-staff", label: "初期設定とスタッフ", order: 20 },
  { id: "recruitment-submission", label: "シフト募集と希望提出", order: 30 },
  { id: "shift-building", label: "シフト作成と確定", order: 40 },
  { id: "notifications", label: "LINEとメール通知", order: 50 },
  { id: "organization-billing", label: "グループ・権限・料金", order: 60 },
  { id: "trouble", label: "困ったとき", order: 70 },
] as const;

export type FaqCategoryId = (typeof FAQ_CATEGORIES)[number]["id"];
export type FaqAudience = "all" | "manager" | "staff";
export type FaqHowTo = {
  href: `/howto#${string}`;
  label: string;
};

const faqFrontmatterSchema = z
  .object({
    question: z.string().min(1),
    category: z.string().min(1),
    keywords: z.array(z.string().min(1)).default([]),
    audience: z.enum(["all", "manager", "staff"]),
    howTo: z
      .object({
        href: z.string().regex(/^\/howto#[a-z0-9]+(?:-[a-z0-9]+)*$/),
        label: z.string().min(1),
      })
      .strict()
      .optional(),
    order: z.number().int().positive(),
  })
  .strict();

export type FaqMetadata = {
  id: string;
  category: FaqCategoryId;
  question: string;
  summary: string;
  answerText: string;
  keywords: string[];
  audience: FaqAudience;
  featured: boolean;
  howTo?: FaqHowTo;
  order: number;
  searchText: string;
};

// FAQのHowTo導線を非公開記事へ向けない。Object.keysの直書きによりMDX本文はimportしない。
const publishedHelpSlugs = new Set(
  Object.keys(import.meta.glob(["../HowToSite/content/*.mdx", "!../HowToSite/content/_*.mdx"])).map(mdxSlugFromPath),
);
const draftHelpSlugs = getUnderscorePrefixedMdxSlugs(Object.keys(import.meta.glob("../HowToSite/content/_*.mdx")));

type HelpSlugVisibility = {
  published: ReadonlySet<string>;
  draft: ReadonlySet<string>;
};

const helpSlugVisibility: HelpSlugVisibility = {
  published: publishedHelpSlugs,
  draft: draftHelpSlugs,
};

export function buildFaqMetadata(
  frontmatterByPath: Record<string, unknown>,
  textBlocksByPath: Record<string, string[]>,
  helpSlugs: HelpSlugVisibility = helpSlugVisibility,
): FaqMetadata[] {
  const entries = Object.entries(frontmatterByPath).map(([path, frontmatter]) => {
    const id = faqIdFromPath(path);
    const parsed = faqFrontmatterSchema.safeParse(frontmatter);

    if (!parsed.success) {
      throw new Error(`FAQ「${id}」のfrontmatterが正しくありません: ${parsed.error.message}`);
    }

    const category = FAQ_CATEGORIES.find((candidate) => candidate.id === parsed.data.category);
    if (!category) {
      throw new Error(`FAQ「${id}」のカテゴリ「${parsed.data.category}」が見つかりません`);
    }

    const textBlocks = textBlocksByPath[path];
    if (!textBlocks || textBlocks.length === 0) {
      throw new Error(`FAQ「${id}」の回答本文が見つかりません`);
    }

    const howToSlug = parsed.data.howTo?.href.slice("/howto#".length);
    const targetsDraftHelp =
      howToSlug !== undefined && helpSlugs.draft.has(howToSlug) && !helpSlugs.published.has(howToSlug);
    const howTo =
      parsed.data.howTo && !targetsDraftHelp
        ? {
            href: parsed.data.howTo.href as FaqHowTo["href"],
            label: parsed.data.howTo.label,
          }
        : undefined;

    return {
      id,
      category: category.id,
      question: parsed.data.question,
      summary: textBlocks[0],
      answerText: textBlocks.join("\n"),
      keywords: parsed.data.keywords,
      audience: parsed.data.audience,
      featured: isFeaturedFaqPath(path),
      howTo,
      order: parsed.data.order,
      searchText: normalizeFaqSearchText(
        [parsed.data.question, category.label, ...parsed.data.keywords, ...textBlocks].join(" "),
      ),
    } satisfies FaqMetadata;
  });

  assertUniqueFaqValues(entries, (entry) => entry.id, "ID");
  assertUniqueFaqValues(entries, (entry) => entry.question, "質問");
  assertUniqueFaqValues(entries, (entry) => `${entry.category}:${entry.order}`, "カテゴリ内のorder");

  return entries.sort((left, right) => {
    const leftCategoryOrder = FAQ_CATEGORIES.find((category) => category.id === left.category)?.order ?? 0;
    const rightCategoryOrder = FAQ_CATEGORIES.find((category) => category.id === right.category)?.order ?? 0;
    return leftCategoryOrder - rightCategoryOrder || left.order - right.order || left.id.localeCompare(right.id);
  });
}

export function faqIdFromPath(path: string): string {
  const id = path.match(/\/([^/]+)\.mdx$/)?.[1];
  if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`FAQのファイル名「${path}」はkebab-caseのIDにしてください`);
  }
  return id;
}

export function normalizeFaqSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ja").replace(/\s+/g, " ").trim();
}

function isFeaturedFaqPath(path: string): boolean {
  return /\/content\/featured\/[^/]+\.mdx$/.test(path);
}

function assertUniqueFaqValues(entries: FaqMetadata[], selectValue: (entry: FaqMetadata) => string, label: string) {
  const seen = new Set<string>();
  for (const entry of entries) {
    const value = selectValue(entry);
    if (seen.has(value)) throw new Error(`FAQの${label}「${value}」が重複しています`);
    seen.add(value);
  }
}
