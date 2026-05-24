import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { ShiftBoardData } from "../types";
import { buildShiftData } from "./index";

const shopId = "shop1" as Id<"shops">;
const recruitmentId = "recruitment1" as Id<"recruitments">;
const staffId = "staff1" as Id<"staffs">;
const positionId = "position1" as Id<"positions">;

const staff = { id: staffId, name: "田中 太郎", isSubmitted: true };

const baseData = {
  shopId,
  recruitment: {
    _id: recruitmentId,
    periodStart: "2026-05-21",
    periodEnd: "2026-05-21",
    deadline: "2026-05-18",
    shopClosedDates: [],
    status: "open",
    confirmedAt: null,
    lastReminderSentAt: null,
    draftSavedAt: null,
  },
  staffs: [{ _id: staffId, name: "田中 太郎", isSubmitted: true, wasSubmittedAtDraft: false }],
  requestedDates: [],
  shiftAssignments: [],
  positions: [{ _id: positionId, name: "シフト", color: "#0d9488", isDefault: true }],
  timeRange: { start: 9, end: 22, unit: 30, editableStartMinutes: 540, editableEndMinutes: 1320 },
} satisfies Omit<ShiftBoardData, "submissionPattern" | "requestedSlots">;

describe("buildShiftData", () => {
  it("下書き保存前の勤務区分募集では希望スロットを初期割当に変換する", () => {
    const shifts = buildShiftData(
      {
        ...baseData,
        submissionPattern: {
          kind: "shiftType",
          options: [{ id: "morning", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 0 }],
        },
        requestedSlots: [
          {
            staffId,
            date: "2026-05-21",
            startTime: "09:00",
            endTime: "13:00",
            optionId: "morning",
          },
        ],
      },
      [staff],
      ["2026-05-21"],
    );

    expect(shifts[0].requestedShiftTypeOptionIds).toEqual(["morning"]);
    expect(shifts[0].positions).toEqual([
      expect.objectContaining({ start: "09:00", end: "13:00", positionId, shiftTypeOptionId: "morning" }),
    ]);
  });

  it("下書き保存後に保存時提出済みだった勤務区分希望は割当へ自動反映しない", () => {
    const shifts = buildShiftData(
      {
        ...baseData,
        recruitment: {
          ...baseData.recruitment,
          draftSavedAt: 1_000,
        },
        staffs: [{ _id: staffId, name: "田中 太郎", isSubmitted: true, wasSubmittedAtDraft: true }],
        submissionPattern: {
          kind: "shiftType",
          options: [{ id: "morning", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 0 }],
        },
        requestedSlots: [
          {
            staffId,
            date: "2026-05-21",
            startTime: "09:00",
            endTime: "13:00",
            optionId: "morning",
          },
        ],
      },
      [staff],
      ["2026-05-21"],
    );

    expect(shifts[0].requestedShiftTypeOptionIds).toEqual(["morning"]);
    expect(shifts[0].positions).toEqual([]);
  });

  it("時間指定募集では従来どおり希望スロットを表示用セグメントに変換する", () => {
    const shifts = buildShiftData(
      {
        ...baseData,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        requestedSlots: [{ staffId, date: "2026-05-21", startTime: "10:00", endTime: "18:00" }],
      },
      [staff],
      ["2026-05-21"],
    );

    expect(shifts[0].positions).toEqual([expect.objectContaining({ start: "10:00", end: "18:00", positionId })]);
  });
});
