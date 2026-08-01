import type { MdxComponent } from "@/src/lib/mdx";
import { buildFaqMetadata, type FaqMetadata, faqIdFromPath, normalizeFaqSearchText } from "./faqMetadata";

export { FAQ_CATEGORIES, type FaqAudience, type FaqCategoryId, normalizeFaqSearchText } from "./faqMetadata";
export {
  createLandingFaqPageJsonLd,
  featuredFaqEntries as landingFaqEntries,
  landingFaqs,
} from "./landingFaqContent";

export type FaqEntry = FaqMetadata & {
  Content: MdxComponent;
};

// `_` 始まりのMDXは下書きとして扱い、バンドルにも公開ページにも含めない。
const faqModules = import.meta.glob<MdxComponent>(["./content/**/*.mdx", "!./content/**/_*.mdx"], {
  eager: true,
  query: "?mdx-component",
  import: "default",
});
const faqFrontmatterModules = import.meta.glob<unknown>(["./content/**/*.mdx", "!./content/**/_*.mdx"], {
  eager: true,
  query: "?mdx-frontmatter",
  import: "default",
});
const faqTextModules = import.meta.glob<string[]>(["./content/**/*.mdx", "!./content/**/_*.mdx"], {
  eager: true,
  query: "?mdx-text",
  import: "default",
});

export const faqEntries = buildFaqEntries(faqModules, faqFrontmatterModules, faqTextModules);

export function buildFaqEntries(
  modules: Record<string, MdxComponent>,
  frontmatterByPath: Record<string, unknown>,
  textBlocksByPath: Record<string, string[]>,
  helpSlugs?: Parameters<typeof buildFaqMetadata>[2],
): FaqEntry[] {
  const metadata = buildFaqMetadata(frontmatterByPath, textBlocksByPath, helpSlugs);
  const componentsById = new Map(
    Object.entries(modules).map(([path, Content]) => [faqIdFromPath(path), Content] as const),
  );

  if (componentsById.size !== Object.keys(modules).length) {
    throw new Error("FAQ本文のIDが重複しています");
  }

  const entries = metadata.map((entry) => {
    const Content = componentsById.get(entry.id);
    if (!Content) throw new Error(`FAQ「${entry.id}」のMDX本文が見つかりません`);
    return { ...entry, Content };
  });

  if (entries.length !== Object.keys(modules).length) {
    throw new Error("frontmatterがないFAQ本文があります");
  }

  return entries;
}

export function searchFaqEntries(entries: FaqEntry[], query: string): FaqEntry[] {
  const terms = normalizeFaqSearchText(query).split(" ").filter(Boolean);
  if (terms.length === 0) return entries;

  return entries.filter((entry) => terms.every((term) => entry.searchText.includes(term)));
}

export function faqAnswerText(entry: FaqEntry): string {
  return entry.answerText;
}

export function createFaqPageJsonLd(entries: FaqEntry[] = faqEntries): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faqAnswerText(entry),
      },
    })),
  };
}
