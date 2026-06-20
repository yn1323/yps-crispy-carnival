import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { RECRUITMENT_PERIOD_DAYS_MAX } from "@/convex/constants";
import { createRecruitmentFormSchema, createRecruitmentSchema, deriveShopClosedDatesFromRegularDays } from "./index";

describe("deriveShopClosedDatesFromRegularDays", () => {
  it("期間内の定休日曜日を日付リストに展開する", () => {
    expect(deriveShopClosedDatesFromRegularDays("2026-06-01", "2026-06-14", ["mon", "wed"])).toEqual([
      "2026-06-01",
      "2026-06-03",
      "2026-06-08",
      "2026-06-10",
    ]);
  });

  it("定休日未設定や不正な期間では空配列を返す", () => {
    expect(deriveShopClosedDatesFromRegularDays("2026-06-01", "2026-06-07", [])).toEqual([]);
    expect(deriveShopClosedDatesFromRegularDays("2026-06-07", "2026-06-01", ["mon"])).toEqual([]);
  });
});

describe("createRecruitmentSchema", () => {
  const validData = {
    periodStart: "2026-04-01",
    periodEnd: "2026-04-30",
    deadline: "2026-03-25",
    shopClosedDates: [],
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

  it("日付は実在するYYYY-MM-DDだけ受け入れる", () => {
    expect(createRecruitmentSchema.safeParse({ ...validData, periodStart: "2026/04/01" }).success).toBe(false);
    expect(createRecruitmentSchema.safeParse({ ...validData, periodEnd: "2026-02-31" }).success).toBe(false);
    expect(createRecruitmentSchema.safeParse({ ...validData, deadline: "2026-13-01" }).success).toBe(false);
  });

  it("募集期間は62日以内にする", () => {
    const valid = createRecruitmentSchema.safeParse({
      ...validData,
      periodStart: "2026-04-01",
      periodEnd: dayjs("2026-04-01")
        .add(RECRUITMENT_PERIOD_DAYS_MAX - 1, "day")
        .format("YYYY-MM-DD"),
      deadline: "2026-03-31",
    });
    expect(valid.success).toBe(true);

    const invalid = createRecruitmentSchema.safeParse({
      ...validData,
      periodStart: "2026-04-01",
      periodEnd: dayjs("2026-04-01").add(RECRUITMENT_PERIOD_DAYS_MAX, "day").format("YYYY-MM-DD"),
      deadline: "2026-03-31",
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues.some((issue) => issue.message === "募集期間は62日以内にしてください")).toBe(true);
    }
  });

  it("定休日の日付形式と件数を検証する", () => {
    expect(
      createRecruitmentSchema.safeParse({ ...validData, shopClosedDates: ["2026-04-01", "2026-04-02"] }).success,
    ).toBe(true);
    expect(createRecruitmentSchema.safeParse({ ...validData, shopClosedDates: ["2026-02-31"] }).success).toBe(false);
    expect(
      createRecruitmentSchema.safeParse({
        ...validData,
        shopClosedDates: Array.from({ length: RECRUITMENT_PERIOD_DAYS_MAX + 1 }, (_, index) =>
          dayjs("2026-04-01").add(index, "day").format("YYYY-MM-DD"),
        ),
      }).success,
    ).toBe(false);
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
    shopClosedDates: [],
  };

  it("お店のお休みを含むデータを受け入れる", () => {
    const result = createRecruitmentFormSchema.safeParse({
      ...validData,
      shopClosedDates: [dayjs().add(4, "day").format("YYYY-MM-DD")],
    });
    expect(result.success).toBe(true);
  });

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
