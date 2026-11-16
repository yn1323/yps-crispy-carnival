import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { ShiftBoardStaffingData } from "../types";
import { toDayRequirementsArg, toDayTemplateIdArg, toShiftFormStaffing } from "./staffingAdapter";

const templateId = "template-1" as Id<"shiftDayTemplates">;
const hallId = "hall" as Id<"positions">;

const staffing: Pick<ShiftBoardStaffingData, "isLocked" | "templates" | "days"> = {
  isLocked: false,
  templates: [{ _id: templateId, name: "通常" }],
  days: [
    {
      date: "2026-06-01",
      source: "weekday",
      templateId,
      templateName: "通常",
      requirements: { kind: "time", bars: [{ positionId: hallId, startTime: "09:00", endTime: "14:00" }] },
    },
    { date: "2026-06-02", source: "none", templateId: null, templateName: null, requirements: null },
  ],
};

describe("toShiftFormStaffing", () => {
  it("当てられる型のIDをShiftFormの名前へ直し、日ごとの必要人数はそのまま渡す", () => {
    const breakRule = { minWorkMinutes: 360, breakMinutes: 45 };

    expect(toShiftFormStaffing(staffing, breakRule)).toEqual({
      breakRule,
      isLocked: false,
      templates: [{ id: "template-1", name: "通常" }],
      days: [
        {
          date: "2026-06-01",
          source: "weekday",
          templateId: "template-1",
          templateName: "通常",
          requirements: { kind: "time", bars: [{ positionId: "hall", startTime: "09:00", endTime: "14:00" }] },
        },
        { date: "2026-06-02", source: "none", templateId: null, templateName: null, requirements: null },
      ],
    });
  });

  it("確定済みの募集は、変更できない状態と、確定時の必要人数を渡す", () => {
    const result = toShiftFormStaffing(
      {
        isLocked: true,
        templates: [],
        days: [
          {
            date: "2026-06-01",
            source: "confirmed",
            templateId: null,
            templateName: "通常",
            requirements: { kind: "dateOnly", counts: [{ positionId: hallId, count: 2 }] },
          },
        ],
      },
      null,
    );

    expect(result).toEqual({
      breakRule: null,
      isLocked: true,
      templates: [],
      days: [
        {
          date: "2026-06-01",
          source: "confirmed",
          templateId: null,
          templateName: "通常",
          requirements: { kind: "dateOnly", counts: [{ positionId: "hall", count: 2 }] },
        },
      ],
    });
  });
});

describe("mutationの引数への変換", () => {
  it("型のIDと必要人数を、値を変えずに渡す", () => {
    expect(toDayTemplateIdArg("template-1")).toBe("template-1");
    expect(toDayTemplateIdArg(null)).toBeNull();

    const requirements = {
      kind: "time" as const,
      bars: [{ positionId: "hall", startTime: "09:00", endTime: "14:00" }],
    };
    expect(toDayRequirementsArg(requirements)).toEqual(requirements);
  });
});
