import { describe, expect, it } from "vitest";
import { assertNoLoopbackUrls, normalizePrerenderedHtml } from "./prerenderHtml";

describe("prerender HTML", () => {
  it("一時サーバーの絶対URLをデプロイ先と同一originのURLへ戻す", () => {
    const html = [
      '<link rel="modulepreload" href="http://127.0.0.1:36673/assets/root.js">',
      '<script src="http://127.0.0.1:36673/assets/index.js"></script>',
    ].join("");

    expect(normalizePrerenderedHtml(html, "http://127.0.0.1:36673")).toBe(
      '<link rel="modulepreload" href="/assets/root.js"><script src="/assets/index.js"></script>',
    );
  });

  it("相対URLと外部サービスのURLは変更しない", () => {
    const html = [
      '<script src="/assets/index.js"></script>',
      '<script src="https://www.googletagmanager.com/gtm.js"></script>',
    ].join("");

    expect(normalizePrerenderedHtml(html, "http://127.0.0.1:36673")).toBe(html);
  });

  it.each(["http://localhost:3000/app.js", "http://127.0.0.2/app.js", "http://[::1]:3000/app.js"])(
    "loopback URL %s が残っていたら拒否する",
    (url) => {
      expect(() => assertNoLoopbackUrls("/", `<script src="${url}"></script>`)).toThrow(
        `[prerender] / contains a loopback URL (${url})`,
      );
    },
  );
});
