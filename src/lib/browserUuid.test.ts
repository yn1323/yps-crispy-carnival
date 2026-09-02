import { describe, expect, it, vi } from "vitest";
import { BrowserCryptoUnavailableError, createBrowserUuid } from "./browserUuid";

describe("createBrowserUuid", () => {
  it("randomUUIDが利用できる場合はその結果を使う", () => {
    const randomUUID = vi.fn(() => "2db43ef9-c4bd-405f-aab1-f695bf7e9990");

    expect(createBrowserUuid({ randomUUID })).toBe("2db43ef9-c4bd-405f-aab1-f695bf7e9990");
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("randomUUIDがない場合はgetRandomValuesからRFC 4122 version 4形式を作る", () => {
    const getRandomValues = vi.fn((values: Uint8Array) => {
      values.set([0, 1, 2, 3, 4, 5, 255, 7, 255, 9, 10, 11, 12, 13, 14, 15]);
      return values;
    });

    expect(createBrowserUuid({ getRandomValues })).toBe("00010203-0405-4f07-bf09-0a0b0c0d0e0f");
    expect(getRandomValues).toHaveBeenCalledOnce();
  });

  it("Web Cryptoが利用できない場合は型付きerrorにする", () => {
    expect(() => createBrowserUuid(null)).toThrow(BrowserCryptoUnavailableError);
    expect(() => createBrowserUuid({})).toThrowError(expect.objectContaining({ code: "browser_crypto_unavailable" }));
  });
});
