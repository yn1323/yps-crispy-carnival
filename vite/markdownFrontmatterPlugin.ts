import { readFile } from "node:fs/promises";
import type { Plugin } from "vite";

/**
 * `*.md?frontmatter` のインポートを、frontmatter だけを含む擬似 md ソース文字列に変換する Vite プラグイン。
 *
 * 記事本文（Markdown body）はサイズが大きく、`?raw` で eager import すると
 * ルートの `head()` や LP の記事プレビューが参照するメタデータモジュール経由で
 * エントリーチャンクに焼き込まれてしまう。frontmatter（数百バイト）だけを返すことで、
 * メタデータ専用モジュールに本文をバンドルさせない。
 *
 * 返す文字列は `---\n{frontmatter}\n---\n` 形式なので、実行時に既存の
 * `parseMarkdownDocument`（body 空扱い）でそのままパースでき、解析ロジックを二重化しない。
 */
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

export function markdownFrontmatterPlugin(): Plugin {
  return {
    name: "markdown-frontmatter",
    enforce: "pre",
    async load(id) {
      const [filepath, query] = id.split("?");
      if (!query || !filepath.endsWith(".md")) return null;
      if (!new URLSearchParams(query).has("frontmatter")) return null;

      const source = (await readFile(filepath, "utf-8")).replace(/\r\n/g, "\n");
      const match = source.match(FRONTMATTER_RE);
      const frontmatter = match?.[1] ?? "";
      const stub = `---\n${frontmatter}\n---\n`;
      return `export default ${JSON.stringify(stub)};`;
    },
  };
}
