export const articleSlugAliases = {
  "line-shift-collection-guide": "shiftori-line-workflow",
} as const;

/** 公開済みの旧slugを、metadataと本文を所有する現slugへ解決する。 */
export function resolveArticleSlug(slug: string): string {
  return articleSlugAliases[slug as keyof typeof articleSlugAliases] ?? slug;
}
