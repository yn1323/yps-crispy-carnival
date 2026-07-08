export type SortDirection = "asc" | "desc";

export type SortState<Key extends string> = {
  key: Key;
  direction: SortDirection;
};

export type SortValue = string | number | null | undefined;

export function finiteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function nextSort<Key extends string>(
  current: SortState<Key>,
  key: Key,
  defaultDirection: SortDirection = "desc",
): SortState<Key> {
  if (current.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: defaultDirection };
}

export function compareSortValues(a: SortValue, b: SortValue, direction: SortDirection) {
  const aValue = a ?? null;
  const bValue = b ?? null;
  if (aValue === null && bValue === null) return 0;
  if (aValue === null) return 1;
  if (bValue === null) return -1;

  if (typeof aValue === "string" || typeof bValue === "string") {
    const result = String(aValue).localeCompare(String(bValue), "ja-JP");
    return direction === "asc" ? result : -result;
  }

  const result = aValue - bValue;
  return direction === "asc" ? result : -result;
}

export function sortRowsBy<T, Key extends string>(
  rows: T[],
  sort: SortState<Key>,
  getValue: (row: T, key: Key) => SortValue,
  fallback?: (a: T, b: T) => number,
) {
  return [...rows].sort((a, b) => {
    const result = compareSortValues(getValue(a, sort.key), getValue(b, sort.key), sort.direction);
    return result || fallback?.(a, b) || 0;
  });
}
