import { describe, expect, it } from "vitest";
import type { SubmissionData } from "../types";
import { buildPreviousPatternEntries, buildPreviousPatternNotes } from "./script";

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

describe("buildPreviousPatternEntries", () => {
  it("前回パターンを適用しても定休日は休みにする", () => {
    const result = buildPreviousPatternEntries(["2026-04-06", "2026-04-07"], {
      ...baseData,
      shopClosedDates: ["2026-04-06"],
      previousWeeklyPattern: {
        sourceWeekStart: "2026-03-30",
        notes: [],
        days: [
          { weekday: 1, startTime: "10:00", endTime: "18:00" },
          { weekday: 2, startTime: "11:00", endTime: "19:00" },
        ],
      },
    });

    expect(result).toEqual([
      {
        date: "2026-04-06",
        isWorking: false,
        startTime: "10:00",
        endTime: "18:00",
        optionId: undefined,
        optionIds: undefined,
      },
      { date: "2026-04-07", isWorking: true, startTime: "11:00", endTime: "19:00" },
    ]);
  });
});

describe("buildPreviousPatternNotes", () => {
  it("前回の週のメモを曜日の合う日へ写し、定休日には写さない", () => {
    const result = buildPreviousPatternNotes(["2026-04-06", "2026-04-07", "2026-04-08"], {
      ...baseData,
      shopClosedDates: ["2026-04-07"],
      previousWeeklyPattern: {
        sourceWeekStart: "2026-03-30",
        notes: [
          { weekday: 1, note: "17時以降なら入れます" },
          { weekday: 2, note: "定休日のメモ" },
        ],
        days: [{ weekday: 1, startTime: "10:00", endTime: "18:00" }],
      },
    });

    expect(result).toEqual({ "2026-04-06": "17時以降なら入れます" });
  });

  it("日付選択での提出では日付選択の前回パターンのメモを使う", () => {
    const result = buildPreviousPatternNotes(["2026-04-06", "2026-04-08"], {
      ...baseData,
      submissionPattern: { kind: "dateOnly" },
      previousDateOnlyPattern: {
        sourceWeekStart: "2026-03-30",
        weekdays: [1],
        notes: [{ weekday: 3, note: "休みたいです" }],
      },
    });

    expect(result).toEqual({ "2026-04-08": "休みたいです" });
  });
});
