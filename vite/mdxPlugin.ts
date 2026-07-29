import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { compile } from "@mdx-js/mdx";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import type { Plugin } from "vite";
import { parse } from "yaml";
import { extractFrontmatterSource, extractMdxToc } from "../src/lib/mdx/index.ts";

/**
 * `*.mdx` をクエリ付きインポートで変換する共有 Vite プラグイン。
 * FaqSite / HowToSite / ArticleSite / 法務文書（Terms, PrivacyPolicy）が利用する。
 *
 * - `?mdx-component`  : MDX本文をReactコンポーネントにコンパイルして返す
 * - `?mdx-source`     : 生ソース文字列を返す（検索テキスト用）
 * - `?mdx-text`       : frontmatterとMDX componentを除いた表示テキストの配列を返す
 * - `?mdx-frontmatter`: frontmatterをYAMLとしてパースしたオブジェクトを返す
 *                       （本文をバンドルに含めないため、メタデータ専用モジュールから使う）
 * - `?mdx-toc`        : H2見出しの目次 `{ id, text }[]` を返す（本文をバンドルに含めない）
 */
const MDX_COMPONENT_PREFIX = "\0mdx-component:";
const MDX_SOURCE_PREFIX = "\0mdx-source:";
const MDX_TEXT_PREFIX = "\0mdx-text:";
const MDX_FRONTMATTER_PREFIX = "\0mdx-frontmatter:";
const MDX_TOC_PREFIX = "\0mdx-toc:";

const QUERY_PREFIXES = {
  "mdx-component": MDX_COMPONENT_PREFIX,
  "mdx-source": MDX_SOURCE_PREFIX,
  "mdx-text": MDX_TEXT_PREFIX,
  "mdx-frontmatter": MDX_FRONTMATTER_PREFIX,
  "mdx-toc": MDX_TOC_PREFIX,
} as const;

export function mdxPlugin(): Plugin {
  return {
    name: "mdx",
    enforce: "pre",
    resolveId(id, importer) {
      const [filepath, query] = id.split("?");
      if (!query || !filepath.endsWith(".mdx")) return null;

      const params = new URLSearchParams(query);
      const prefix = Object.entries(QUERY_PREFIXES).find(([name]) => params.has(name))?.[1];
      if (!prefix) return null;

      const importerPath = importer?.split("?")[0];
      const absolutePath = isAbsolute(filepath)
        ? filepath
        : importerPath
          ? resolve(dirname(importerPath), filepath)
          : resolve(filepath);
      return `${prefix}${encodeURIComponent(absolutePath)}`;
    },
    async load(id) {
      const prefix = getVirtualPrefix(id);
      if (!prefix) return null;

      const filepath = decodeURIComponent(id.slice(prefix.length));
      this.addWatchFile(filepath);
      const source = (await readFile(filepath, "utf-8")).replace(/\r\n/g, "\n");

      if (prefix === MDX_SOURCE_PREFIX) {
        return `export default ${JSON.stringify(source)};`;
      }

      if (prefix === MDX_TEXT_PREFIX) {
        return `export default ${JSON.stringify(await extractMdxTextBlocks(source))};`;
      }

      if (prefix === MDX_FRONTMATTER_PREFIX) {
        const frontmatterSource = extractFrontmatterSource(source);
        const frontmatter = frontmatterSource ? parse(frontmatterSource) : undefined;
        return `export default ${JSON.stringify(frontmatter)};`;
      }

      if (prefix === MDX_TOC_PREFIX) {
        return `export default ${JSON.stringify(extractMdxToc(source))};`;
      }

      const compiled = await compile(
        { value: source, path: filepath },
        { remarkPlugins: [remarkFrontmatter, remarkGfm] },
      );
      return String(compiled.value);
    },
  };
}

type MdxAstNode = {
  type: string;
  value?: unknown;
  alt?: unknown;
  children?: MdxAstNode[];
};

/**
 * FAQの検索と構造化データで使う、画面に表示される文章だけを段落・リスト項目単位で取り出す。
 * JSX componentは図や補助UIなので、属性名や内部実装語を検索・JSON-LDへ混ぜない。
 */
export async function extractMdxTextBlocks(source: string): Promise<string[]> {
  let textBlocks: string[] = [];
  const captureTextBlocks = () => (tree: MdxAstNode) => {
    textBlocks = collectMdxTextBlocks(tree);
  };

  await compile({ value: source }, { remarkPlugins: [remarkFrontmatter, remarkGfm, captureTextBlocks] });

  return textBlocks;
}

function collectMdxTextBlocks(node: MdxAstNode): string[] {
  if (node.type === "paragraph" || node.type === "heading" || node.type === "code") {
    const text = normalizeMdxText(readMdxNodeText(node));
    return text ? [text] : [];
  }

  if (isExcludedMdxNode(node)) return [];

  return node.children?.flatMap(collectMdxTextBlocks) ?? [];
}

function readMdxNodeText(node: MdxAstNode): string {
  if (node.type === "text" || node.type === "inlineCode" || node.type === "code") {
    return typeof node.value === "string" ? node.value : "";
  }
  if (node.type === "image") return typeof node.alt === "string" ? node.alt : "";
  if (node.type === "break") return " ";
  if (isExcludedMdxNode(node)) return "";

  return node.children?.map(readMdxNodeText).join("") ?? "";
}

function isExcludedMdxNode(node: MdxAstNode): boolean {
  return node.type === "yaml" || node.type === "html" || node.type.startsWith("mdx");
}

function normalizeMdxText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getVirtualPrefix(id: string): string | undefined {
  return Object.values(QUERY_PREFIXES).find((prefix) => id.startsWith(prefix));
}
