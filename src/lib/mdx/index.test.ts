import { describe, expect, it } from "vitest";
import { extractFrontmatterSource, extractMdxToc, stripFrontmatter, toHeadingId } from "./index";

const textModules = import.meta.glob<string[]>("./test-content/*.mdx", {
  eager: true,
  query: "?mdx-text",
  import: "default",
});

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
});
