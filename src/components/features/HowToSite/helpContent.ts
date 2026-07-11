import type { ComponentType, ElementType } from "react";
import { z } from "zod";

export const HELP_NAVIGATION_GROUPS = [
  { id: "task", label: "やりたいことから探す" },
  { id: "trouble", label: "困りごとから探す" },
  { id: "system", label: "シフトリの仕組みを知る" },
] as const;

export type HelpNavigationGroupId = (typeof HELP_NAVIGATION_GROUPS)[number]["id"];

export const HELP_CATEGORIES = [
  { id: "getting-started", label: "使い始める", navigationGroup: "task", order: 10 },
  { id: "shop-settings", label: "店舗設定を確認する", navigationGroup: "task", order: 20 },
  { id: "staff-management", label: "スタッフを管理する", navigationGroup: "task", order: 30 },
  { id: "shift-collection", label: "シフトを募集して回収する", navigationGroup: "task", order: 40 },
  { id: "shift-building", label: "シフトを作成して確定する", navigationGroup: "task", order: 50 },
  { id: "shift-operation-trouble", label: "募集や作成で困ったとき", navigationGroup: "trouble", order: 60 },
  { id: "staff-trouble", label: "スタッフが操作できないとき", navigationGroup: "trouble", order: 70 },
  { id: "notification-trouble", label: "通知の困りごと", navigationGroup: "trouble", order: 80 },
  { id: "notification-system", label: "通知の仕組み", navigationGroup: "system", order: 90 },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  navigationGroup: HelpNavigationGroupId;
  order: number;
}>;

export type HelpCategory = (typeof HELP_CATEGORIES)[number];
export type HelpMdxComponents = Record<string, ElementType>;
export type HelpMdxComponent = ComponentType<{ components?: HelpMdxComponents }>;

const helpFrontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  keywords: z.array(z.string().min(1)).default([]),
  features: z.array(z.string().min(1)).default([]),
  related: z.array(z.string().min(1)).default([]),
  order: z.number().int().positive(),
});

export type HelpFrontmatter = z.infer<typeof helpFrontmatterSchema>;

export type HelpArticle = {
  slug: string;
  meta: HelpFrontmatter;
  category: HelpCategory;
  Content: HelpMdxComponent;
  searchText: string;
};

const helpModules = import.meta.glob<HelpMdxComponent>("./content/*.mdx", {
  eager: true,
  query: "?help-component",
  import: "default",
});
const helpFrontmatterModules = import.meta.glob<unknown>("./content/*.mdx", {
  eager: true,
  query: "?help-frontmatter",
  import: "default",
});
const helpSourceModules = import.meta.glob<string>("./content/*.mdx", {
  eager: true,
  query: "?help-source",
  import: "default",
});

export const helpArticles = buildHelpArticles(helpModules, helpFrontmatterModules, helpSourceModules);

export function buildHelpArticles(
  modules: Record<string, HelpMdxComponent>,
  frontmatterByPath: Record<string, unknown>,
  sources: Record<string, string>,
): HelpArticle[] {
  const articles = Object.entries(modules).map(([path, Content]) => {
    const slug = path.match(/\/([^/]+)\.mdx$/)?.[1] ?? path;
    const parsed = helpFrontmatterSchema.safeParse(frontmatterByPath[path]);

    if (!parsed.success) {
      throw new Error(`ヘルプ「${slug}」のfrontmatterが正しくありません: ${parsed.error.message}`);
    }

    const category = HELP_CATEGORIES.find((candidate) => candidate.id === parsed.data.category);
    if (!category) {
      throw new Error(`ヘルプ「${slug}」のカテゴリ「${parsed.data.category}」が見つかりません`);
    }

    const source = sources[path];
    if (source === undefined) {
      throw new Error(`ヘルプ「${slug}」の検索用本文が見つかりません`);
    }

    return {
      slug,
      meta: parsed.data,
      category,
      Content,
      searchText: normalizeHelpSearchText(
        [parsed.data.title, parsed.data.description, category.label, ...parsed.data.keywords, source].join(" "),
      ),
    };
  });

  const slugs = new Set(articles.map((article) => article.slug));
  for (const article of articles) {
    const missingRelatedSlug = article.meta.related.find((relatedSlug) => !slugs.has(relatedSlug));
    if (missingRelatedSlug) {
      throw new Error(`ヘルプ「${article.slug}」の関連記事「${missingRelatedSlug}」が見つかりません`);
    }
  }

  return articles.sort(
    (left, right) => left.category.order - right.category.order || left.meta.order - right.meta.order,
  );
}

export function normalizeHelpSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ja").replace(/\s+/g, " ").trim();
}

export function searchHelpArticles(articles: HelpArticle[], query: string): HelpArticle[] {
  const terms = normalizeHelpSearchText(query).split(" ").filter(Boolean);
  if (terms.length === 0) return articles;

  return articles.filter((article) => terms.every((term) => article.searchText.includes(term)));
}
