import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { reorderStaffOrderPersonIds } from "./staffOrder";

const personA = "person-a" as Id<"organizationPeople">;
const personB = "person-b" as Id<"organizationPeople">;
const personC = "person-c" as Id<"organizationPeople">;

describe("reorderStaffOrderPersonIds", () => {
  it.each([
    {
      label: "前のスタッフを後ろへ移す",
      activePersonId: personA,
      overPersonId: personC,
      expected: [personB, personC, personA],
    },
    {
      label: "後ろのスタッフを前へ移す",
      activePersonId: personC,
      overPersonId: personA,
      expected: [personC, personA, personB],
    },
  ])("$labelとき、入力を変更せず対象をドロップ位置へ移す", ({ activePersonId, overPersonId, expected }) => {
    const personIds = [personA, personB, personC];

    const result = reorderStaffOrderPersonIds(personIds, activePersonId, overPersonId);

    expect(result).toEqual(expected);
    expect(personIds).toEqual([personA, personB, personC]);
    expect(result).not.toBe(personIds);
  });

  it.each([
    { label: "移動元が不明", activePersonId: "unknown", overPersonId: personB },
    { label: "移動先が不明", activePersonId: personB, overPersonId: "unknown" },
    { label: "移動元と移動先が同じ", activePersonId: personB, overPersonId: personB },
  ])("$labelなとき、同じ並びのcopyを返す", ({ activePersonId, overPersonId }) => {
    const personIds = [personA, personB, personC];

    const result = reorderStaffOrderPersonIds(personIds, activePersonId, overPersonId);

    expect(result).toEqual(personIds);
    expect(result).not.toBe(personIds);
  });
});
