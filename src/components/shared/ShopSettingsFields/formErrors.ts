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
