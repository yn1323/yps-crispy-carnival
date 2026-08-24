import { describe, expect, it } from "vitest";
import {
  organizationEntitlementPlanLabel,
  organizationPaidPlanLabel,
  organizationPlanLabel,
  organizationPlanSentenceLabel,
} from "./planPresentation";

describe("organization plan presentation", () => {
  it("内部IDを利用者向け名称へ変換する", () => {
    expect(organizationPlanLabel("trial")).toBe("トライアル");
    expect(organizationEntitlementPlanLabel("free")).toBe("Free");
    expect(organizationPlanSentenceLabel("free")).toBe("無料プラン");
    expect(organizationPaidPlanLabel("standard")).toBe("Standard");
    expect(organizationPaidPlanLabel("pro")).toBe("Pro");
  });
});
