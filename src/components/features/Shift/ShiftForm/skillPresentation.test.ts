import { describe, expect, it } from "vitest";
import type { PositionType, StaffType } from "@/src/domains/shift/types";
import { buildNameSkillMark, buildSegmentSkillMark, resolveNameSkillPosition } from "./skillPresentation";

const hall: PositionType = { id: "hall", name: "ホール", color: "#0d9488", isDefault: true };
const kitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#f97316", isDefault: false };
const register: PositionType = { id: "register", name: "レジ", color: "#3b82f6", isDefault: false };

// ホールでは責任者、キッチンでは新人、レジには入れない。
const staff: Pick<StaffType, "positionSkills"> = {
  positionSkills: [
    { positionId: hall.id, level: "lead" },
    { positionId: kitchen.id, level: "newcomer" },
    { positionId: register.id, level: "unavailable" },
  ],
};

describe("resolveNameSkillPosition", () => {
  const editing = {
    positions: [hall, kitchen, register],
    selectedPositionId: null,
    isToolPaletteActive: true,
    isBreakToolActive: false,
    isConfirmedDisplay: false,
  };

  it("「入れるもの」で選んでいるポジションを返す", () => {
    expect(resolveNameSkillPosition({ ...editing, selectedPositionId: kitchen.id })).toEqual(kitchen);
  });

  it("選んでいなければ、既定のポジションを返す", () => {
    expect(resolveNameSkillPosition({ ...editing, positions: [kitchen, hall] })).toEqual(hall);
  });

  it("選んでいたポジションが店舗からなくなった場合は、既定のポジションを返す", () => {
    expect(resolveNameSkillPosition({ ...editing, selectedPositionId: "deleted" })).toEqual(hall);
  });

  it("ポジションが1つの店舗は、選択にかかわらず、そのポジションを返す", () => {
    expect(resolveNameSkillPosition({ ...editing, positions: [kitchen], selectedPositionId: hall.id })).toEqual(
      kitchen,
    );
  });

  it("「入れるもの」がない表示（シンプル表示、閲覧専用）ではnullを返す", () => {
    expect(
      resolveNameSkillPosition({ ...editing, selectedPositionId: kitchen.id, isToolPaletteActive: false }),
    ).toBeNull();
  });

  it("休憩を選んでいる間はnullを返す", () => {
    expect(
      resolveNameSkillPosition({ ...editing, selectedPositionId: kitchen.id, isBreakToolActive: true }),
    ).toBeNull();
  });

  it("スタッフ向けの確定シフト表示ではnullを返す", () => {
    expect(resolveNameSkillPosition({ ...editing, isConfirmedDisplay: true })).toBeNull();
  });

  it("ポジションがない場合はnullを返す", () => {
    expect(resolveNameSkillPosition({ ...editing, positions: [] })).toBeNull();
  });
});

describe("buildNameSkillMark", () => {
  it("ポジションが2つ以上の店舗では、そのポジションでの値に、ポジションの名前と色を添える", () => {
    const marks = [hall, kitchen, register].map((position) =>
      buildNameSkillMark({ staff, position, positionCount: 3 }),
    );

    expect(marks).toEqual([
      {
        level: "lead",
        label: "責任者",
        position: { name: "ホール", color: "#0d9488" },
        title: "ホールでは責任者です",
      },
      {
        level: "newcomer",
        label: "新人",
        position: { name: "キッチン", color: "#f97316" },
        title: "キッチンでは新人です",
      },
      {
        level: "unavailable",
        label: "入れない",
        position: { name: "レジ", color: "#3b82f6" },
        title: "レジには入れません",
      },
    ]);
  });

  it("ポジションが1つの店舗では、ポジションの名前と色を添えない", () => {
    expect(buildNameSkillMark({ staff, position: kitchen, positionCount: 1 })).toEqual({
      level: "newcomer",
      label: "新人",
      position: null,
      title: null,
    });
  });

  it("そのポジションで標準のスタッフには出さない", () => {
    const drink: PositionType = { id: "drink", name: "ドリンク", color: "#111111", isDefault: false };

    expect(buildNameSkillMark({ staff, position: drink, positionCount: 4 })).toBeNull();
    expect(buildNameSkillMark({ staff: {}, position: hall, positionCount: 3 })).toBeNull();
  });

  it("根拠にするポジションがない表示では出さない", () => {
    expect(buildNameSkillMark({ staff, position: null, positionCount: 3 })).toBeNull();
  });
});

describe("buildSegmentSkillMark", () => {
  const segmentOf = (position: PositionType) => ({ positionId: position.id, positionName: position.name });

  it("区間のポジションで新人なら「新」、責任者なら「責」を返す", () => {
    expect(buildSegmentSkillMark(staff, segmentOf(kitchen))).toEqual({
      level: "newcomer",
      label: "新",
      hiddenSuffix: "人",
      title: "キッチンでは新人です",
    });
    expect(buildSegmentSkillMark(staff, segmentOf(hall))).toEqual({
      level: "lead",
      label: "責",
      hiddenSuffix: "任者",
      title: "ホールでは責任者です",
    });
  });

  it("区間のポジションで標準の勤務と、入れないポジションの勤務には出さない", () => {
    expect(buildSegmentSkillMark(staff, { positionId: "drink", positionName: "ドリンク" })).toBeNull();
    expect(buildSegmentSkillMark(staff, segmentOf(register))).toBeNull();
  });

  it("スタッフか区間が分からない場合は出さない", () => {
    expect(buildSegmentSkillMark(undefined, segmentOf(kitchen))).toBeNull();
    expect(buildSegmentSkillMark(staff, undefined)).toBeNull();
  });
});
