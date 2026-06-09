import { describe, expect, it } from "vitest";
import { withOpenExternalBrowser } from "./lineUrl";

describe("withOpenExternalBrowser", () => {
  it("クエリなしURLにopenExternalBrowser=1を付与する", () => {
    expect(withOpenExternalBrowser("https://example.com/dashboard")).toBe(
      "https://example.com/dashboard?openExternalBrowser=1",
    );
  });

  it("既存クエリ（トークン等）を保持したまま付与する", () => {
    expect(withOpenExternalBrowser("https://example.com/shifts/view?token=abc-123")).toBe(
      "https://example.com/shifts/view?token=abc-123&openExternalBrowser=1",
    );
  });

  it("既に付与済みの場合は重複させない", () => {
    expect(withOpenExternalBrowser("https://example.com/dashboard?openExternalBrowser=1")).toBe(
      "https://example.com/dashboard?openExternalBrowser=1",
    );
  });
});
