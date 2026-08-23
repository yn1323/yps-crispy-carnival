import { describe, expect, it } from "vitest";
import {
  createMdxImageSrcResolver,
  extractFrontmatterSource,
  extractMdxToc,
  getUnderscorePrefixedMdxSlugs,
  mdxSlugFromPath,
  stripFrontmatter,
  toHeadingId,
} from "./index";

const textModules = import.meta.glob<string[]>("./test-content/*.mdx", {
  eager: true,
  query: "?mdx-text",
  import: "default",
});
const summaryModules = import.meta.glob<string>("./test-content/plain-text.mdx", {
  eager: true,
  query: "?mdx-summary",
  import: "default",
});

// 公開コンテンツが使う、`_` 始まりのMDXを除外するglob。
const publishedTextModules = import.meta.glob<string[]>(["./test-content/*.mdx", "!./test-content/_*.mdx"], {
  eager: true,
  query: "?mdx-text",
  import: "default",
});
const draftMdxSlugs = getUnderscorePrefixedMdxSlugs(Object.keys(import.meta.glob("./test-content/_*.mdx")));

const source = `---
title: "テスト記事"
---

# タイトル

本文の段落です。

## LINEで集めるときに起きやすいこと

### 小見出し

## 今日からできること
`;

describe("extractFrontmatterSource", () => {
  it("frontmatterのYAML部分を取り出せる", () => {
    expect(extractFrontmatterSource(source)).toBe('title: "テスト記事"');
  });

  it("CRLFを正規化して取り出せる", () => {
    expect(extractFrontmatterSource('---\r\ntitle: "a"\r\n---\r\n本文')).toBe('title: "a"');
  });

  it("frontmatterがなければundefined", () => {
    expect(extractFrontmatterSource("本文だけ")).toBeUndefined();
  });
});

describe("stripFrontmatter", () => {
  it("frontmatterフェンスを除いた本文を返す", () => {
    expect(stripFrontmatter(source)).not.toContain("テスト記事");
    expect(stripFrontmatter(source)).toContain("本文の段落です。");
  });
});

describe("extractMdxToc", () => {
  it("H2行だけから目次を生成する（H1・H3は含めない）", () => {
    expect(extractMdxToc(source)).toEqual([
      { id: "lineで集めるときに起きやすいこと", text: "LINEで集めるときに起きやすいこと" },
      { id: "今日からできること", text: "今日からできること" },
    ]);
  });
});

describe("toHeadingId", () => {
  it("記号を除去し、小文字化して生成する", () => {
    expect(toHeadingId("まとめ｜LINEは「連絡」に")).toBe("まとめlineは連絡に");
    expect(toHeadingId("Step 1 開始")).toBe("step-1-開始");
  });

  it("記号だけの見出しはフォールバックする", () => {
    expect(toHeadingId("!!!")).toBe("section");
  });
});

describe("mdx-text", () => {
  it("表示テキストだけを段落とリスト項目の配列にする", () => {
    expect(textModules["./test-content/plain-text.mdx"]).toEqual([
      "最初の回答とリンクの文言です。",
      "一つ目",
      "二つ目",
    ]);
  });

  it("最初の表示テキストだけをsummaryとして取り出す", () => {
    expect(summaryModules["./test-content/plain-text.mdx"]).toBe("最初の回答とリンクの文言です。");
  });
});

describe("下書きMDXの除外", () => {
  it("`_` 始まりのMDXを読み込まない", () => {
    expect(Object.keys(textModules)).toContain("./test-content/_draft.mdx");
    expect(Object.keys(publishedTextModules)).toEqual(["./test-content/plain-text.mdx"]);
    expect([...draftMdxSlugs]).toEqual(["draft"]);
  });

  it("MDX pathからファイル名由来のslugを取得する", () => {
    expect(mdxSlugFromPath("./content/example-help.mdx")).toBe("example-help");
  });
});

describe("MDX相対画像", () => {
  it("文書からの相対pathをbundled URLへ解決する", () => {
    const resolveImageSrc = createMdxImageSrcResolver("./content/guides/example.mdx", {
      "./content/images/example/figure.webp": "/assets/figure.hash.webp",
    });

    expect(resolveImageSrc("../images/example/figure.webp")).toBe("/assets/figure.hash.webp");
  });

  it.each(["/images/figure.webp", "https://example.com/figure.webp", "data:image/png;base64,abc"])(
    "absolute URL %sは変更しない",
    (src) => {
      const resolveImageSrc = createMdxImageSrcResolver("./content/guides/example.mdx", {});

      expect(resolveImageSrc(src)).toBe(src);
    },
  );

  it("存在しない相対画像pathを拒否する", () => {
    const resolveImageSrc = createMdxImageSrcResolver("./content/guides/example.mdx", {});

    expect(() => resolveImageSrc("../images/example/missing.webp")).toThrow(
      "MDX「./content/guides/example.mdx」の画像「../images/example/missing.webp」が見つかりません",
    );
  });
});
