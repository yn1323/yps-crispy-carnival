import { describe, expect, it } from "vitest";
import { buildShiftExportPageHead } from "./meta";

describe("シフト表出力のmetadata", () => {
  it("帳票ページを検索対象から除外し、遷移先へreferrerを渡さない", () => {
    const { meta } = buildShiftExportPageHead();

    expect(meta.filter((entry) => entry.name === "robots")).toEqual([{ name: "robots", content: "noindex, nofollow" }]);
    expect(meta.filter((entry) => entry.name === "referrer")).toEqual([{ name: "referrer", content: "no-referrer" }]);
  });
});
