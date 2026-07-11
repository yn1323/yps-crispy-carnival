import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { compile } from "@mdx-js/mdx";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import type { Plugin } from "vite";
import { parse } from "yaml";

const HELP_COMPONENT_PREFIX = "\0help-mdx-component:";
const HELP_SOURCE_PREFIX = "\0help-mdx-source:";
const HELP_FRONTMATTER_PREFIX = "\0help-mdx-frontmatter:";
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

export function helpMdxPlugin(): Plugin {
  return {
    name: "help-mdx",
    enforce: "pre",
    resolveId(id, importer) {
      const [filepath, query] = id.split("?");
      if (!query || !filepath.endsWith(".mdx")) return null;

      const params = new URLSearchParams(query);
      const prefix = params.has("help-component")
        ? HELP_COMPONENT_PREFIX
        : params.has("help-source")
          ? HELP_SOURCE_PREFIX
          : params.has("help-frontmatter")
            ? HELP_FRONTMATTER_PREFIX
            : undefined;
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

      if (prefix === HELP_SOURCE_PREFIX) {
        return `export default ${JSON.stringify(source)};`;
      }

      if (prefix === HELP_FRONTMATTER_PREFIX) {
        const frontmatterSource = source.match(FRONTMATTER_RE)?.[1];
        const frontmatter = frontmatterSource ? parse(frontmatterSource) : undefined;
        return `export default ${JSON.stringify(frontmatter)};`;
      }

      const compiled = await compile(
        { value: source, path: filepath },
        { remarkPlugins: [remarkFrontmatter, remarkGfm] },
      );
      return String(compiled.value);
    },
  };
}

function getVirtualPrefix(id: string): string | undefined {
  return [HELP_COMPONENT_PREFIX, HELP_SOURCE_PREFIX, HELP_FRONTMATTER_PREFIX].find((prefix) => id.startsWith(prefix));
}
