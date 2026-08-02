import { describe, expect, it } from "vitest";
import { toAuditRequestKey } from "./auditCorrelation";

describe("toAuditRequestKey", () => {
  it("同じ入力を監査へ保存可能な同じ固定長キーへ変換する", async () => {
    const sensitive = "manager@example.com:secret-invitation-token";

    const first = await toAuditRequestKey(sensitive);
    const second = await toAuditRequestKey(sensitive);

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain("manager@example.com");
    expect(first).not.toContain("secret-invitation-token");
  });

  it("短すぎる入力と長すぎる入力を拒否する", async () => {
    await expect(toAuditRequestKey("short")).rejects.toThrow("入力内容を確認してください。");
    await expect(toAuditRequestKey("a".repeat(101))).rejects.toThrow("入力内容を確認してください。");
  });
});
