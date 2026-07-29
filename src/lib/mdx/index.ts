import type { ComponentType, ElementType } from "react";

/**
 * MDXコンテンツ（FaqSite / HowToSite / ArticleSite / 法務文書）で共有する型とユーティリティ。
 * `vite/mdxPlugin.ts` が `?mdx-component` で生成するコンポーネントの契約と、
 * frontmatter・目次の抽出ロジックをここに集約する（Node側のプラグイン・スクリプトからも使う）。
 */

export type MdxComponents = Record<string, ElementType>;
export type MdxComponent = ComponentType<{ components?: MdxComponents }>;

export type MdxTocItem = { id: string; text: string };

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

function normalizeNewlines(source: string): string {
  return source.replace(/\r\n/g, "\n");
}

/** frontmatterのYAML部分（`---`フェンスの内側）を取り出す。なければundefined */
export function extractFrontmatterSource(source: string): string | undefined {
  return normalizeNewlines(source).match(FRONTMATTER_RE)?.[1];
}

/** frontmatterフェンスを除いた本文を返す */
export function stripFrontmatter(source: string): string {
  return normalizeNewlines(source).replace(FRONTMATTER_RE, "");
}

/**
 * MDXソースのH2行から目次を生成する。
 * 描画側の見出しid（`toHeadingId`）と同じ規則でidを振る。
 */
export function extractMdxToc(source: string): MdxTocItem[] {
  return [...stripFrontmatter(source).matchAll(/^##\s+(.+)$/gm)].map((match) => {
    const text = match[1].trim();
    return { id: toHeadingId(text), text };
  });
}

export function toHeadingId(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");

  return normalized || "section";
}
