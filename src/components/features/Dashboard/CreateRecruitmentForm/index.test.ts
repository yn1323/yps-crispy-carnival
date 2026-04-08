import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { createRecruitmentFormSchema, createRecruitmentSchema } from "./index";

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

describe("createRecruitmentFormSchema (フォームバリデーション)", () => {
  const today = dayjs().format("YYYY-MM-DD");
  const tomorrow = dayjs().add(1, "day").format("YYYY-MM-DD");
  const yesterday = dayjs().subtract(1, "day").format("YYYY-MM-DD");
  const dayAfterTomorrow = dayjs().add(2, "day").format("YYYY-MM-DD");

  const validData = {
    periodStart: dayAfterTomorrow,
    periodEnd: dayjs().add(10, "day").format("YYYY-MM-DD"),
    deadline: tomorrow,
  };

  it("有効なデータを受け入れる", () => {
    const result = createRecruitmentFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("締切日が昨日の場合エラー", () => {
    const result = createRecruitmentFormSchema.safeParse({ ...validData, deadline: yesterday });
    expect(result.success).toBe(false);
    if (!result.success) {
      const error = result.error.issues.find((i) => i.path.includes("deadline"));
      expect(error?.message).toBe("締切日は今日以降にしてください");
    }
  });

  it("締切日が今日の場合は有効", () => {
    const result = createRecruitmentFormSchema.safeParse({ ...validData, deadline: today });
    expect(result.success).toBe(true);
  });

  it("開始日が今日の場合エラー", () => {
    const result = createRecruitmentFormSchema.safeParse({ ...validData, periodStart: today, deadline: yesterday });
    expect(result.success).toBe(false);
    if (!result.success) {
      const error = result.error.issues.find((i) => i.path.includes("periodStart"));
      expect(error?.message).toBe("開始日は明日以降にしてください");
    }
  });

  it("開始日が明日の場合は有効", () => {
    const result = createRecruitmentFormSchema.safeParse({ ...validData, periodStart: tomorrow, deadline: today });
    expect(result.success).toBe(true);
  });
});
