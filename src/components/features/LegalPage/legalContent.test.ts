import { describe, expect, it } from "vitest";
import { parseLegalDocuments, parseLegalMarkdown } from "./legalContent";

const termsModules = import.meta.glob<string>("../Terms/content/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

const privacyModules = import.meta.glob<string>("../PrivacyPolicy/content/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

const legalMarkdown = `---
title: スタッフ向け利用規約
lastUpdated: 2026年5月9日
---

前文の段落です。

## 1. サービス内容

サービスの説明です。

### 補足

- 注意点A
- 注意点B

## 2. 関連文書

[プライバシーポリシー](/privacy/staff)をご確認ください。
`;

describe("parseLegalMarkdown", () => {
  it("frontmatter と h2 区切りのセクションを読み取れる", () => {
    const content = parseLegalMarkdown(legalMarkdown, "staff.md");

    expect(content.title).toBe("スタッフ向け利用規約");
    expect(content.lastUpdated).toBe("2026年5月9日");
    expect(content.sections.map((section) => section.title)).toEqual([undefined, "1. サービス内容", "2. 関連文書"]);
    expect(content.sections[0]?.blocks).toEqual([{ type: "paragraph", text: "前文の段落です。" }]);
    expect(content.sections[1]?.blocks.map((block) => block.type)).toEqual(["paragraph", "heading", "unorderedList"]);
  });

  it("title がない場合はエラーにする", () => {
    const markdown = legalMarkdown.replace("title: スタッフ向け利用規約\n", "");

    expect(() => parseLegalMarkdown(markdown, "staff.md")).toThrow("title");
  });

  it("lastUpdated がない場合はエラーにする", () => {
    const markdown = legalMarkdown.replace("lastUpdated: 2026年5月9日\n", "");

    expect(() => parseLegalMarkdown(markdown, "staff.md")).toThrow("lastUpdated");
  });
});

describe("parseLegalDocuments", () => {
  it("audience 分のファイルが揃っていない場合はエラーにする", () => {
    expect(() => parseLegalDocuments({ "./content/manager.md": legalMarkdown })).toThrow("staff.md");
  });

  it("利用規約の実ファイルを manager / staff ともに読み込める", () => {
    const documents = parseLegalDocuments(termsModules);

    expect(documents.manager.title).toBe("管理ユーザー向け利用規約");
    expect(documents.staff.title).toBe("スタッフ向け利用規約");
    expect(documents.manager.sections.length).toBeGreaterThanOrEqual(5);
    expect(documents.staff.sections.length).toBeGreaterThanOrEqual(5);
  });

  it("プライバシーポリシーの実ファイルを manager / staff ともに読み込める", () => {
    const documents = parseLegalDocuments(privacyModules);

    expect(documents.manager.title).toBe("管理ユーザー向けプライバシーポリシー");
    expect(documents.staff.title).toBe("スタッフ向けプライバシーポリシー");
    expect(documents.manager.sections.length).toBeGreaterThanOrEqual(5);
    expect(documents.staff.sections.length).toBeGreaterThanOrEqual(5);
  });
});
