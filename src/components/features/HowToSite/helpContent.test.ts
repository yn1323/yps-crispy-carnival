import { describe, expect, it } from "vitest";
import { buildHelpArticles, helpArticles, normalizeHelpSearchText, searchHelpArticles } from "./helpContent";

const examplePath = "./content/example-help.mdx";
const ExampleContent = () => null;
const exampleFrontmatter = {
  title: "テスト用ヘルプ",
  description: "テスト用の説明です",
  category: "getting-started",
  keywords: [],
  features: [],
  related: ["missing-help"],
  order: 10,
};

const draftRelatedFrontmatter = {
  ...exampleFrontmatter,
  related: ["draft-help"],
};

describe("HowToヘルプ記事", () => {
  it("MDXからヘルプとfrontmatterを読み込む", () => {
    expect(helpArticles.length).toBeGreaterThan(0);
    expect(new Set(helpArticles.map((article) => article.slug)).size).toBe(helpArticles.length);
    expect(helpArticles.every((article) => article.meta.title.length > 0)).toBe(true);
    expect(helpArticles.every((article) => article.searchText.length > 0)).toBe(true);
  });

  it("下書きヘルプへの関連記事参照を公開対象から除外する", () => {
    const [article] = buildHelpArticles(
      { [examplePath]: ExampleContent },
      { [examplePath]: draftRelatedFrontmatter },
      { [examplePath]: "テスト用の本文です。" },
      new Set(["draft-help"]),
    );

    expect(article.meta.related).toEqual([]);
  });

  it("公開記事にも下書きにも存在しない関連記事は拒否する", () => {
    expect(() =>
      buildHelpArticles(
        { [examplePath]: ExampleContent },
        { [examplePath]: exampleFrontmatter },
        { [examplePath]: "テスト用の本文です。" },
      ),
    ).toThrow("関連記事「missing-help」が見つかりません");
  });

  it("タイトル、本文、keywordsの言い換えから検索できる", () => {
    expect(searchHelpArticles(helpArticles, "スタッフを追加").map((article) => article.slug)).toContain("add-staff");
    expect(searchHelpArticles(helpArticles, "前日 17:00").map((article) => article.slug)).toEqual([
      "create-recruitment-effects",
      "automatic-reminder",
    ]);
    expect(searchHelpArticles(helpArticles, "メッセージ 来ない").map((article) => article.slug)).toEqual([
      "line-notification-not-delivered",
    ]);
    expect(searchHelpArticles(helpArticles, "未提出 ドラッグ").map((article) => article.slug)).toEqual([
      "input-work-time",
    ]);
  });

  it("全角半角と空白の違いを正規化する", () => {
    expect(normalizeHelpSearchText(" ＬＩＮＥ   通知 ")).toBe("line 通知");
  });

  it("空の検索語ではすべて返す", () => {
    expect(searchHelpArticles(helpArticles, "　 ")).toBe(helpArticles);
  });
});
