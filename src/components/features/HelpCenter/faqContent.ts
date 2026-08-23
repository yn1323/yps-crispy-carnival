import type { MdxComponent } from "@/src/lib/mdx";
import { type FaqMetadata, faqMetas, helpIdFromPath } from "./helpMeta";

/**
 * FAQの本文層。`/help` のコード分割された画面からだけ読み込む。
 * メタデータは軽量な `helpMeta.ts` を正本とし、IDでMDX本文と結合する。
 */
export type HelpFaqContent = {
  meta: FaqMetadata;
  Content: MdxComponent;
};

const faqComponentModules = import.meta.glob<MdxComponent>(["./content/faqs/*.mdx", "!./content/faqs/_*.mdx"], {
  eager: true,
  query: "?mdx-component",
  import: "default",
});

export const faqEntries = buildFaqEntries(faqComponentModules, faqMetas);

export function buildFaqEntries(
  modules: Record<string, MdxComponent>,
  metadata: readonly FaqMetadata[],
): HelpFaqContent[] {
  const componentsById = new Map(
    Object.entries(modules).map(([path, Content]) => [helpIdFromPath(path, "faq"), Content] as const),
  );

  if (componentsById.size !== Object.keys(modules).length) {
    throw new Error("FAQ本文のIDが重複しています");
  }

  const entries = metadata.map((meta) => {
    const Content = componentsById.get(meta.id);
    if (!Content) throw new Error(`FAQ「${meta.id}」のMDX本文が見つかりません`);
    return { meta, Content };
  });

  if (entries.length !== Object.keys(modules).length) {
    throw new Error("frontmatterのないFAQ本文があります");
  }

  return entries;
}

export function getFaqContent(id: string): HelpFaqContent | undefined {
  return faqEntries.find((entry) => entry.meta.id === id);
}
