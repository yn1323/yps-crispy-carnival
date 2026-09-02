import type { ComponentType, ElementType } from "react";

/**
 * MDXコンテンツ（HelpCenter / ArticleSite / 法務文書）で共有する型とユーティリティ。
 * `vite/mdxPlugin.ts` が `?mdx-component` で生成するコンポーネントの契約と、
 * frontmatter・目次の抽出ロジックをここに集約する（Node側のプラグイン・スクリプトからも使う）。
 */

export type MdxComponents = Record<string, ElementType>;
export type MdxComponent = ComponentType<{ components?: MdxComponents }>;

export type MdxTocItem = { id: string; text: string };

export function mdxSlugFromPath(path: string): string {
  return path.match(/\/([^/]+)\.mdx$/)?.[1] ?? path;
}

export function getUnderscorePrefixedMdxSlugs(paths: Iterable<string>): Set<string> {
  const slugs = new Set<string>();

  for (const path of paths) {
    const fileSlug = mdxSlugFromPath(path);
    if (!fileSlug.startsWith("_")) continue;

    const publishedSlug = fileSlug.replace(/^_+/, "");
    if (publishedSlug) slugs.add(publishedSlug);
  }

  return slugs;
}

export function createMdxImageSrcResolver(
  documentPath: string | undefined,
  imageModules: Readonly<Record<string, string>>,
): (src: string) => string {
  return (src) => resolveMdxImageSrc(src, documentPath, imageModules);
}

export function createMdxVideoSrcResolver(
  documentPath: string | undefined,
  videoModules: Readonly<Record<string, string>>,
): (src: string) => string {
  return (src) => resolveMdxVideoSrc(src, documentPath, videoModules);
}

export function resolveMdxImageSrc(
  src: string,
  documentPath: string | undefined,
  imageModules: Readonly<Record<string, string>>,
): string {
  return resolveMdxAssetSrc(src, documentPath, imageModules, "画像");
}

export function resolveMdxVideoSrc(
  src: string,
  documentPath: string | undefined,
  videoModules: Readonly<Record<string, string>>,
): string {
  return resolveMdxAssetSrc(src, documentPath, videoModules, "動画");
}

function resolveMdxAssetSrc(
  src: string,
  documentPath: string | undefined,
  assetModules: Readonly<Record<string, string>>,
  assetName: "画像" | "動画",
): string {
  if (/^(https?:)?\/\//.test(src) || /^(data|blob):/.test(src) || src.startsWith("/")) {
    return src;
  }

  if (!documentPath) {
    return src;
  }

  const documentDirectory = documentPath.replace(/\/[^/]*$/, "");
  const normalizedPath = normalizeMdxContentPath(`${documentDirectory}/${src}`);
  const resolved = assetModules[normalizedPath];
  if (!resolved) {
    throw new Error(`MDX「${documentPath}」の${assetName}「${src}」が見つかりません`);
  }
  return resolved;
}

function normalizeMdxContentPath(path: string): string {
  const segments: string[] = [];

  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return `./${segments.join("/")}`;
}

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
