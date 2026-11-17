import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { normalizeStaffingSegments } from "@/src/domains/shift/staffingSegments";
import {
  applyPositionInputs,
  createDraftPositionId,
  isDraftPositionId,
  isSamePositions,
  keepPositionsInDayTemplateDrafts,
  reconcileStaffDrafts,
  replacePositionIds,
  replacePositionIdsInDayTemplateDrafts,
  replacePositionIdsInStaffDrafts,
  resolveSavedPositionIds,
  toPositionSaveInputs,
} from "./positionDrafts";
import type { DayTemplateDraft, DayTemplateRequirementsDraft, ShiftSetupPosition, ShiftSetupStaff } from "./types";

const hall = "position-hall" as Id<"positions">;
const kitchen = "position-kitchen" as Id<"positions">;
const register = "position-register" as Id<"positions">;
const draftA = createDraftPositionId(1);
const savedA = "position-saved-a" as Id<"positions">;

const positions: ShiftSetupPosition[] = [
  { _id: hall, name: "ホール", color: "#60a5fa", isDefault: true },
  { _id: kitchen, name: "キッチン", color: "#fb923c", isDefault: false },
];

function template(requirements: DayTemplateRequirementsDraft): DayTemplateDraft {
  return {
    rowKey: "template-a",
    name: "通常",
    weekdays: ["mon"],
    appliesToHolidays: false,
    requirements,
    requiresReentry: false,
  };
}

function staff(id: string, positionSkills: ShiftSetupStaff["positionSkills"]): ShiftSetupStaff {
  return { _id: id as Id<"staffs">, name: id, positionSkills };
}

describe("仮のID", () => {
  it("新しく足したポジションの仮のIDは、保存済みのIDと見分けられる", () => {
    expect(isDraftPositionId(createDraftPositionId(1))).toBe(true);
    expect(createDraftPositionId(1)).not.toBe(createDraftPositionId(2));
    expect(isDraftPositionId(hall)).toBe(false);
  });
});

describe("Dialogで決めた一覧の反映", () => {
  it("IDのない行へ仮のIDを振り、既存の行はIDと既定を引き継いで、渡した順に並べる", () => {
    let sequence = 0;
    const next = applyPositionInputs(
      [
        { name: "レジ", color: "#a78bfa" },
        { id: kitchen, name: "厨房", color: "#f472b6" },
        { id: hall, name: "ホール", color: "#60a5fa" },
        { name: "デリバリー", color: "#eda40a" },
      ],
      positions,
      () => createDraftPositionId(++sequence),
    );

    expect(next).toEqual([
      { _id: createDraftPositionId(1), name: "レジ", color: "#a78bfa", isDefault: false },
      { _id: kitchen, name: "厨房", color: "#f472b6", isDefault: false },
      { _id: hall, name: "ホール", color: "#60a5fa", isDefault: true },
      { _id: createDraftPositionId(2), name: "デリバリー", color: "#eda40a", isDefault: false },
    ]);
  });

  it("前に足したポジションは、Dialogを開き直しても同じ仮のIDのままである", () => {
    const current: ShiftSetupPosition[] = [
      ...positions,
      { _id: draftA, name: "レジ", color: "#a78bfa", isDefault: false },
    ];

    const next = applyPositionInputs(
      [
        { id: hall, name: "ホール", color: "#60a5fa" },
        { id: draftA, name: "レジ係", color: "#a78bfa" },
      ],
      current,
      () => createDraftPositionId(99),
    );

    expect(next.map((position) => [position._id, position.name])).toEqual([
      [hall, "ホール"],
      [draftA, "レジ係"],
    ]);
  });

  it.each([
    { name: "同じ一覧", next: positions, expected: true },
    { name: "名前を変えた一覧", next: [positions[0], { ...positions[1], name: "厨房" }], expected: false },
    { name: "色を変えた一覧", next: [positions[0], { ...positions[1], color: "#a78bfa" }], expected: false },
    { name: "並び順を変えた一覧", next: [positions[1], positions[0]], expected: false },
    { name: "1件減らした一覧", next: [positions[0]], expected: false },
    {
      name: "1件足した一覧",
      next: [...positions, { _id: draftA, name: "レジ", color: "#a78bfa", isDefault: false }],
      expected: false,
    },
  ])("$name は、保存内容として同じかどうかを $expected と判定する", ({ next, expected }) => {
    expect(isSamePositions(next, positions)).toBe(expected);
  });
});

describe("ポジションの保存の引数と応答", () => {
  const editing: ShiftSetupPosition[] = [
    { _id: draftA, name: "レジ", color: "#a78bfa", isDefault: false },
    ...positions,
  ];

  it("仮のIDは送らず、保存済みのポジションだけがIDを持つ", () => {
    expect(toPositionSaveInputs(editing)).toEqual([
      { name: "レジ", color: "#a78bfa" },
      { id: hall, name: "ホール", color: "#60a5fa" },
      { id: kitchen, name: "キッチン", color: "#fb923c" },
    ]);
  });

  it("応答のIDを入力の順に対応させ、一覧の仮のIDを保存後のIDへ置き換える", () => {
    const savedIds = resolveSavedPositionIds(editing, [savedA, hall, kitchen]);

    expect(replacePositionIds(editing, savedIds).map((position) => [position._id, position.name])).toEqual([
      [savedA, "レジ"],
      [hall, "ホール"],
      [kitchen, "キッチン"],
    ]);
  });

  it.each([
    { name: "件数が足りない応答", savedIds: [savedA, hall] },
    { name: "件数が多い応答", savedIds: [savedA, hall, kitchen, register] },
    { name: "配列でない応答", savedIds: null as unknown as Id<"positions">[] },
  ])("$name は、IDを対応させずにエラーにする", ({ savedIds }) => {
    expect(() => resolveSavedPositionIds(editing, savedIds)).toThrowError("保存したポジションを確認できませんでした");
  });
});

describe("テンプレートの下書きが指すポジション", () => {
  const segments = [
    { positionId: hall, startTime: "09:00", endTime: "22:00", count: 2 },
    { positionId: register, startTime: "10:00", endTime: "20:00", count: 1 },
    { positionId: draftA, startTime: "11:00", endTime: "14:00", count: 3 },
  ];

  it("一覧にないポジションの人数だけを外し、残した人数は変えない", () => {
    const [kept] = keepPositionsInDayTemplateDrafts(
      [template({ kind: "time", segments })],
      [{ _id: hall }, { _id: draftA }],
    );

    expect(kept.requirements).toEqual({
      kind: "time",
      segments: normalizeStaffingSegments([segments[0], segments[2]]),
    });
  });

  it("一覧にないポジションの人数を外し、人数がなくなった勤務パターンの行は持たない", () => {
    const drafts = [
      template({ kind: "shiftType", counts: { early: { [hall]: 2, [register]: 1 }, late: { [register]: 3 } } }),
      template({ kind: "dateOnly", counts: { [hall]: 4, [register]: 2 } }),
    ];

    const kept = keepPositionsInDayTemplateDrafts(drafts, [{ _id: hall }]);

    expect(kept.map((draft) => draft.requirements)).toEqual([
      { kind: "shiftType", counts: { early: { [hall]: 2 } } },
      { kind: "dateOnly", counts: { [hall]: 4 } },
    ]);
  });

  it("仮のIDを保存後のIDへ置き換え、ほかのポジションの人数は変えない", () => {
    const savedIds = new Map([[draftA as string, savedA]]);
    const drafts = [
      template({ kind: "time", segments }),
      template({ kind: "shiftType", counts: { early: { [hall]: 2, [draftA]: 1 } } }),
      template({ kind: "dateOnly", counts: { [draftA]: 3 } }),
    ];

    const replaced = replacePositionIdsInDayTemplateDrafts(drafts, savedIds);

    expect(replaced.map((draft) => draft.requirements)).toEqual([
      {
        kind: "time",
        // IDが変わると並びも変わるため、正規化した並びで比べる。
        segments: normalizeStaffingSegments([segments[0], segments[1], { ...segments[2], positionId: savedA }]),
      },
      { kind: "shiftType", counts: { early: { [hall]: 2, [savedA]: 1 } } },
      { kind: "dateOnly", counts: { [savedA]: 3 } },
    ]);
  });
});

describe("ポジションの一覧を変えたあとのスタッフの値", () => {
  const staffs = [
    staff("staff-a", []),
    staff("staff-b", [{ positionId: kitchen, level: "unavailable" }]),
    staff("staff-c", [{ positionId: hall, level: "lead" }]),
  ];

  it("一覧にないポジションの値を外し、保存済みの値と同じになったスタッフは編集中の値に残さない", () => {
    const drafts = {
      // 外すポジションだけを変えていたスタッフ。
      "staff-a": { [register]: "newcomer" as const },
      // 残るポジションも変えていたスタッフ。
      "staff-c": { [hall]: "newcomer" as const, [register]: "lead" as const },
    };

    expect(reconcileStaffDrafts(staffs, drafts, positions)).toEqual({ "staff-c": { [hall]: "newcomer" } });
  });

  it("残ったポジションのすべてが担当外になるスタッフは、担当外を外して全ポジションを担当できるものとする", () => {
    // キッチンだけを残す。保存済みの値でキッチンが担当外のstaff-bは、担当できるポジションが残らない。
    expect(reconcileStaffDrafts(staffs, {}, [{ _id: kitchen }])).toEqual({ "staff-b": {} });

    // ホールだけを残す。編集中の値でホールを担当外にしたstaff-cは、担当できるポジションが残らない。
    const drafts = { "staff-c": { [hall]: "unavailable" as const, [register]: "lead" as const } };
    expect(reconcileStaffDrafts(staffs, drafts, [{ _id: hall }])).toEqual({ "staff-c": {} });
  });

  it("担当できるポジションが残るスタッフの担当外は、そのまま保つ", () => {
    const drafts = { "staff-a": { [kitchen]: "unavailable" as const } };

    expect(reconcileStaffDrafts(staffs, drafts, [...positions, { _id: draftA }])).toEqual({
      "staff-a": { [kitchen]: "unavailable" },
    });
  });

  it("仮のIDを保存後のIDへ置き換え、ほかのポジションの値は変えない", () => {
    const savedIds = new Map([[draftA as string, savedA]]);

    expect(
      replacePositionIdsInStaffDrafts(
        { "staff-a": { [draftA]: "newcomer", [hall]: "lead" }, "staff-b": { [kitchen]: "unavailable" } },
        savedIds,
      ),
    ).toEqual({ "staff-a": { [savedA]: "newcomer", [hall]: "lead" }, "staff-b": { [kitchen]: "unavailable" } });
  });
});
