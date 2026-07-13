import { describe, expect, it } from "vitest";
import { helpArticles, normalizeHelpSearchText, searchHelpArticles } from "./helpContent";

describe("HowToヘルプ記事", () => {
  it("MDXからヘルプとfrontmatterを読み込む", () => {
    expect(helpArticles.length).toBeGreaterThan(0);
    expect(new Set(helpArticles.map((article) => article.slug)).size).toBe(helpArticles.length);
    expect(helpArticles.every((article) => article.meta.title.length > 0)).toBe(true);
    expect(helpArticles.every((article) => article.searchText.length > 0)).toBe(true);
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
