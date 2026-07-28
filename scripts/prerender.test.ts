import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { routeToOutputPath } from "./prerender";

describe("routeToOutputPath", () => {
  it("writes the root route to dist/index.html", () => {
    expect(routeToOutputPath("/")).toBe(join("dist", "index.html"));
  });

  // ディレクトリ index (dist/features/index.html) にすると Cloudflare Pages が
  // /features → /features/ へ 308 リダイレクトし、sitemap.xml / canonical が指す
  // 末尾スラッシュなしのURLと食い違う。フラットな .html で出力すること。
  it("writes non-root routes as flat .html files, not directory indexes", () => {
    expect(routeToOutputPath("/features")).toBe(join("dist", "features.html"));
    expect(routeToOutputPath("/articles")).toBe(join("dist", "articles.html"));
  });

  it("keeps nested routes nested", () => {
    expect(routeToOutputPath("/demo/shiftboard")).toBe(join("dist", "demo", "shiftboard.html"));
    expect(routeToOutputPath("/articles/excel-shift-management-limits")).toBe(
      join("dist", "articles", "excel-shift-management-limits.html"),
    );
    expect(routeToOutputPath("/articles/categories/tool-review")).toBe(
      join("dist", "articles", "categories", "tool-review.html"),
    );
  });

  // /articles (一覧) と /articles/:slug (詳細) は dist/articles.html と
  // dist/articles/*.html に分かれるため、互いを上書きしない。
  it("does not collide between a list route and its child routes", () => {
    const listPath = routeToOutputPath("/articles");
    const childPath = routeToOutputPath("/articles/fair-shift-scheduling");

    expect(listPath).not.toBe(childPath);
    expect(childPath.startsWith(`${join("dist", "articles")}${sep}`)).toBe(true);
  });
});
