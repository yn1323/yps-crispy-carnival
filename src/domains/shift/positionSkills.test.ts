import { describe, expect, it } from "vitest";
import { collectNewcomerStaffIdsByPositionId, getPositionSkill } from "./positionSkills";
import type { StaffPositionSkill } from "./types";

const HALL = "hall";
const KITCHEN = "kitchen";
const REGISTER = "register";

describe("getPositionSkill", () => {
  const positionSkills: StaffPositionSkill[] = [
    { positionId: HALL, level: "lead" },
    { positionId: KITCHEN, level: "newcomer" },
    { positionId: REGISTER, level: "unavailable" },
  ];

  it("ポジションごとに設定した値（責任者、新人、入れない）を返す", () => {
    const staff = { positionSkills };

    expect([HALL, KITCHEN, REGISTER].map((positionId) => getPositionSkill(staff, positionId))).toEqual([
      "lead",
      "newcomer",
      "unavailable",
    ]);
  });

  it("値のないポジションは標準を返す", () => {
    expect(getPositionSkill({ positionSkills }, "drink")).toBe("standard");
  });

  it("ポジションの値を1つも持たないスタッフは、どのポジションでも標準を返す", () => {
    expect(getPositionSkill({}, HALL)).toBe("standard");
    expect(getPositionSkill({ positionSkills: [] }, HALL)).toBe("standard");
  });

  it("スタッフが分からない場合は標準を返す", () => {
    expect(getPositionSkill(undefined, HALL)).toBe("standard");
  });
});

describe("collectNewcomerStaffIdsByPositionId", () => {
  const toPlain = (result: Map<string, Set<string>>) =>
    [...result].map(([positionId, staffIds]) => [positionId, [...staffIds].sort()]);

  it("そのポジションで新人のスタッフだけを、ポジションごとに集める", () => {
    const result = collectNewcomerStaffIdsByPositionId([
      {
        id: "a",
        positionSkills: [
          { positionId: KITCHEN, level: "newcomer" },
          { positionId: HALL, level: "lead" },
        ],
      },
      { id: "b", positionSkills: [{ positionId: KITCHEN, level: "newcomer" }] },
      { id: "c", positionSkills: [{ positionId: HALL, level: "newcomer" }] },
      { id: "d", positionSkills: [{ positionId: KITCHEN, level: "unavailable" }] },
      { id: "e" },
    ]);

    expect(toPlain(result)).toEqual([
      [KITCHEN, ["a", "b"]],
      [HALL, ["c"]],
    ]);
  });

  it("削除済みのスタッフは含めない", () => {
    const result = collectNewcomerStaffIdsByPositionId([
      { id: "removed", isRemoved: true, positionSkills: [{ positionId: HALL, level: "newcomer" }] },
      { id: "active", positionSkills: [{ positionId: HALL, level: "newcomer" }] },
    ]);

    expect(toPlain(result)).toEqual([[HALL, ["active"]]]);
  });

  it("新人が1人もいなければ、空の結果を返す", () => {
    const result = collectNewcomerStaffIdsByPositionId([
      { id: "a", positionSkills: [{ positionId: HALL, level: "lead" }] },
      { id: "b" },
    ]);

    expect(result.size).toBe(0);
  });
});
