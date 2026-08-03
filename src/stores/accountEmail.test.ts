// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("accountEmailCleanupSessionAtom storage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.resetModules();
  });

  it("再読み込み時に削除対象と想定primaryを復元する", async () => {
    sessionStorage.setItem(
      "account-email-cleanup-session",
      JSON.stringify({
        clerkUserId: "user-account-email",
        kind: "oldPrimary",
        emailAddressId: "email-old",
        primaryEmailAddressId: "email-new",
      }),
    );

    const [{ createStore }, { accountEmailCleanupSessionAtom }] = await Promise.all([
      import("jotai"),
      import("./accountEmail"),
    ]);

    expect(createStore().get(accountEmailCleanupSessionAtom)).toEqual({
      clerkUserId: "user-account-email",
      kind: "oldPrimary",
      emailAddressId: "email-old",
      primaryEmailAddressId: "email-new",
    });
  });

  it("不正な保存値は復元しない", async () => {
    sessionStorage.setItem(
      "account-email-cleanup-session",
      JSON.stringify({
        clerkUserId: "user-account-email",
        kind: "oldPrimary",
        emailAddressId: "email-old",
      }),
    );

    const [{ createStore }, { accountEmailCleanupSessionAtom }] = await Promise.all([
      import("jotai"),
      import("./accountEmail"),
    ]);

    expect(createStore().get(accountEmailCleanupSessionAtom)).toBeNull();
  });
});
