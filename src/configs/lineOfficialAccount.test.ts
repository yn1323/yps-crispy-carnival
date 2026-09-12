import { describe, expect, it } from "vitest";
import { getLineOfficialAccountUrl } from "./lineOfficialAccount";

describe("公式アカウントのリンク先", () => {
  it.each([undefined, "", "  "])("未設定値 %s を本番URLで代用しない", (value) => {
    expect(getLineOfficialAccountUrl(value)).toBeUndefined();
  });

  it.each(["https://lin.ee/develop-test", "https://lin.ee/production-test", "https://line.me/R/ti/p/@shiftori-test"])(
    "環境ごとの友だち追加URLをそのまま利用する: %s",
    (url) => {
      expect(getLineOfficialAccountUrl(` ${url} `)).toBe(url);
    },
  );

  it.each([
    "not-a-url",
    "javascript:alert(1)",
    "http://lin.ee/test",
    "https://example.com/test",
    "https://lin.ee.example.com/test",
    "https://user:password@lin.ee/test",
    "https://lin.ee:8443/test",
    "https://lin.ee/",
  ])("不正なリンク先を拒否する: %s", (url) => {
    expect(() => getLineOfficialAccountUrl(url)).toThrow();
  });
});
