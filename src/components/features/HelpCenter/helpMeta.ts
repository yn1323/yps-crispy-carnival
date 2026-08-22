import type { HelpFeatureId } from "./helpFeatures";
import { parseHelpFrontmatter } from "./helpSchema";
import type { HelpAudience, HelpTaskId } from "./helpTasks";
import { getHelpTask } from "./helpTasks";

export type HelpContentKind = "faq" | "guide";

type HelpMetadataBase = {
  id: string;
  kind: HelpContentKind;
  title: string;
  task: HelpTaskId;
  audience: HelpAudience;
  keywords: string[];
  featureIds: HelpFeatureId[];
  related: string[];
  order: number;
  homeFeatured: boolean;
  summary: string;
};

export type FaqMetadata = HelpMetadataBase & {
  kind: "faq";
  href: `/help#${string}`;
  primaryGuide?: string;
};

export type GuideMetadata = HelpMetadataBase & {
  kind: "guide";
  href: `/help/${string}`;
  primaryGuide?: undefined;
};

export type HelpMetadata = FaqMetadata | GuideMetadata;

type HelpDraftVisibility = ReadonlySet<string>;

const publicFrontmatterModules = import.meta.glob<unknown>(
  [
    "./content/faqs/*/index.mdx",
    "./content/guides/*/index.mdx",
    "!./content/faqs/_*/index.mdx",
    "!./content/guides/_*/index.mdx",
  ],
  { eager: true, query: "?mdx-frontmatter", import: "default" },
);

const publicSummaryModules = import.meta.glob<string>(
  [
    "./content/faqs/*/index.mdx",
    "./content/guides/*/index.mdx",
    "!./content/faqs/_*/index.mdx",
    "!./content/guides/_*/index.mdx",
  ],
  { eager: true, query: "?mdx-summary", import: "default" },
);

const draftMarkerModules = import.meta.glob<true>(["./content/faqs/_*/index.mdx", "./content/guides/_*/index.mdx"], {
  eager: true,
  query: "?mdx-marker",
  import: "default",
});

const draftHelpIds = new Set(Object.keys(draftMarkerModules).map(draftHelpIdFromPath));

export const helpMetas = buildHelpMetas(publicFrontmatterModules, publicSummaryModules, draftHelpIds);
export const faqMetas = helpMetas.filter(isFaqMetadata);
export const guideMetas = helpMetas.filter(isGuideMetadata);
export const homeFeaturedFaqMetas = faqMetas.filter((meta) => meta.homeFeatured);
export const landingFaqs = homeFeaturedFaqMetas.map((meta) => ({
  q: meta.title,
  a: meta.summary,
  href: meta.href,
}));

export function buildHelpMetas(
  frontmatterByPath: Record<string, unknown>,
  summaryByPath: Record<string, string | string[]>,
  draftIds: HelpDraftVisibility = new Set(),
): HelpMetadata[] {
  assertMatchingModulePaths(frontmatterByPath, summaryByPath);

  const metas = Object.entries(frontmatterByPath).map(([path, frontmatter]) => {
    const id = helpIdFromPath(path);
    const parsed = parseHelpFrontmatter(frontmatter, id);
    helpIdFromPath(path, parsed.kind);

    const summaryValue = summaryByPath[path];
    const summary = (Array.isArray(summaryValue) ? summaryValue[0] : summaryValue)?.trim();
    if (!summary) {
      throw new Error(`ヘルプ「${id}」の表示本文が見つかりません`);
    }

    const common = {
      id,
      kind: parsed.kind,
      title: parsed.title,
      task: parsed.task,
      audience: parsed.audience,
      keywords: parsed.keywords,
      featureIds: parsed.featureIds,
      related: parsed.related,
      order: parsed.order,
      homeFeatured: parsed.homeFeatured,
      summary,
    } satisfies HelpMetadataBase;

    if (parsed.kind === "faq") {
      return {
        ...common,
        kind: "faq",
        href: `/help#${id}`,
        primaryGuide: parsed.primaryGuide,
      } satisfies FaqMetadata;
    }

    return {
      ...common,
      kind: "guide",
      href: `/help/${id}`,
    } satisfies GuideMetadata;
  });

  assertUniqueHelpValues(metas, (meta) => meta.id, "ID");
  assertUniqueHelpValues(metas, (meta) => meta.title, "title");
  assertUniqueHelpValues(metas, (meta) => `${meta.task}:${meta.kind}:${meta.order}`, "task・kind内のorder");
  assertHelpRelations(metas, draftIds);

  const homeFeaturedCount = metas.filter((meta) => meta.homeFeatured).length;
  if (homeFeaturedCount > 6) {
    throw new Error(`homeFeaturedのFAQは6件以内にしてください（現在${homeFeaturedCount}件）`);
  }

  return metas
    .map((meta) => {
      const related = meta.related.filter((relatedId) => metas.some((candidate) => candidate.id === relatedId));
      if (meta.kind === "faq" && meta.primaryGuide && draftIds.has(meta.primaryGuide)) {
        return { ...meta, related, primaryGuide: undefined };
      }
      return { ...meta, related };
    })
    .sort(compareHelpMetas);
}

export function helpIdFromPath(path: string, expectedKind?: HelpContentKind): string {
  const match = path.match(/(?:^|\/)content\/(faqs|guides)\/([^/]+)\/index\.mdx$/);
  if (!match) {
    throw new Error(`ヘルプのpath「${path}」はcontent/{faqs|guides}/<id>/index.mdx形式にしてください`);
  }

  const [, location, id] = match;
  if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`ヘルプのディレクトリ名「${id ?? path}」はkebab-caseのIDにしてください`);
  }

  const actualKind: HelpContentKind = location === "faqs" ? "faq" : "guide";
  if (expectedKind && expectedKind !== actualKind) {
    throw new Error(`ヘルプ「${id}」のkind「${expectedKind}」はcontent/${location}の配置と一致しません`);
  }
  return id;
}

export function getGuideMeta(slug?: string): GuideMetadata | undefined {
  return slug ? guideMetas.find((meta) => meta.id === slug) : undefined;
}

/** `related` は片側だけへ記載し、表示時は双方向の関係として解決する。 */
export function getRelatedHelpMetas(meta: HelpMetadata, metadata: readonly HelpMetadata[] = helpMetas): HelpMetadata[] {
  const directlyRelatedIds = new Set(meta.related);
  return metadata.filter(
    (candidate) =>
      candidate.id !== meta.id && (directlyRelatedIds.has(candidate.id) || candidate.related.includes(meta.id)),
  );
}

export function createHelpFaqPageJsonLd(entries: readonly FaqMetadata[] = faqMetas): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.title,
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.summary,
      },
    })),
  };
}

export function createLandingFaqPageJsonLd(): Record<string, unknown> {
  return createHelpFaqPageJsonLd(homeFeaturedFaqMetas);
}

function draftHelpIdFromPath(path: string): string {
  const match = path.match(/(?:^|\/)content\/(?:faqs|guides)\/_+([^/]+)\/index\.mdx$/);
  const id = match?.[1];
  if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`下書きヘルプのディレクトリ名「${path}」は_<kebab-case ID>にしてください`);
  }
  return id;
}

function assertMatchingModulePaths(
  frontmatterByPath: Record<string, unknown>,
  summaryByPath: Record<string, string | string[]>,
) {
  for (const path of Object.keys(frontmatterByPath)) {
    if (!Object.hasOwn(summaryByPath, path)) {
      throw new Error(`ヘルプ「${helpIdFromPath(path)}」の表示本文が見つかりません`);
    }
  }
  for (const path of Object.keys(summaryByPath)) {
    if (!Object.hasOwn(frontmatterByPath, path)) {
      throw new Error(`ヘルプ「${helpIdFromPath(path)}」のfrontmatterが見つかりません`);
    }
  }
}

function assertUniqueHelpValues(metas: HelpMetadata[], selectValue: (meta: HelpMetadata) => string, label: string) {
  const seen = new Set<string>();
  for (const meta of metas) {
    const value = selectValue(meta);
    if (seen.has(value)) throw new Error(`ヘルプの${label}「${value}」が重複しています`);
    seen.add(value);
  }
}

function assertHelpRelations(metas: HelpMetadata[], draftIds: HelpDraftVisibility) {
  const metasById = new Map(metas.map((meta) => [meta.id, meta]));

  for (const meta of metas) {
    for (const relatedId of meta.related) {
      if (relatedId === meta.id) {
        throw new Error(`ヘルプ「${meta.id}」はrelatedで自分自身を参照できません`);
      }
      if (!metasById.has(relatedId) && !draftIds.has(relatedId)) {
        throw new Error(`ヘルプ「${meta.id}」のrelated「${relatedId}」が見つかりません`);
      }
    }

    if (meta.kind === "faq" && meta.primaryGuide) {
      const primaryGuide = metasById.get(meta.primaryGuide);
      if (!primaryGuide) {
        if (draftIds.has(meta.primaryGuide)) continue;
        throw new Error(`FAQ「${meta.id}」のprimaryGuide「${meta.primaryGuide}」は公開中の使い方ではありません`);
      }
      if (primaryGuide.kind !== "guide") {
        throw new Error(`FAQ「${meta.id}」のprimaryGuide「${meta.primaryGuide}」は使い方を参照してください`);
      }
    }
  }
}

function isFaqMetadata(meta: HelpMetadata): meta is FaqMetadata {
  return meta.kind === "faq";
}

function isGuideMetadata(meta: HelpMetadata): meta is GuideMetadata {
  return meta.kind === "guide";
}

function compareHelpMetas(left: HelpMetadata, right: HelpMetadata): number {
  const leftTaskOrder = getHelpTask(left.task)?.order ?? Number.MAX_SAFE_INTEGER;
  const rightTaskOrder = getHelpTask(right.task)?.order ?? Number.MAX_SAFE_INTEGER;
  return (
    leftTaskOrder - rightTaskOrder ||
    (left.kind === right.kind ? 0 : left.kind === "faq" ? -1 : 1) ||
    left.order - right.order ||
    left.id.localeCompare(right.id)
  );
}
