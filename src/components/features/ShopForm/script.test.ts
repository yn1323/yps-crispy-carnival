import { describe, expect, it } from "vitest";
import {
  buildShopFormSubmission,
  getInitialStep,
  getNextStep,
  getPreviousStep,
  type ShiftSubmissionPattern,
} from "./script";

const DATE_ONLY_PATTERN: ShiftSubmissionPattern = { kind: "dateOnly" };
const TIME_PATTERN: ShiftSubmissionPattern = { kind: "time", startTime: "09:00", endTime: "22:00" };

describe("店舗フォームのステップ遷移", () => {
  it("日ごとの場合は勤務時間設定を通らない", () => {
    expect(getInitialStep("patternSettings", DATE_ONLY_PATTERN)).toBe("regularClosedDays");
    expect(getNextStep("submissionPattern", DATE_ONLY_PATTERN)).toBe("regularClosedDays");
    expect(getPreviousStep("regularClosedDays", DATE_ONLY_PATTERN)).toBe("submissionPattern");
  });

  it("時間指定の場合は勤務時間設定を通る", () => {
    expect(getInitialStep("patternSettings", TIME_PATTERN)).toBe("patternSettings");
    expect(getNextStep("submissionPattern", TIME_PATTERN)).toBe("patternSettings");
    expect(getPreviousStep("regularClosedDays", TIME_PATTERN)).toBe("patternSettings");
  });
});

describe("店舗フォームの送信データ", () => {
  it("定休日を曜日順、勤務区分を表示順に正規化する", () => {
    expect(
      buildShopFormSubmission(
        {
          shopName: "居酒屋たなか",
          regularClosedDays: [],
          submissionPattern: {
            kind: "shiftType",
            options: [
              { id: "late", name: "遅番", startTime: "18:00", endTime: "22:00", sortOrder: 8 },
              { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 3 },
            ],
          },
        },
        ["fri", "sun", "tue"],
      ),
    ).toEqual({
      shopName: "居酒屋たなか",
      regularClosedDays: ["sun", "tue", "fri"],
      submissionPattern: {
        kind: "shiftType",
        options: [
          { id: "late", name: "遅番", startTime: "18:00", endTime: "22:00", sortOrder: 0 },
          { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 1 },
        ],
      },
    });
  });
});
