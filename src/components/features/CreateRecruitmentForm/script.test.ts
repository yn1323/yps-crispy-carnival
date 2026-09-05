import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { RECRUITMENT_PERIOD_DAYS_MAX } from "@/convex/constants";
import {
  buildRecruitmentComparison,
  createRecruitmentFormSchema,
  createRecruitmentSchema,
  deriveShopClosedDatesFromRegularDays,
  getCalendarMonthCount,
  getDeadlineStepValidationError,
  getHolidaySummary,
  getPeriodSelectionMaxDate,
  getPeriodStepValidationError,
  preserveEditedClosedDates,
} from "./script";

describe("募集条件の変更前後", () => {
  const previous = {
    periodStart: "2026-06-01",
    periodEnd: "2026-06-14",
    deadline: "2026-05-31",
    shopClosedDates: ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"],
  };

  it("定休日の4日目以降の変更も省略せず表示し、変更した項目だけを区別する", () => {
    const comparison = buildRecruitmentComparison(previous, {
      ...previous,
      shopClosedDates: ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-05"],
    });
    expect(comparison.map((row) => row.changed)).toEqual([false, true, false]);
    expect(comparison[1]).toMatchObject({
      before: "6/1(月), 2(火), 3(水), 4(木)",
      after: "6/1(月), 2(火), 3(水), 5(金)",
    });
  });

  it("定休日の並び順だけが違う場合は変更扱いにしない", () => {
    const comparison = buildRecruitmentComparison(previous, {
      ...previous,
      shopClosedDates: [...previous.shopClosedDates].reverse(),
    });
    expect(comparison.every((row) => !row.changed && row.before === row.after)).toBe(true);
  });
});

describe("編集時の定休日", () => {
  const previous = { periodStart: "2026-06-01", periodEnd: "2026-06-07", shopClosedDates: ["2026-06-03"] };

  it("既存期間の臨時休業と通常営業日の例外を維持し、延長した日の曜日設定だけを初期選択する", () => {
    expect(preserveEditedClosedDates(previous, "2026-06-01", "2026-06-14", ["mon"])).toEqual([
      "2026-06-03",
      "2026-06-08",
    ]);
  });

  it("縮小で範囲外になった定休日を除く", () => {
    expect(preserveEditedClosedDates(previous, "2026-06-04", "2026-06-07", ["mon"])).toEqual([]);
  });
});

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

describe("募集作成ステップの表示値と入力判定", () => {
  it("表示月数と休業日の要約をフォーム用に組み立てる", () => {
    expect(getCalendarMonthCount("2026-06-01", "2026-06-30")).toBe(1);
    expect(getCalendarMonthCount("2026-06-30", "2026-07-01")).toBe(2);
    expect(getHolidaySummary([])).toEqual({ value: "なし" });
    expect(getHolidaySummary(["2026-06-04", "2026-06-01", "2026-06-03", "2026-06-02"])).toEqual({
      value: "4日",
      detail: "6/1(月), 2(火), 3(水) ほか1日",
    });
  });

  it.each([
    ["2026-05-01", "2026-08-31"],
    ["2027-11-30", "2028-02-29"],
  ])("%s を基準に3か月先の月末まで選択可能にする", (today, expected) => {
    expect(getPeriodSelectionMaxDate(today)).toBe(expected);
  });

  it("期間ステップでは最初に直す入力を返す", () => {
    expect(getPeriodStepValidationError({ periodStart: "", periodEnd: "", today: "2026-06-01" })).toEqual({
      field: "periodStart",
      message: "開始日を選択してください",
    });
    expect(getPeriodStepValidationError({ periodStart: "2026-06-02", periodEnd: "", today: "2026-06-01" })).toEqual({
      field: "periodEnd",
      message: "終了日を選択してください",
    });
    expect(
      getPeriodStepValidationError({ periodStart: "2026-06-02", periodEnd: "2026-06-03", today: "2026-06-01" }),
    ).toBeUndefined();
    expect(
      getPeriodStepValidationError({ periodStart: "2026-06-02", periodEnd: "2026-07-02", today: "2026-06-01" }),
    ).toBeUndefined();
    expect(
      getPeriodStepValidationError({ periodStart: "2026-06-02", periodEnd: "2026-07-03", today: "2026-06-01" }),
    ).toEqual({ field: "periodEnd", message: "募集期間は31日以内にしてください" });
  });

  it("提出期限ステップでは期間開始日より前の日付だけを受け入れる", () => {
    expect(getDeadlineStepValidationError({ deadline: "", periodStart: "2026-06-03", today: "2026-06-01" })).toBe(
      "提出期限を選択してください",
    );
    expect(
      getDeadlineStepValidationError({ deadline: "2026-06-03", periodStart: "2026-06-03", today: "2026-06-01" }),
    ).toBe("提出期限はシフト開始日より前にしてください");
    expect(
      getDeadlineStepValidationError({ deadline: "2026-06-02", periodStart: "2026-06-03", today: "2026-06-01" }),
    ).toBeUndefined();
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

  it("提出期限が空の場合エラー", () => {
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
      expect(result.error.issues.some((issue) => issue.path.includes("periodEnd"))).toBe(true);
    }
  });

  it("提出期限が開始日より前なら有効", () => {
    const result = createRecruitmentSchema.safeParse({
      ...validData,
      periodStart: "2026-04-01",
      deadline: "2026-03-31",
    });
    expect(result.success).toBe(true);
  });

  it("提出期限が開始日と同じ場合エラー", () => {
    const result = createRecruitmentSchema.safeParse({
      ...validData,
      periodStart: "2026-04-01",
      deadline: "2026-04-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("deadline"))).toBe(true);
    }
  });

  it("提出期限が開始日より後の場合エラー", () => {
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

  it("募集期間は31日以内にする", () => {
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
      expect(invalid.error.issues.some((issue) => issue.message === "募集期間は31日以内にしてください")).toBe(true);
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

  it("提出期限が昨日の場合エラー", () => {
    const result = createRecruitmentFormSchema.safeParse({ ...validData, deadline: yesterday });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("deadline"))).toBe(true);
    }
  });

  it("提出期限が今日の場合は有効", () => {
    const result = createRecruitmentFormSchema.safeParse({ ...validData, deadline: today });
    expect(result.success).toBe(true);
  });

  it("開始日が今日の場合エラー", () => {
    const result = createRecruitmentFormSchema.safeParse({ ...validData, periodStart: today, deadline: yesterday });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("periodStart"))).toBe(true);
    }
  });

  it("開始日が明日の場合は有効", () => {
    const result = createRecruitmentFormSchema.safeParse({ ...validData, periodStart: tomorrow, deadline: today });
    expect(result.success).toBe(true);
  });
});
