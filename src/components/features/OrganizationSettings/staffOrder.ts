import { arrayMove } from "@dnd-kit/sortable";
import type { Id } from "@/convex/_generated/dataModel";

export function reorderStaffOrderPersonIds(
  personIds: readonly Id<"organizationPeople">[],
  activePersonId: string,
  overPersonId: string,
): Id<"organizationPeople">[] {
  const activeIndex = personIds.indexOf(activePersonId as Id<"organizationPeople">);
  const overIndex = personIds.indexOf(overPersonId as Id<"organizationPeople">);
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return [...personIds];
  return arrayMove([...personIds], activeIndex, overIndex);
}

export function orderPeopleByPersonIds<T extends { id: string }>(
  people: readonly T[],
  personIds: readonly string[],
): T[] {
  const peopleById = new Map(people.map((person) => [person.id, person] as const));
  const orderedPeople = personIds.flatMap((personId) => {
    const person = peopleById.get(personId);
    return person ? [person] : [];
  });
  const orderedPersonIds = new Set(personIds);
  return [...orderedPeople, ...people.filter((person) => !orderedPersonIds.has(person.id))];
}
