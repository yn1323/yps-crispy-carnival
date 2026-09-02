import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCurrentE2EClerkUserIndex,
  getE2EClerkUserForIndex,
  getE2EClerkUserForWorker,
  getE2EClerkUsers,
  getE2ECoreClerkUsers,
  getE2EReservedMultiActorClerkUserForWorker,
  getE2EReservedMultiActorClerkUsers,
  getE2EWorkerCount,
  parseE2EClerkUserEmails,
  setCurrentE2EClerkUserIndex,
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
  delete process.env.E2E_CURRENT_USER_INDEX;
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

describe("E2Eユーザー所有権", () => {
  it("通常用0〜2と重ならない3〜5をmulti-actor用へ固定配置する", () => {
    vi.stubEnv("E2E_CLERK_USERS", E2E_USERS.join(","));

    expect(getE2ECoreClerkUsers().map((user) => user.index)).toEqual([0, 1, 2]);
    expect(getE2EReservedMultiActorClerkUsers().map((user) => user.index)).toEqual([3, 4, 5]);
  });

  it("通常E2Eのuser indexは従来どおり6ユーザー内で循環させる", () => {
    vi.stubEnv("E2E_CLERK_USERS", E2E_USERS.join(","));

    expect(getE2EClerkUserForIndex(6)).toEqual(expect.objectContaining({ index: 0, email: E2E_USERS[0] }));
    expect(getE2EClerkUserForIndex(7)).toEqual(expect.objectContaining({ index: 1, email: E2E_USERS[1] }));
  });

  it.each([1, 2, 3])("%s workerでparallelIndexと通常用ユーザーを固定対応させる", (workerCount) => {
    vi.stubEnv("E2E_CLERK_USERS", E2E_USERS.join(","));

    expect(
      Array.from({ length: workerCount }, (_, index) => getE2EClerkUserForWorker(index, workerCount).index),
    ).toEqual(Array.from({ length: workerCount }, (_, index) => index));
  });

  it.each([1, 2, 3])("%s workerでparallelIndexとlogout専用ユーザーを固定対応させる", (workerCount) => {
    vi.stubEnv("E2E_CLERK_USERS", E2E_USERS.join(","));

    expect(
      Array.from(
        { length: workerCount },
        (_, index) => getE2EReservedMultiActorClerkUserForWorker(index, workerCount).index,
      ),
    ).toEqual(Array.from({ length: workerCount }, (_, index) => index + 3));
  });

  it.each([0, 4, 7])("logout専用3ユーザーの範囲外となるworker数 %s を拒否する", (workerCount) => {
    vi.stubEnv("E2E_CLERK_USERS", E2E_USERS.join(","));

    expect(() => getE2EReservedMultiActorClerkUserForWorker(0, workerCount)).toThrow(
      `E2E worker count must be an integer between 1 and 3: ${workerCount}`,
    );
  });

  it.each([0, 4, 7])("通常用3ユーザーの範囲外となるworker数 %s を拒否する", (workerCount) => {
    vi.stubEnv("E2E_CLERK_USERS", E2E_USERS.join(","));

    expect(() => getE2EClerkUserForWorker(0, workerCount)).toThrow(
      `E2E worker count must be an integer between 1 and 3: ${workerCount}`,
    );
  });

  it("未指定時の通常E2Eは3 workerを返す", () => {
    vi.stubEnv("E2E_CLERK_USERS", E2E_USERS.join(","));

    expect(getE2EWorkerCount()).toBe(3);
  });

  it("通常E2EだけをE2E_WORKERSで3 workerへ減らせる", () => {
    vi.stubEnv("E2E_CLERK_USERS", E2E_USERS.join(","));
    vi.stubEnv("E2E_WORKERS", "3");

    expect(getE2EWorkerCount()).toBe(3);
  });

  it.each(["0", "4", "7", "1.5", "not-a-number"])("通常用3ユーザーの範囲外のE2E_WORKERS=%sを拒否する", (raw) => {
    vi.stubEnv("E2E_CLERK_USERS", E2E_USERS.join(","));

    expect(() => getE2EWorkerCount(raw)).toThrow(`E2E_WORKERS must be an integer between 1 and 3: ${raw}`);
  });

  it("worker数を減らしても現在のユーザーindexを6ユーザー内で保持する", () => {
    vi.stubEnv("E2E_CLERK_USERS", E2E_USERS.join(","));
    vi.stubEnv("E2E_WORKERS", "3");

    setCurrentE2EClerkUserIndex(4);

    expect(getCurrentE2EClerkUserIndex()).toBe(4);
  });

  it("6ユーザーのstorageStateとmetadataを別ファイルへ保存する", () => {
    vi.stubEnv("E2E_CLERK_USERS", E2E_USERS.join(","));

    const users = getE2EClerkUsers();
    expect(new Set(users.map((user) => user.storageStatePath)).size).toBe(6);
    expect(new Set(users.map((user) => user.metaPath)).size).toBe(6);
    expect(getE2ECoreClerkUsers().map((user) => user.index)).toEqual([0, 1, 2]);
  });
});
