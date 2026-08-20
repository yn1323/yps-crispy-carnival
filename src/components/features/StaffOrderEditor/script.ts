import { arrayMove } from "@dnd-kit/sortable";
import type { Id } from "@/convex/_generated/dataModel";
import type { StaffOrderEditorSnapshot, StaffOrderPerson } from "./types";

export function reorderStaffOrderPeople(
  people: readonly StaffOrderPerson[],
  activePersonId: string,
  overPersonId: string,
): StaffOrderPerson[] {
  const activeIndex = people.findIndex((person) => person.personId === activePersonId);
  const overIndex = people.findIndex((person) => person.personId === overPersonId);
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return [...people];
  return arrayMove([...people], activeIndex, overIndex);
}

export function areStaffOrderPersonIdsEqual(
  current: readonly Id<"organizationPeople">[],
  baseline: readonly Id<"organizationPeople">[],
): boolean {
  return current.length === baseline.length && current.every((personId, index) => personId === baseline[index]);
}

export function buildStaffOrderEditorVersionKey(editor: StaffOrderEditorSnapshot): string {
  return JSON.stringify({
    availability: editor.availability,
    orderFingerprint: editor.orderFingerprint,
    canWrite: editor.canWrite,
    writeDisabledReason: editor.writeDisabledReason ?? null,
    people: editor.people.map((person) => ({
      personId: person.personId,
      name: person.name,
      email: person.email,
      shopNames: person.shopNames,
    })),
  });
}
