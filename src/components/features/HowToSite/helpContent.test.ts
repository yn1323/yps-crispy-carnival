import { describe, expect, it } from "vitest";
import { helpArticles, normalizeHelpSearchText, searchHelpArticles } from "./helpContent";

describe("HowToヘルプ記事", () => {
  it("MDXからヘルプとfrontmatterを読み込む", () => {
    expect(helpArticles.map((article) => article.slug)).toEqual([
      "shift-workflow",
      "staff-submission-workflow",
      "submission-pattern-differences",
      "submission-pattern-changes",
      "add-staff",
      "add-staff-during-recruitment",
      "exclude-staff-from-shifts",
      "create-recruitment-effects",
      "check-submission-status",
      "edit-submitted-request",
      "after-submission-deadline",
      "automatic-reminder",
      "build-shift-from-requests",
      "save-shift-draft",
      "assignment-warnings-and-errors",
      "cannot-confirm-shift",
      "confirm-shift-effects",
      "edit-confirmed-shift",
      "notify-confirmed-shift-changes",
      "fix-recruitment-mistake",
      "delete-recruitment",
      "edit-past-shift",
      "submission-link-unavailable",
      "confirmed-shift-link-unavailable",
      "line-notification-not-delivered",
      "resend-failed-notifications",
      "notification-channel",
    ]);
    expect(helpArticles.every((article) => article.meta.title.length > 0)).toBe(true);
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
  });

  it("全角半角と空白の違いを正規化する", () => {
    expect(normalizeHelpSearchText(" ＬＩＮＥ   通知 ")).toBe("line 通知");
  });

  it("空の検索語ではすべて返す", () => {
    expect(searchHelpArticles(helpArticles, "　 ")).toBe(helpArticles);
  });
});
