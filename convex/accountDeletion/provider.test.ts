import { describe, expect, it } from "vitest";
import { classifyProviderError } from "./provider";

describe("accountDeletion provider error classification", () => {
  it("HTTP 408を一時的なtimeoutとして再試行する", () => {
    expect(classifyProviderError({ status: 408 })).toMatchObject({
      retryable: true,
      code: "provider_timeout",
    });
  });
});
