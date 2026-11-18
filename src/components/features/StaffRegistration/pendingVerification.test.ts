import { describe, expect, it } from "vitest";
import {
  canReusePendingVerification,
  type PendingStaffRegistrationVerification,
  readPendingVerification,
  writePendingVerification,
} from "./pendingVerification";

const NOW = 1_800_000_000_000;
const REGISTRATION_TOKEN = "718cf80f-d4fb-4a5d-bf20-ad48044f31eb";
const pending: PendingStaffRegistrationVerification = {
  name: "田中 花子",
  email: "hanako@example.com",
  verificationToken: "3f0c6a51-2b1f-4f0e-9d53-6c1f3b1a7a10",
  resendAvailableAt: NOW + 60_000,
  codeExpiresAt: NOW + 600_000,
};

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function storedValues(storage: Storage): string[] {
  return Array.from({ length: storage.length }, (_, index) => storage.getItem(storage.key(index) ?? "") ?? "");
}

describe("確認コードの入力待ちの保存", () => {
  it("保存した入力待ちを、同じ登録linkでだけ復元する", () => {
    const storage = createStorage();

    writePendingVerification(storage, REGISTRATION_TOKEN, pending);

    expect(readPendingVerification(storage, REGISTRATION_TOKEN, NOW)).toEqual(pending);
    expect(readPendingVerification(storage, "another-registration-token", NOW)).toBeNull();
  });

  it("再送の上限に達したことも、再読み込みをまたいで復元する", () => {
    const storage = createStorage();
    const limited = { ...pending, sendLimitReached: true };

    writePendingVerification(storage, REGISTRATION_TOKEN, limited);

    expect(readPendingVerification(storage, REGISTRATION_TOKEN, NOW)).toEqual(limited);
  });

  it("確認コードの期限の直前までは復元し、期限ちょうどからは復元せずに保存値を消す", () => {
    const storage = createStorage();
    writePendingVerification(storage, REGISTRATION_TOKEN, pending);

    expect(readPendingVerification(storage, REGISTRATION_TOKEN, pending.codeExpiresAt - 1)).toEqual(pending);
    expect(readPendingVerification(storage, REGISTRATION_TOKEN, pending.codeExpiresAt)).toBeNull();
    expect(storedValues(storage)).toEqual([]);
  });

  it.each([
    ["JSONではない値", "{"],
    ["引換tokenがない値", JSON.stringify({ ...pending, verificationToken: undefined })],
    ["時刻が数値ではない値", JSON.stringify({ ...pending, codeExpiresAt: "soon" })],
    ["配列", JSON.stringify([pending])],
  ])("%sは復元しない", (_label, raw) => {
    const storage = createStorage();
    writePendingVerification(storage, REGISTRATION_TOKEN, pending);
    const key = storage.key(0) ?? "";
    storage.setItem(key, raw);

    expect(readPendingVerification(storage, REGISTRATION_TOKEN, NOW)).toBeNull();
  });

  it("nullを書くと保存値を消し、保存領域がなくても例外にしない", () => {
    const storage = createStorage();
    writePendingVerification(storage, REGISTRATION_TOKEN, pending);

    writePendingVerification(storage, REGISTRATION_TOKEN, null);

    expect(storedValues(storage)).toEqual([]);
    expect(() => writePendingVerification(null, REGISTRATION_TOKEN, pending)).not.toThrow();
    expect(readPendingVerification(null, REGISTRATION_TOKEN, NOW)).toBeNull();
  });
});

describe("canReusePendingVerification", () => {
  it("名前が同じで、メールアドレスが表記だけ違う場合は、届いている確認コードを使える", () => {
    expect(canReusePendingVerification(pending, { name: "田中 花子", email: " Hanako@Example.com " }, NOW)).toBe(true);
  });

  it.each([
    ["入力待ちがない", null, { name: pending.name, email: pending.email }, NOW],
    ["名前を直した", pending, { name: "田中 華子", email: pending.email }, NOW],
    ["メールアドレスを直した", pending, { name: pending.name, email: "hanako@example.org" }, NOW],
    ["確認コードの期限が切れた", pending, { name: pending.name, email: pending.email }, pending.codeExpiresAt],
    ["再送の上限に達した", { ...pending, sendLimitReached: true }, { name: pending.name, email: pending.email }, NOW],
  ] as const)("%s場合は使い回さず、確認コードを送り直す", (_label, current, input, now) => {
    expect(canReusePendingVerification(current, input, now)).toBe(false);
  });
});
