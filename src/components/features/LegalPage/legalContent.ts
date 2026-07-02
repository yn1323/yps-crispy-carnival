import type { LegalAudience } from "@/convex/legal/documents";
import { type MarkdownBlock, parseMarkdownBlocks, parseMarkdownDocument } from "@/src/helpers/markdown";

export type LegalSection = {
  title?: string;
  blocks: MarkdownBlock[];
};

export type LegalDocumentContent = {
  title: string;
  lastUpdated: string;
  sections: LegalSection[];
};

const LEGAL_AUDIENCES = ["manager", "staff"] as const satisfies readonly LegalAudience[];

/**
 * コロケーションされた `content/{audience}.md` のglob結果を audience別の法務文書に変換する。
 * 必須ファイル・frontmatterの欠落はモジュール読み込み時に例外として検出する。
 */
export function parseLegalDocuments(modules: Record<string, string>): Record<LegalAudience, LegalDocumentContent> {
  const documents: Partial<Record<LegalAudience, LegalDocumentContent>> = {};

  for (const [path, source] of Object.entries(modules)) {
    const audience = LEGAL_AUDIENCES.find((candidate) => path.endsWith(`/${candidate}.md`));
    if (audience) {
      documents[audience] = parseLegalMarkdown(source, path);
    }
  }

  for (const audience of LEGAL_AUDIENCES) {
    if (!documents[audience]) {
      throw new Error(`法務文書 "content/${audience}.md" が見つかりません`);
    }
  }

  return documents as Record<LegalAudience, LegalDocumentContent>;
}

export function parseLegalMarkdown(source: string, slug: string): LegalDocumentContent {
  const { frontmatter, bodySource } = parseMarkdownDocument(source, slug);

  for (const field of ["title", "lastUpdated"] as const) {
    if (!frontmatter[field]) {
      throw new Error(`法務文書 "${slug}" の frontmatter に ${field} がありません`);
    }
  }

  return {
    title: frontmatter.title,
    lastUpdated: frontmatter.lastUpdated,
    sections: groupBlocksIntoSections(parseMarkdownBlocks(bodySource)),
  };
}

function groupBlocksIntoSections(blocks: MarkdownBlock[]): LegalSection[] {
  const sections: LegalSection[] = [];
  let current: LegalSection = { blocks: [] };

  for (const block of blocks) {
    if (block.type === "heading" && block.level === 2) {
      if (current.title !== undefined || current.blocks.length > 0) {
        sections.push(current);
      }
      current = { title: block.text, blocks: [] };
      continue;
    }
    current.blocks.push(block);
  }

  if (current.title !== undefined || current.blocks.length > 0) {
    sections.push(current);
  }

  return sections;
}
