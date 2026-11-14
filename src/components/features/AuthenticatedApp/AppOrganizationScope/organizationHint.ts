export const APP_ORGANIZATION_HINT_STORAGE_KEY = "shiftori-app-organization-hint:v1";

const MAX_ORGANIZATION_ID_LENGTH = 256;

/**
 * 前回開いた組織のIDを読む。
 * URLに組織がない起動で組織解決の往復を省くためのclient hintであり、認可には使わない。
 */
export function readAppOrganizationHint(storage: Pick<Storage, "getItem"> | null | undefined): string | undefined {
  if (!storage) return undefined;
  try {
    const value = storage.getItem(APP_ORGANIZATION_HINT_STORAGE_KEY);
    return value && value.length <= MAX_ORGANIZATION_ID_LENGTH ? value : undefined;
  } catch {
    return undefined;
  }
}

export function writeAppOrganizationHint(
  storage: Pick<Storage, "setItem"> | null | undefined,
  organizationId: string,
): void {
  if (!storage) return;
  try {
    storage.setItem(APP_ORGANIZATION_HINT_STORAGE_KEY, organizationId);
  } catch {
    // 保存できない環境では、次回の起動で通常の組織解決へ戻る。
  }
}

export function clearAppOrganizationHint(storage: Pick<Storage, "removeItem"> | null | undefined): void {
  if (!storage) return;
  try {
    storage.removeItem(APP_ORGANIZATION_HINT_STORAGE_KEY);
  } catch {
    // 削除できなくても、serverの検証で使えないhintは毎回破棄される。
  }
}

export function resolveBrowserLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
