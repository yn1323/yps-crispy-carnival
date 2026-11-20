import { describe, expect, it } from "vitest";
import type { PositionType, StaffType } from "@/src/domains/shift/types";
import { buildNameSkillMark, resolveNameSkillPosition } from "./skillPresentation";

const hall: PositionType = { id: "hall", name: "ホール", color: "#0d9488", isDefault: true };
const kitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#f97316", isDefault: false };
const register: PositionType = { id: "register", name: "レジ", color: "#3b82f6", isDefault: false };

// ホールではリーダー、キッチンでは見習い、レジは担当外。
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
  it("ポジションが2つ以上の店舗では、担当外にだけ、ポジションの名前と色を添えて出す。リーダーと見習いには出さない", () => {
    const marks = [hall, kitchen, register].map((position) =>
      buildNameSkillMark({ staff, position, positionCount: 3 }),
    );

    expect(marks).toEqual([
      null,
      null,
      {
        level: "unavailable",
        label: "担当外",
        position: { name: "レジ", color: "#3b82f6" },
        title: "レジは担当外です",
      },
    ]);
  });

  it("ポジションが1つの店舗では、担当外にポジションの名前と色を添えない", () => {
    expect(buildNameSkillMark({ staff, position: register, positionCount: 1 })).toEqual({
      level: "unavailable",
      label: "担当外",
      position: null,
      title: null,
    });
  });

  it("そのポジションでリーダーのスタッフには出さない", () => {
    expect(buildNameSkillMark({ staff, position: hall, positionCount: 1 })).toBeNull();
  });

  it("そのポジションで見習いのスタッフには出さない", () => {
    expect(buildNameSkillMark({ staff, position: kitchen, positionCount: 1 })).toBeNull();
  });

  it("そのポジションで一人前のスタッフには出さない", () => {
    const drink: PositionType = { id: "drink", name: "ドリンク", color: "#111111", isDefault: false };

    expect(buildNameSkillMark({ staff, position: drink, positionCount: 4 })).toBeNull();
    expect(buildNameSkillMark({ staff: {}, position: hall, positionCount: 3 })).toBeNull();
  });

  it("根拠にするポジションがない表示では出さない", () => {
    expect(buildNameSkillMark({ staff, position: null, positionCount: 3 })).toBeNull();
  });
});
