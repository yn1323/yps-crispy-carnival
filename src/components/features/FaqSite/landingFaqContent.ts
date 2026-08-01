import { buildFaqMetadata } from "./faqMetadata";

export type LandingFaq = {
  q: string;
  a: string;
};

// `_` 始まりのMDXは下書きとして扱い、TOP掲載の対象から除外する。
const featuredFaqFrontmatterModules = import.meta.glob<unknown>(
  ["./content/featured/*.mdx", "!./content/featured/_*.mdx"],
  {
    eager: true,
    query: "?mdx-frontmatter",
    import: "default",
  },
);
const featuredFaqTextModules = import.meta.glob<string[]>(["./content/featured/*.mdx", "!./content/featured/_*.mdx"], {
  eager: true,
  query: "?mdx-text",
  import: "default",
});

export const featuredFaqEntries = buildFaqMetadata(featuredFaqFrontmatterModules, featuredFaqTextModules);

export const landingFaqs: LandingFaq[] = featuredFaqEntries.map((entry) => ({
  q: entry.question,
  a: entry.summary,
}));

export function createLandingFaqPageJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: landingFaqs.map((entry) => ({
      "@type": "Question",
      name: entry.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.a,
      },
    })),
  };
}
