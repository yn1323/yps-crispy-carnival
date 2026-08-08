import { describe, expect, it } from "vitest";
import { safeAnalyticsErrorCode } from "./observability";

describe("Analytics safe error codes", () => {
  it.each([
    "analytics_audit_event_key_invalid",
    "analytics_daily_service_already_initialized",
    "analytics_daily_service_missing",
    "analytics_daily_shop_incomplete",
    "analytics_invariant_accumulator_invalid",
    "analytics_invariant_accumulator_missing",
    "analytics_opportunity_redaction_incomplete",
  ])("%sを修復可能な固定codeとして保持する", (code) => {
    expect(safeAnalyticsErrorCode(new Error(`wrapped: ${code}`))).toBe(code);
  });

  it("任意のerror本文を固定codeへ置き換える", () => {
    expect(safeAnalyticsErrorCode(new Error("staff@example.com: provider raw error"))).toBe("analytics_unexpected");
  });
});
