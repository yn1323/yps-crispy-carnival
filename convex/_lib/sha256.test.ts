import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256";

describe("sha256Hex", () => {
  it("UTF-8文字列を64文字の小文字hexへ変換する", async () => {
    await expect(sha256Hex("test")).resolves.toBe("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08");
  });

  it("空文字列も同じ出力契約で変換する", async () => {
    await expect(sha256Hex("")).resolves.toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});
