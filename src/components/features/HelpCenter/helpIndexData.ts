import { type FaqMetadata, type GuideMetadata, type HelpMetadata, helpIdFromPath, helpMetas } from "./helpMeta";

export type FaqIndexMetadata = FaqMetadata & {
  bodyText: string;
  answerText: string;
};

export type GuideIndexMetadata = GuideMetadata & {
  bodyText: string;
};

export type HelpIndexMetadata = FaqIndexMetadata | GuideIndexMetadata;

/** `/help` の全文検索とFAQ回答だけが使う本文テキスト層。guide詳細ルートからはimportしない。 */
const publicTextModules = import.meta.glob<string[]>(
  ["./content/faqs/*.mdx", "./content/guides/*.mdx", "!./content/faqs/_*.mdx", "!./content/guides/_*.mdx"],
  { eager: true, query: "?mdx-text", import: "default" },
);

export const helpIndexMetas = buildHelpIndexMetas(helpMetas, publicTextModules);
export const faqIndexMetas = helpIndexMetas.filter(isFaqIndexMetadata);

export function buildHelpIndexMetas(
  metadata: readonly HelpMetadata[],
  textBlocksByPath: Record<string, string[]>,
): HelpIndexMetadata[] {
  const metadataById = new Map(metadata.map((meta) => [meta.id, meta]));
  const textById = new Map<string, string[]>();

  for (const [path, rawBlocks] of Object.entries(textBlocksByPath)) {
    const id = helpIdFromPath(path);
    const meta = metadataById.get(id);
    if (!meta) throw new Error(`ヘルプ「${id}」のfrontmatterが見つかりません`);
    helpIdFromPath(path, meta.kind);

    const blocks = rawBlocks.map((block) => block.trim()).filter(Boolean);
    if (blocks.length === 0) throw new Error(`ヘルプ「${id}」の表示本文が見つかりません`);
    if (blocks[0] !== meta.summary) {
      throw new Error(`ヘルプ「${id}」のsummaryと本文の最初の表示テキストが一致しません`);
    }
    if (textById.has(id)) throw new Error(`ヘルプ本文のID「${id}」が重複しています`);
    textById.set(id, blocks);
  }

  return metadata.map((meta) => {
    const blocks = textById.get(meta.id);
    if (!blocks) throw new Error(`ヘルプ「${meta.id}」の表示本文が見つかりません`);
    const bodyText = blocks.join("\n");

    if (meta.kind === "faq") {
      return { ...meta, bodyText, answerText: bodyText } satisfies FaqIndexMetadata;
    }
    return { ...meta, bodyText } satisfies GuideIndexMetadata;
  });
}

function isFaqIndexMetadata(meta: HelpIndexMetadata): meta is FaqIndexMetadata {
  return meta.kind === "faq";
}
