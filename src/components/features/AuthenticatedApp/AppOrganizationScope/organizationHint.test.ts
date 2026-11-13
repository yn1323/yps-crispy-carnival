import { describe, expect, it } from "vitest";
import {
  APP_ORGANIZATION_HINT_STORAGE_KEY,
  clearAppOrganizationHint,
  readAppOrganizationHint,
  writeAppOrganizationHint,
} from "./organizationHint";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

const brokenStorage = {
  getItem: () => {
    throw new Error("storage is blocked");
  },
  setItem: () => {
    throw new Error("storage is blocked");
  },
  removeItem: () => {
    throw new Error("storage is blocked");
  },
};

describe("organizationHint", () => {
  it("保存した組織IDを読み、破棄後は読めない", () => {
    const storage = createStorage();

    writeAppOrganizationHint(storage, "organization-a");
    expect(readAppOrganizationHint(storage)).toBe("organization-a");

    clearAppOrganizationHint(storage);
    expect(readAppOrganizationHint(storage)).toBeUndefined();
  });

  it("空の値と長すぎる値はhintにしない", () => {
    expect(readAppOrganizationHint(createStorage({ [APP_ORGANIZATION_HINT_STORAGE_KEY]: "" }))).toBeUndefined();
    expect(
      readAppOrganizationHint(createStorage({ [APP_ORGANIZATION_HINT_STORAGE_KEY]: "a".repeat(257) })),
    ).toBeUndefined();
  });

  it("storageを使えない環境ではhintなしとして扱い、例外を出さない", () => {
    expect(readAppOrganizationHint(null)).toBeUndefined();
    expect(readAppOrganizationHint(brokenStorage)).toBeUndefined();
    expect(() => writeAppOrganizationHint(brokenStorage, "organization-a")).not.toThrow();
    expect(() => clearAppOrganizationHint(brokenStorage)).not.toThrow();
  });
});
