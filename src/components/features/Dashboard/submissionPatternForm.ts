import type { ShiftTypeOption } from "@/convex/shop/schemas";

export const DIALOG_SELECT_POSITIONING = { strategy: "fixed" as const, hideWhenDetached: true, sameWidth: true };

const DEFAULT_SHIFT_TYPE_OPTIONS: ShiftTypeOption[] = [
  { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
  { id: "late", name: "遅番", startTime: "15:00", endTime: "21:00", sortOrder: 1 },
];

export const createDefaultShiftTypeOptions = (): ShiftTypeOption[] =>
  DEFAULT_SHIFT_TYPE_OPTIONS.map((option) => ({ ...option }));

export const createShiftTypeOption = (index: number): ShiftTypeOption => ({
  id: `shift-type-${Date.now()}-${index}`,
  name: "",
  startTime: "09:00",
  endTime: "18:00",
  sortOrder: index,
});

export const normalizeShiftTypeOptions = (options: ShiftTypeOption[]): ShiftTypeOption[] =>
  options.map((option, index) => ({ ...option, sortOrder: index }));

export function getNestedErrorMessage(error: unknown, path: Array<string | number>): string | undefined {
  let current: unknown = error;
  for (const segment of path) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[segment];
  }
  if (current == null || typeof current !== "object") return undefined;
  const message = (current as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

export function getShiftTypeOptionErrorMessages(error: unknown, index: number): string[] {
  return Array.from(
    new Set(
      ["name", "startTime", "endTime", "id"]
        .map((field) => getNestedErrorMessage(error, ["options", index, field]))
        .filter((message): message is string => !!message),
    ),
  );
}
