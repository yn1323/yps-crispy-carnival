import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import {
  getNextStaffPositionLevel,
  getStaffPositionLevel,
  getStaffPositionLevelLabel,
  isLastAvailablePosition,
  isSameStaffPositionLevels,
  setStaffPositionLevel,
  toStaffPositionLevels,
  toStaffProfileInputs,
} from "./staffPositionLevels";
import type { ShiftSetupStaff, StaffPositionLevels } from "./types";

const hall = "position-hall" as Id<"positions">;
const kitchen = "position-kitchen" as Id<"positions">;
const register = "position-register" as Id<"positions">;
const removed = "position-removed" as Id<"positions">;
const positions = [{ _id: hall }, { _id: kitchen }, { _id: register }];

const staffA = "staff-a" as Id<"staffs">;
const staffB = "staff-b" as Id<"staffs">;
const staffC = "staff-c" as Id<"staffs">;

function staff(overrides: Partial<ShiftSetupStaff> = {}): ShiftSetupStaff {
  return { _id: staffA, name: "佐藤 花子", positionSkills: [], ...overrides };
}

describe("値の名前", () => {
  it("値の名前を返す", () => {
    expect(
      (["unavailable", "newcomer", "standard", "lead"] as const).map((level) => getStaffPositionLevelLabel(level)),
    ).toEqual(["担当外", "見習い", "一人前", "リーダー"]);
  });
});

describe("保存済みの値と編集中の値の変換", () => {
  it("保存済みの値を、ポジションのIDから値を引ける形へ直し、値のないポジションは一人前として読む", () => {
    const levels = toStaffPositionLevels(
      staff({
        positionSkills: [
          { positionId: kitchen, level: "unavailable" },
          { positionId: register, level: "lead" },
        ],
      }),
      positions,
    );

    expect(levels).toEqual({ [kitchen]: "unavailable", [register]: "lead" });
    expect(positions.map((position) => getStaffPositionLevel(levels, position._id))).toEqual([
      "standard",
      "unavailable",
      "lead",
    ]);
  });

  it("いまは無いポジションの値は捨てる", () => {
    expect(
      toStaffPositionLevels(staff({ positionSkills: [{ positionId: removed, level: "newcomer" }] }), positions),
    ).toEqual({});
  });
});

describe("1つのポジションの値を変える", () => {
  it("一人前以外の値を持ち、一人前へ戻すと値を持たない", () => {
    const newcomer = setStaffPositionLevel({}, kitchen, "newcomer", positions);
    expect(newcomer).toEqual({ [kitchen]: "newcomer" });

    const lead = setStaffPositionLevel(newcomer, kitchen, "lead", positions);
    expect(lead).toEqual({ [kitchen]: "lead" });
    expect(setStaffPositionLevel(lead, kitchen, "standard", positions)).toEqual({});
  });

  it("担当できるポジションが2つ以上あれば、担当外にできる", () => {
    const levels: StaffPositionLevels = { [kitchen]: "unavailable" };

    expect(isLastAvailablePosition(levels, hall, positions)).toBe(false);
    expect(setStaffPositionLevel(levels, hall, "unavailable", positions)).toEqual({
      [hall]: "unavailable",
      [kitchen]: "unavailable",
    });
  });

  it("最後に残った1つは、担当外にできない。見習いやリーダーには変えられる", () => {
    const levels: StaffPositionLevels = { [hall]: "unavailable", [kitchen]: "unavailable" };

    expect(isLastAvailablePosition(levels, register, positions)).toBe(true);
    expect(setStaffPositionLevel(levels, register, "unavailable", positions)).toBe(levels);
    expect(setStaffPositionLevel(levels, register, "lead", positions)).toEqual({ ...levels, [register]: "lead" });
    // すでに担当外のポジションは、最後の1つではない。
    expect(isLastAvailablePosition(levels, hall, positions)).toBe(false);
  });

  it("いまは無いポジションの値は、残りの数に数えない", () => {
    const levels: StaffPositionLevels = { [kitchen]: "unavailable", [register]: "unavailable" };

    // 削除済みのポジションに値が残っていても、担当できるのはホールだけである。
    expect(isLastAvailablePosition({ ...levels, [removed]: "lead" }, hall, positions)).toBe(true);
  });

  it("ポジションが1件の店舗では、その1件が最後の1つになる", () => {
    expect(isLastAvailablePosition({}, hall, [{ _id: hall }])).toBe(true);
  });
});

describe("変更の有無と保存する形", () => {
  it("一人前を持たない値と、一人前へ戻した値は同じとみなす", () => {
    expect(
      isSameStaffPositionLevels({}, setStaffPositionLevel({ [hall]: "lead" }, hall, "standard", positions), positions),
    ).toBe(true);
    expect(isSameStaffPositionLevels({ [hall]: "lead" }, { [hall]: "newcomer" }, positions)).toBe(false);
    // いまは無いポジションの値の違いは、変更に数えない。
    expect(isSameStaffPositionLevels({ [removed]: "lead" }, {}, positions)).toBe(true);
  });

  it("保存済みの値から変えたスタッフだけを、ポジションの並び順にそろえ、一人前を省いて返す", () => {
    const staffs = [
      staff({ _id: staffA, positionSkills: [{ positionId: kitchen, level: "unavailable" }] }),
      staff({ _id: staffB, name: "鈴木 次郎" }),
      staff({ _id: staffC, name: "高橋 美咲", positionSkills: [{ positionId: hall, level: "lead" }] }),
    ];

    expect(
      toStaffProfileInputs(
        staffs,
        {
          // 並びが違い、いまは無いポジションの値を持つ。
          [staffA]: { [register]: "newcomer", [removed]: "lead", [hall]: "lead" },
          // 保存済みの値と同じ。
          [staffB]: {},
          // すべて一人前へ戻した。
          [staffC]: {},
        },
        positions,
      ),
    ).toEqual([
      {
        staffId: staffA,
        positionSkills: [
          { positionId: hall, level: "lead" },
          { positionId: register, level: "newcomer" },
        ],
      },
      { staffId: staffC, positionSkills: [] },
    ]);
  });

  it("編集していないスタッフは返さない", () => {
    expect(toStaffProfileInputs([staff()], {}, positions)).toEqual([]);
  });
});

describe("マスを押すたびに値を切り替える", () => {
  /** 同じマスを`times`回押したときの値を、押した順に返す。 */
  function press(
    initial: StaffPositionLevels,
    positionId: string,
    times: number,
    targetPositions: ReadonlyArray<{ _id: Id<"positions"> }> = positions,
  ) {
    let levels = initial;
    return Array.from({ length: times }, () => {
      const next = getNextStaffPositionLevel(levels, positionId, targetPositions);
      levels = setStaffPositionLevel(levels, positionId, next, targetPositions);
      return next;
    });
  }

  it("一人前、見習い、リーダー、担当外の順に切り替わり、担当外の次は一人前へ戻る", () => {
    expect(press({}, hall, 5)).toEqual(["newcomer", "lead", "unavailable", "standard", "newcomer"]);
  });

  it("保存済みの値の続きから切り替わる", () => {
    expect(getNextStaffPositionLevel({ [hall]: "newcomer" }, hall, positions)).toBe("lead");
    expect(getNextStaffPositionLevel({ [hall]: "lead" }, hall, positions)).toBe("unavailable");
    expect(getNextStaffPositionLevel({ [hall]: "unavailable" }, hall, positions)).toBe("standard");
  });

  it("最後に残った担当できるポジションでは、担当外を飛ばして一人前へ戻る", () => {
    const levels: StaffPositionLevels = { [hall]: "unavailable", [kitchen]: "unavailable" };

    expect(press(levels, register, 4)).toEqual(["newcomer", "lead", "standard", "newcomer"]);
  });

  it("担当できるポジションが2つ残っていれば、担当外へ切り替わる", () => {
    expect(getNextStaffPositionLevel({ [kitchen]: "unavailable", [hall]: "lead" }, hall, positions)).toBe(
      "unavailable",
    );
  });

  it("すでに担当外のマスは、ほかに担当できるポジションが1つだけでも一人前へ戻せる", () => {
    const levels: StaffPositionLevels = { [hall]: "unavailable", [kitchen]: "unavailable" };

    expect(getNextStaffPositionLevel(levels, hall, positions)).toBe("standard");
  });

  it("いまは無いポジションの値は、担当できるポジションに数えない", () => {
    const levels: StaffPositionLevels = { [kitchen]: "unavailable", [register]: "unavailable", [removed]: "lead" };

    expect(getNextStaffPositionLevel({ ...levels, [hall]: "lead" }, hall, positions)).toBe("standard");
  });

  it("ポジションが1件の店舗では、一人前、見習い、リーダーの順に切り替わり、担当外にはならない", () => {
    expect(press({}, hall, 4, [{ _id: hall }])).toEqual(["newcomer", "lead", "standard", "newcomer"]);
  });
});
