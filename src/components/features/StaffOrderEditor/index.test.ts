import { describe, expect, it } from "vitest";
import type { StaffOrderPerson } from ".";
import { reorderStaffOrderPeople } from ".";

const people = [
  { personId: "person-a", name: "A", email: null, shopNames: [] },
  { personId: "person-b", name: "B", email: null, shopNames: [] },
  { personId: "person-c", name: "C", email: null, shopNames: [] },
] as unknown as StaffOrderPerson[];

describe("reorderStaffOrderPeople", () => {
  it("drag対象をdrop先の位置へ移し、元配列は変更しない", () => {
    const result = reorderStaffOrderPeople(people, "person-c", "person-a");

    expect(result.map((person) => person.personId)).toEqual(["person-c", "person-a", "person-b"]);
    expect(people.map((person) => person.personId)).toEqual(["person-a", "person-b", "person-c"]);
  });

  it("対象または移動先が存在しない場合は同じ順番のcopyを返す", () => {
    const result = reorderStaffOrderPeople(people, "outside", "person-a");

    expect(result).not.toBe(people);
    expect(result).toEqual(people);
  });
});
