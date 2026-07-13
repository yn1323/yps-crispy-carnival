import { describe, expect, it } from "vitest";
import { buildInitialEntries } from "./script";
import type { SubmissionData } from "./types";

const baseData: SubmissionData = {
  shopName: "居酒屋さくら",
  staffName: "田中太郎",
  periodStart: "2026-04-06",
  periodEnd: "2026-04-08",
  deadline: "2026-04-03",
  shopClosedDates: [],
  submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  isBeforeDeadline: true,
  hasSubmitted: false,
  existingRequests: [],
  existingSelection: { kind: "time", requests: [] },
  legalConsentRequired: false,
  legalDocuments: {
    terms: { title: "利用規約", documentVersion: "1", requiredConsentVersion: "1", path: "/terms/staff" },
    privacy: {
      title: "プライバシーポリシー",
      documentVersion: "1",
      requiredConsentVersion: "1",
      path: "/privacy/staff",
    },
  },
  timeRange: { startTime: "09:00", endTime: "22:00" },
  previousWeeklyPattern: null,
  previousDateOnlyPattern: null,
};

describe("buildInitialEntries", () => {
  it("日ごとの既存選択を初期値へ変換し、定休日は休みに戻す", () => {
    const result = buildInitialEntries(["2026-04-06", "2026-04-07", "2026-04-08"], {
      ...baseData,
      shopClosedDates: ["2026-04-07"],
      submissionPattern: { kind: "dateOnly" },
      existingSelection: { kind: "dateOnly", workingDates: ["2026-04-06", "2026-04-07"] },
    });

    expect(result).toEqual([
      { date: "2026-04-06", isWorking: true, startTime: "09:00", endTime: "22:00" },
      {
        date: "2026-04-07",
        isWorking: false,
        startTime: "09:00",
        endTime: "22:00",
        optionId: undefined,
        optionIds: undefined,
      },
      { date: "2026-04-08", isWorking: false, startTime: "09:00", endTime: "22:00" },
    ]);
  });

  it("勤務区分の複数選択を保ち、存在しない選択肢を除外する", () => {
    const result = buildInitialEntries(["2026-04-06"], {
      ...baseData,
      submissionPattern: {
        kind: "shiftType",
        options: [
          { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
          { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
        ],
      },
      existingSelection: {
        kind: "shiftType",
        selections: [
          { date: "2026-04-06", optionId: "early" },
          { date: "2026-04-06", optionId: "removed" },
          { date: "2026-04-06", optionId: "late" },
        ],
      },
    });

    expect(result).toEqual([
      {
        date: "2026-04-06",
        isWorking: true,
        startTime: "09:00",
        endTime: "15:00",
        optionId: "early",
        optionIds: ["early", "late"],
      },
    ]);
  });
});
