import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import {
  changeStaffPositionMarks,
  filterStaffsByName,
  getStaffPositionLevel,
  getStaffPositionLevelLabel,
  getStaffPositionMarkOptions,
  getStaffPositionMarkSymbol,
  getStampedStaffPositionLevel,
  isLastAvailablePosition,
  isSameStaffPositionLevels,
  isStaffPositionMarkBlocked,
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

describe("付けられる印", () => {
  it("ポジションが2件以上の店舗では、新人、責任者、入れないの順に3つを付けられる", () => {
    expect(getStaffPositionMarkOptions(positions)).toEqual([
      { value: "newcomer", label: "新人" },
      { value: "lead", label: "責任者" },
      { value: "unavailable", label: "入れない" },
    ]);
  });

  it("ポジションが1件の店舗では、入れないを出さない", () => {
    expect(getStaffPositionMarkOptions([{ _id: hall }]).map((option) => option.value)).toEqual(["newcomer", "lead"]);
  });

  it("値の名前を返す", () => {
    expect(
      (["unavailable", "newcomer", "standard", "lead"] as const).map((level) => getStaffPositionLevelLabel(level)),
    ).toEqual(["入れない", "新人", "標準", "責任者"]);
  });

  it("マスに出す短い印を返す", () => {
    expect((["newcomer", "lead", "unavailable"] as const).map((mark) => getStaffPositionMarkSymbol(mark))).toEqual([
      "新",
      "責",
      "×",
    ]);
  });
});

describe("保存済みの値と編集中の値の変換", () => {
  it("保存済みの値を、ポジションのIDから値を引ける形へ直し、値のないポジションは標準として読む", () => {
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
  it("標準以外の値を持ち、標準へ戻すと値を持たない", () => {
    const newcomer = setStaffPositionLevel({}, kitchen, "newcomer", positions);
    expect(newcomer).toEqual({ [kitchen]: "newcomer" });

    const lead = setStaffPositionLevel(newcomer, kitchen, "lead", positions);
    expect(lead).toEqual({ [kitchen]: "lead" });
    expect(setStaffPositionLevel(lead, kitchen, "standard", positions)).toEqual({});
  });

  it("入れるポジションが2つ以上あれば、入れないにできる", () => {
    const levels: StaffPositionLevels = { [kitchen]: "unavailable" };

    expect(isLastAvailablePosition(levels, hall, positions)).toBe(false);
    expect(setStaffPositionLevel(levels, hall, "unavailable", positions)).toEqual({
      [hall]: "unavailable",
      [kitchen]: "unavailable",
    });
  });

  it("最後に残った1つは、入れないにできない。新人や責任者には変えられる", () => {
    const levels: StaffPositionLevels = { [hall]: "unavailable", [kitchen]: "unavailable" };

    expect(isLastAvailablePosition(levels, register, positions)).toBe(true);
    expect(setStaffPositionLevel(levels, register, "unavailable", positions)).toBe(levels);
    expect(setStaffPositionLevel(levels, register, "lead", positions)).toEqual({ ...levels, [register]: "lead" });
    // すでに入れないポジションは、最後の1つではない。
    expect(isLastAvailablePosition(levels, hall, positions)).toBe(false);
  });

  it("いまは無いポジションの値は、残りの数に数えない", () => {
    const levels: StaffPositionLevels = { [kitchen]: "unavailable", [register]: "unavailable" };

    // 削除済みのポジションに値が残っていても、入れるのはホールだけである。
    expect(isLastAvailablePosition({ ...levels, [removed]: "lead" }, hall, positions)).toBe(true);
  });

  it("ポジションが1件の店舗では、その1件が最後の1つになる", () => {
    expect(isLastAvailablePosition({}, hall, [{ _id: hall }])).toBe(true);
  });
});

describe("変更の有無と保存する形", () => {
  it("標準を持たない値と、標準へ戻した値は同じとみなす", () => {
    expect(
      isSameStaffPositionLevels({}, setStaffPositionLevel({ [hall]: "lead" }, hall, "standard", positions), positions),
    ).toBe(true);
    expect(isSameStaffPositionLevels({ [hall]: "lead" }, { [hall]: "newcomer" }, positions)).toBe(false);
    // いまは無いポジションの値の違いは、変更に数えない。
    expect(isSameStaffPositionLevels({ [removed]: "lead" }, {}, positions)).toBe(true);
  });

  it("保存済みの値から変えたスタッフだけを、ポジションの並び順にそろえ、標準を省いて返す", () => {
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
          // すべて標準へ戻した。
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

describe("マスを押して印を付ける", () => {
  it("印のないマスには、選んでいる印が付く", () => {
    expect(
      (["newcomer", "lead", "unavailable"] as const).map((mark) => getStampedStaffPositionLevel("standard", mark)),
    ).toEqual(["newcomer", "lead", "unavailable"]);
  });

  it("選んでいる印と同じ印のマスは、標準へ戻る", () => {
    expect(
      (["newcomer", "lead", "unavailable"] as const).map((mark) => getStampedStaffPositionLevel(mark, mark)),
    ).toEqual(["standard", "standard", "standard"]);
  });

  it("別の印が付いたマスは、選んでいる印に置き換わる", () => {
    expect(getStampedStaffPositionLevel("lead", "newcomer")).toBe("newcomer");
    expect(getStampedStaffPositionLevel("unavailable", "lead")).toBe("lead");
    expect(getStampedStaffPositionLevel("newcomer", "unavailable")).toBe("unavailable");
  });

  it("最後に残った入れるポジションには、入れないだけを付けられない", () => {
    const levels: StaffPositionLevels = { [hall]: "unavailable", [kitchen]: "unavailable" };

    expect(
      (["newcomer", "lead", "unavailable"] as const).map((mark) =>
        isStaffPositionMarkBlocked(levels, register, mark, positions),
      ),
    ).toEqual([false, false, true]);
    // すでに入れないのマスは、もう一度押して外せる。
    expect(isStaffPositionMarkBlocked(levels, hall, "unavailable", positions)).toBe(false);
  });

  it("入れるポジションが2つ以上あれば、入れないを付けられる", () => {
    expect(isStaffPositionMarkBlocked({ [kitchen]: "unavailable" }, hall, "unavailable", positions)).toBe(false);
  });

  it("ポジションが1件の店舗では、その1件に入れないを付けられない", () => {
    expect(isStaffPositionMarkBlocked({}, hall, "unavailable", [{ _id: hall }])).toBe(true);
  });
});

describe("まとめて印を付ける、外す", () => {
  const profiles: Record<string, StaffPositionLevels> = {
    [staffA]: { [kitchen]: "lead" },
    // 入れるのはキッチンだけ。
    [staffB]: { [hall]: "unavailable", [register]: "unavailable" },
    [staffC]: { [kitchen]: "unavailable" },
  };
  const everyone = [staffA, staffB, staffC];

  it("選んだスタッフ全員に印を付け、別の印が付いていたスタッフは置き換える", () => {
    expect(
      changeStaffPositionMarks(
        profiles,
        { positionId: kitchen, staffIds: everyone, mark: "newcomer", action: "apply" },
        positions,
      ),
    ).toEqual({
      profiles: {
        [staffA]: { [kitchen]: "newcomer" },
        [staffB]: { [hall]: "unavailable", [kitchen]: "newcomer", [register]: "unavailable" },
        [staffC]: { [kitchen]: "newcomer" },
      },
      skippedCount: 0,
    });
  });

  it("選んでいないスタッフの値は変えない", () => {
    const result = changeStaffPositionMarks(
      profiles,
      { positionId: kitchen, staffIds: [staffC], mark: "newcomer", action: "apply" },
      positions,
    );

    expect(result).toEqual({
      profiles: { ...profiles, [staffC]: { [kitchen]: "newcomer" } },
      skippedCount: 0,
    });
    // 変えていないスタッフは、同じ値をそのまま返す。
    expect(result.profiles[staffA]).toBe(profiles[staffA]);
  });

  it("入れないを付けると入れるポジションがなくなるスタッフは変えず、その人数を返す", () => {
    expect(
      changeStaffPositionMarks(
        profiles,
        { positionId: kitchen, staffIds: everyone, mark: "unavailable", action: "apply" },
        positions,
      ),
    ).toEqual({
      profiles: {
        [staffA]: { [kitchen]: "unavailable" },
        [staffB]: { [hall]: "unavailable", [register]: "unavailable" },
        [staffC]: { [kitchen]: "unavailable" },
      },
      skippedCount: 1,
    });
  });

  it("選んでいないスタッフは、入れるポジションがなくなる人数に数えない", () => {
    expect(
      changeStaffPositionMarks(
        profiles,
        { positionId: kitchen, staffIds: [staffA], mark: "unavailable", action: "apply" },
        positions,
      ).skippedCount,
    ).toBe(0);
  });

  it("外すときは、その印が付いているスタッフだけを標準へ戻し、別の印は残す", () => {
    expect(
      changeStaffPositionMarks(
        profiles,
        { positionId: kitchen, staffIds: everyone, mark: "unavailable", action: "remove" },
        positions,
      ),
    ).toEqual({
      profiles: {
        [staffA]: { [kitchen]: "lead" },
        [staffB]: { [hall]: "unavailable", [register]: "unavailable" },
        [staffC]: {},
      },
      skippedCount: 0,
    });
  });

  it("対象のスタッフがいなければ、何も変えない", () => {
    expect(
      changeStaffPositionMarks(
        profiles,
        { positionId: kitchen, staffIds: [], mark: "newcomer", action: "apply" },
        positions,
      ),
    ).toEqual({ profiles, skippedCount: 0 });
  });

  it("一覧にないスタッフと、重ねて渡したスタッフは数えない", () => {
    const unknown = "staff-unknown" as Id<"staffs">;

    expect(
      changeStaffPositionMarks(
        profiles,
        { positionId: kitchen, staffIds: [unknown, staffB, staffB], mark: "unavailable", action: "apply" },
        positions,
      ),
    ).toEqual({ profiles, skippedCount: 1 });
  });
});

describe("名前の絞り込み", () => {
  const staffs = [{ name: "佐藤 花子" }, { name: "鈴木 次郎" }, { name: "Ｊｏｈｎ Smith" }];

  it("検索語が空か空白だけなら、全員を返す", () => {
    expect(filterStaffsByName(staffs, "")).toEqual(staffs);
    expect(filterStaffsByName(staffs, "　 ")).toEqual(staffs);
  });

  it("名前に検索語を含むスタッフだけを返す", () => {
    expect(filterStaffsByName(staffs, "鈴木")).toEqual([{ name: "鈴木 次郎" }]);
    expect(filterStaffsByName(staffs, "山田")).toEqual([]);
  });

  it("空白の有無、全角と半角、大文字と小文字の違いを区別しない", () => {
    expect(filterStaffsByName(staffs, "佐藤花子")).toEqual([{ name: "佐藤 花子" }]);
    expect(filterStaffsByName(staffs, "佐藤　花")).toEqual([{ name: "佐藤 花子" }]);
    expect(filterStaffsByName(staffs, "john smith")).toEqual([{ name: "Ｊｏｈｎ Smith" }]);
  });
});
