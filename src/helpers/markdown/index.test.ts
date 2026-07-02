import { describe, expect, it } from "vitest";
import { parseMarkdownBlocks, parseMarkdownDocument, splitList } from ".";

describe("parseMarkdownDocument", () => {
  it("frontmatter と本文を分離できる", () => {
    const source = `---
title: "タイトル"
lastUpdated: 2026年5月9日
---

本文です。`;

    expect(parseMarkdownDocument(source, "doc")).toEqual({
      frontmatter: { title: "タイトル", lastUpdated: "2026年5月9日" },
      bodySource: "\n本文です。",
    });
  });

  it("frontmatter がない場合はエラーにする", () => {
    expect(() => parseMarkdownDocument("# 本文だけ", "broken")).toThrow("frontmatter");
  });
});

describe("parseMarkdownBlocks", () => {
  it("見出し・段落・リストをブロックに変換できる", () => {
    const blocks = parseMarkdownBlocks(`## 1. サービス内容

本サービスはシフト管理を支援します。

### 補足

- 項目A
- 項目B

1. 手順1
2. 手順2
`);

    expect(blocks).toEqual([
      { type: "heading", level: 2, text: "1. サービス内容", id: "1-サービス内容" },
      { type: "paragraph", text: "本サービスはシフト管理を支援します。" },
      { type: "heading", level: 3, text: "補足", id: "補足" },
      { type: "unorderedList", items: ["項目A", "項目B"] },
      { type: "orderedList", items: ["手順1", "手順2"] },
    ]);
  });

  it("resolveImageSrc で画像パスを解決できる", () => {
    const blocks = parseMarkdownBlocks("![サンプル](./image.png)", {
      resolveImageSrc: (src) => src.replace("./", "/resolved/"),
    });

    expect(blocks).toEqual([
      {
        type: "image",
        image: { src: "/resolved/image.png", alt: "サンプル", caption: undefined, width: undefined, align: "center" },
      },
    ]);
  });
});

describe("splitList", () => {
  it("カンマ・読点区切りの値を配列にできる", () => {
    expect(splitList('"a", b、c')).toEqual(["a", "b", "c"]);
    expect(splitList(undefined)).toEqual([]);
  });
});
