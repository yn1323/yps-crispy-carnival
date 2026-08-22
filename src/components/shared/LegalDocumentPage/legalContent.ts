import { z } from "zod";
import type { MdxComponent, MdxComponents } from "@/src/lib/mdx";

export type LegalMdxComponents = MdxComponents;
export type LegalMdxComponent = MdxComponent;

const legalFrontmatterSchema = z.object({
  title: z.string().min(1),
  lastUpdated: z.string().min(1),
});

export type LegalDocumentContent = {
  title: string;
  lastUpdated: string;
  Content: LegalMdxComponent;
};

/**
 * コロケーションされた単一の法務MDXを、frontmatterを検証した表示用contentへ変換する。
 */
export function buildLegalDocument(
  componentModules: Record<string, LegalMdxComponent>,
  frontmatterModules: Record<string, unknown>,
  filename: string,
): LegalDocumentContent {
  const path = Object.keys(componentModules).find((candidate) => candidate.endsWith(`/${filename}`));
  if (!path) {
    throw new Error(`法務文書 "content/${filename}" が見つかりません`);
  }

  const parsed = legalFrontmatterSchema.safeParse(frontmatterModules[path]);
  if (!parsed.success) {
    throw new Error(`法務文書 "${path}" の frontmatter が正しくありません: ${parsed.error.message}`);
  }

  return { ...parsed.data, Content: componentModules[path] };
}

const LEGAL_AUDIENCES = ["manager", "staff"] as const;
type LegalDocumentAudience = (typeof LEGAL_AUDIENCES)[number];

/**
 * コロケーションされた `content/{audience}.mdx` のglob結果（`?mdx-component` / `?mdx-frontmatter`）を
 * audience別の法務文書に変換する。必須ファイル・frontmatterの欠落はモジュール読み込み時に例外として検出する。
 */
export function buildLegalDocuments(
  componentModules: Record<string, LegalMdxComponent>,
  frontmatterModules: Record<string, unknown>,
): Record<LegalDocumentAudience, LegalDocumentContent> {
  const documents: Partial<Record<LegalDocumentAudience, LegalDocumentContent>> = {};

  for (const path of Object.keys(componentModules)) {
    const audience = LEGAL_AUDIENCES.find((candidate) => path.endsWith(`/${candidate}.mdx`));
    if (!audience) {
      continue;
    }

    documents[audience] = buildLegalDocument(componentModules, frontmatterModules, `${audience}.mdx`);
  }

  for (const audience of LEGAL_AUDIENCES) {
    if (!documents[audience]) {
      throw new Error(`法務文書 "content/${audience}.mdx" が見つかりません`);
    }
  }

  return documents as Record<LegalDocumentAudience, LegalDocumentContent>;
}
