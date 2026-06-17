import type { WindowLike } from "dompurify";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { sanitizeDashboardAnnouncementHtml } from "./sanitizeAnnouncementHtml";

function sanitize(html: string) {
  const dom = new JSDOM("");
  try {
    return sanitizeDashboardAnnouncementHtml(html, dom.window as unknown as WindowLike);
  } finally {
    dom.window.close();
  }
}

function parse(html: string) {
  return new JSDOM(html).window.document;
}

describe("sanitizeDashboardAnnouncementHtml", () => {
  it("許可した本文タグと安全なリンクだけを残す", () => {
    const cleaned = sanitize(
      '<p><strong>重要</strong>なお知らせです。</p><ul><li>メールを確認してください</li></ul><a href="/dashboard">Dashboard</a>',
    );
    const document = parse(cleaned);

    expect(document.querySelector("strong")?.textContent).toBe("重要");
    expect(document.querySelector("li")?.textContent).toBe("メールを確認してください");
    const anchor = document.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("/dashboard");
    expect(anchor?.getAttribute("target")).toBe("_blank");
    expect(anchor?.getAttribute("rel")).toBe("noreferrer");
  });

  it("script/style/event属性と危険なURLを取り除く", () => {
    const cleaned = sanitize(
      '<p style="color:red" onclick="alert(1)">本文</p><script>alert(1)</script><iframe src="https://example.com"></iframe><img src="/x.png"><a href="javascript:alert(1)">危険</a>',
    );
    const document = parse(cleaned);

    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("p")?.getAttribute("style")).toBeNull();
    expect(document.querySelector("p")?.getAttribute("onclick")).toBeNull();
    expect(document.querySelector("a")?.hasAttribute("href")).toBe(false);
  });
});
