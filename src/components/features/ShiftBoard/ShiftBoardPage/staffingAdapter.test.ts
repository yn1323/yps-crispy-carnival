import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { ShiftBoardStaffingData } from "../types";
import {
  toDayRequirementsArg,
  toDayTemplateIdArg,
  toPositionSkillsByStaffId,
  toShiftFormStaffing,
} from "./staffingAdapter";

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
  it("当てられるテンプレートのIDをShiftFormの名前へ直し、日ごとの必要人数はそのまま渡す", () => {
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
  it("テンプレートのIDと必要人数を、値を変えずに渡す", () => {
    expect(toDayTemplateIdArg("template-1")).toBe("template-1");
    expect(toDayTemplateIdArg(null)).toBeNull();

    const requirements = {
      kind: "time" as const,
      bars: [{ positionId: "hall", startTime: "09:00", endTime: "14:00" }],
    };
    expect(toDayRequirementsArg(requirements)).toEqual(requirements);
  });
});

describe("toPositionSkillsByStaffId", () => {
  const kitchenId = "kitchen" as Id<"positions">;
  const staffA = "staff-a" as Id<"staffs">;
  const staffB = "staff-b" as Id<"staffs">;
  const staffC = "staff-c" as Id<"staffs">;

  it("スタッフごとのポジションの値を、staffIdから引ける形にする", () => {
    const result = toPositionSkillsByStaffId([
      {
        staffId: staffA,
        positionSkills: [
          { positionId: hallId, level: "lead" },
          { positionId: kitchenId, level: "unavailable" },
        ],
      },
      { staffId: staffB, positionSkills: [{ positionId: kitchenId, level: "newcomer" }] },
    ]);

    expect([...result]).toEqual([
      [
        "staff-a",
        [
          { positionId: "hall", level: "lead" },
          { positionId: "kitchen", level: "unavailable" },
        ],
      ],
      ["staff-b", [{ positionId: "kitchen", level: "newcomer" }]],
    ]);
  });

  it("値を1つも持たないスタッフは含めない", () => {
    const result = toPositionSkillsByStaffId([
      { staffId: staffA, positionSkills: [] },
      { staffId: staffC, positionSkills: [{ positionId: hallId, level: "newcomer" }] },
    ]);

    expect([...result.keys()]).toEqual(["staff-c"]);
  });

  it("店舗の設定を受け取っていない場合は、空の結果を返す", () => {
    expect(toPositionSkillsByStaffId(undefined).size).toBe(0);
  });
});
