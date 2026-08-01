export const DEFAULT_USER_LIST_COUNT = 10;
export const USER_LIST_PAGE_SIZE = 10;

const MAX_USER_LIST_COUNT = 200;
const MAX_FOCUSED_USER_ID_LENGTH = 128;

export function parseUserListCount(value: unknown): number | undefined {
  const count = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  if (
    !Number.isInteger(count) ||
    count <= DEFAULT_USER_LIST_COUNT ||
    count > MAX_USER_LIST_COUNT ||
    count % USER_LIST_PAGE_SIZE !== 0
  ) {
    return undefined;
  }

  return count;
}

export function parseFocusedUserId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const focusedUserId = value.trim();
  return focusedUserId.length > 0 && focusedUserId.length <= MAX_FOCUSED_USER_ID_LENGTH ? focusedUserId : undefined;
}

export function toUserListCountSearch(count: number): number | undefined {
  return parseUserListCount(count);
}

export function parseUserListSearch(search: Record<string, unknown>) {
  const users = parseUserListCount(search.users);
  const focus = parseFocusedUserId(search.focus);
  return {
    ...(users ? { users } : {}),
    ...(focus ? { focus } : {}),
  };
}

export function updateUserListSearch<T extends Record<string, unknown>>(
  previous: T,
  update: { count: number; focus?: string },
) {
  const users = parseUserListCount(update.count);
  const focus = parseFocusedUserId(update.focus);

  return {
    ...previous,
    users,
    focus,
  };
}
