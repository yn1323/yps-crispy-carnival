import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getE2EActorPool,
  getE2EClerkUserForActor,
  getE2EClerkUserForIndex,
  getE2EClerkUsers,
  getE2EMultiActorWorkerCount,
  getE2EWorkerCount,
  parseE2EClerkUserEmails,
} from "../e2e/helpers/e2eUsers";

const E2E_USERS = [
  "e2e-1@example.com",
  "e2e-2@example.com",
  "e2e-3@example.com",
  "e2e-4@example.com",
  "e2e-5@example.com",
  "e2e-6@example.com",
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("E2Eユーザー設定", () => {
  it("カンマ区切りの6ユーザーを正規化する", () => {
    expect(parseE2EClerkUserEmails(` ${E2E_USERS.join(" , ")} `)).toEqual(E2E_USERS);
  });

  it.each([
    ["5ユーザー", E2E_USERS.slice(0, 5).join(",")],
    ["7ユーザー", [...E2E_USERS, "e2e-7@example.com"].join(",")],
  ])("%sを拒否する", (_label, raw) => {
    expect(() => parseE2EClerkUserEmails(raw)).toThrow("E2E_CLERK_USERS must contain exactly 6 comma-separated users.");
  });

  it("大文字小文字に関係なく重複ユーザーを拒否する", () => {
    expect(() => parseE2EClerkUserEmails([...E2E_USERS.slice(0, 5), E2E_USERS[0].toUpperCase()].join(","))).toThrow(
      "E2E_CLERK_USERS must not contain duplicate users.",
    );
  });

  it("空のユーザーを拒否する", () => {
    expect(() => parseE2EClerkUserEmails([...E2E_USERS.slice(0, 5), ""].join(","))).toThrow(
      "E2E_CLERK_USERS must not contain empty users.",
    );
  });

  it("廃止済みtesttestユーザーを大文字小文字に関係なく拒否する", () => {
    const users = [...E2E_USERS.slice(0, 5), "retired-TestTest@example.com"];

    expect(() => parseE2EClerkUserEmails(users.join(","))).toThrow(
      "E2E_CLERK_USERS must not include the retired testtest user.",
    );
  });
});

describe("E2E actor pool", () => {
  it("6ユーザーを3人ずつの2プールへ固定配置する", () => {
    vi.stubEnv("E2E_CLERK_USERS", E2E_USERS.join(","));

    expect(getE2EActorPool(0)).toEqual({
      index: 0,
      A: expect.objectContaining({ index: 0, email: E2E_USERS[0] }),
      B: expect.objectContaining({ index: 1, email: E2E_USERS[1] }),
      C: expect.objectContaining({ index: 2, email: E2E_USERS[2] }),
    });
    expect(getE2EActorPool(1)).toEqual({
      index: 1,
      A: expect.objectContaining({ index: 3, email: E2E_USERS[3] }),
      B: expect.objectContaining({ index: 4, email: E2E_USERS[4] }),
      C: expect.objectContaining({ index: 5, email: E2E_USERS[5] }),
    });
    expect(getE2EClerkUserForActor("B", 1)).toEqual(expect.objectContaining({ index: 4, email: E2E_USERS[4] }));
  });

  it.each([-1, 2, 0.5])("範囲外のpool index %sを丸めず拒否する", (poolIndex) => {
    vi.stubEnv("E2E_CLERK_USERS", E2E_USERS.join(","));

    expect(() => getE2EActorPool(poolIndex)).toThrow(
      `E2E actor pool index must be an integer between 0 and 1: ${poolIndex}`,
    );
  });

  it("通常E2Eのuser indexは従来どおり6ユーザー内で循環させる", () => {
    vi.stubEnv("E2E_CLERK_USERS", E2E_USERS.join(","));

    expect(getE2EClerkUserForIndex(6)).toEqual(expect.objectContaining({ index: 0, email: E2E_USERS[0] }));
    expect(getE2EClerkUserForIndex(7)).toEqual(expect.objectContaining({ index: 1, email: E2E_USERS[1] }));
  });

  it("通常E2Eは6 worker、multi-actor E2Eは2 workerを返す", () => {
    vi.stubEnv("E2E_CLERK_USERS", E2E_USERS.join(","));

    expect(getE2EWorkerCount()).toBe(6);
    expect(getE2EMultiActorWorkerCount()).toBe(2);
  });

  it("6ユーザーのstorageStateとmetadataを別ファイルへ保存する", () => {
    vi.stubEnv("E2E_CLERK_USERS", E2E_USERS.join(","));

    const users = getE2EClerkUsers();
    expect(new Set(users.map((user) => user.storageStatePath)).size).toBe(6);
    expect(new Set(users.map((user) => user.metaPath)).size).toBe(6);
  });
});
