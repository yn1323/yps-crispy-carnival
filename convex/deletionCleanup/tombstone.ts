import type { GenericId } from "convex/values";

export function deletedLineUserId(id: GenericId<string>) {
  return `deleted:${id}`;
}
