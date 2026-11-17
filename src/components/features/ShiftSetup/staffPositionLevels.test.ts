import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import {
  getNextStaffPositionLevel,
  getStaffPositionLevel,
  getStaffPositionLevelLabel,
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
    const newcomer = setStaffPositionLevel({}, kitchen, "newcomer");
    expect(newcomer).toEqual({ [kitchen]: "newcomer" });

    const lead = setStaffPositionLevel(newcomer, kitchen, "lead");
    expect(lead).toEqual({ [kitchen]: "lead" });
    expect(setStaffPositionLevel(lead, kitchen, "standard")).toEqual({});
  });

  it("すべてのポジションを担当外にできる", () => {
    const levels: StaffPositionLevels = { [hall]: "unavailable", [kitchen]: "unavailable" };

    expect(setStaffPositionLevel(levels, register, "unavailable")).toEqual({
      [hall]: "unavailable",
      [kitchen]: "unavailable",
      [register]: "unavailable",
    });
  });
});

describe("変更の有無と保存する形", () => {
  it("一人前を持たない値と、一人前へ戻した値は同じとみなす", () => {
    expect(isSameStaffPositionLevels({}, setStaffPositionLevel({ [hall]: "lead" }, hall, "standard"), positions)).toBe(
      true,
    );
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
  function press(initial: StaffPositionLevels, positionId: string, times: number) {
    let levels = initial;
    return Array.from({ length: times }, () => {
      const next = getNextStaffPositionLevel(levels, positionId);
      levels = setStaffPositionLevel(levels, positionId, next);
      return next;
    });
  }

  it("見習い、一人前、リーダー、担当外の順に切り替わり、担当外の次は見習いへ戻る", () => {
    // 一人前のマスは、次のリーダーから切り替わる。
    expect(press({}, hall, 5)).toEqual(["lead", "unavailable", "newcomer", "standard", "lead"]);
  });

  it("保存済みの値の続きから切り替わる", () => {
    expect(getNextStaffPositionLevel({ [hall]: "newcomer" }, hall)).toBe("standard");
    expect(getNextStaffPositionLevel({ [hall]: "lead" }, hall)).toBe("unavailable");
    expect(getNextStaffPositionLevel({ [hall]: "unavailable" }, hall)).toBe("newcomer");
  });

  it("ほかのポジションがすべて担当外でも、担当外へ切り替わる", () => {
    const levels: StaffPositionLevels = { [hall]: "unavailable", [kitchen]: "unavailable" };

    expect(press(levels, register, 2)).toEqual(["lead", "unavailable"]);
  });
});
