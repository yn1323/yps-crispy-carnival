import { describe, expect, it } from "vitest";
import { createRecruitmentSchema } from "./index";

describe("createRecruitmentSchema", () => {
  const validData = {
    periodStart: "2026-04-01",
    periodEnd: "2026-04-30",
    deadline: "2026-03-25",
  };

  it("有効なデータを受け入れる", () => {
    const result = createRecruitmentSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("開始日が空の場合エラー", () => {
    const result = createRecruitmentSchema.safeParse({ ...validData, periodStart: "" });
    expect(result.success).toBe(false);
  });

  it("終了日が空の場合エラー", () => {
    const result = createRecruitmentSchema.safeParse({ ...validData, periodEnd: "" });
    expect(result.success).toBe(false);
  });

  it("締切日が空の場合エラー", () => {
    const result = createRecruitmentSchema.safeParse({ ...validData, deadline: "" });
    expect(result.success).toBe(false);
  });

  it("終了日が開始日と同じ場合は有効", () => {
    const result = createRecruitmentSchema.safeParse({
      ...validData,
      periodStart: "2026-04-01",
      periodEnd: "2026-04-01",
    });
    expect(result.success).toBe(true);
  });

  it("終了日が開始日より前の場合エラー", () => {
    const result = createRecruitmentSchema.safeParse({
      ...validData,
      periodStart: "2026-04-30",
      periodEnd: "2026-04-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const error = result.error.issues.find((i) => i.path.includes("periodEnd"));
      expect(error?.message).toBe("終了日は開始日以降にしてください");
    }
  });

  it("締切日が開始日より前なら有効", () => {
    const result = createRecruitmentSchema.safeParse({
      ...validData,
      periodStart: "2026-04-01",
      deadline: "2026-03-31",
    });
    expect(result.success).toBe(true);
  });

  it("締切日が開始日と同じ場合エラー", () => {
    const result = createRecruitmentSchema.safeParse({
      ...validData,
      periodStart: "2026-04-01",
      deadline: "2026-04-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const error = result.error.issues.find((i) => i.path.includes("deadline"));
      expect(error?.message).toBe("締切日は開始日より前にしてください");
    }
  });

  it("締切日が開始日より後の場合エラー", () => {
    const result = createRecruitmentSchema.safeParse({
      ...validData,
      periodStart: "2026-04-01",
      deadline: "2026-04-15",
    });
    expect(result.success).toBe(false);
  });
});
