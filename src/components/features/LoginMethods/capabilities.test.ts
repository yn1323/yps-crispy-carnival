import { describe, expect, it } from "vitest";
import {
  buildLoginMethodCapabilities,
  DISABLED_LOGIN_METHOD_CAPABILITIES,
  LOGIN_METHOD_CAPABILITY_NAMES,
} from "./capabilities";

describe("ログイン方法capabilityのbuild-time設定", () => {
  it.each(["production", "development", "test"])("%s buildではcanary候補を無視して全操作を閉じる", (mode) => {
    expect(
      buildLoginMethodCapabilities({
        mode,
        canary: "disconnectGoogle,replaceGoogleAccount",
      }),
    ).toEqual(DISABLED_LOGIN_METHOD_CAPABILITIES);
  });

  it("clerk-canary buildだけ候補集合を有効にする", () => {
    expect(
      buildLoginMethodCapabilities({
        mode: "clerk-canary",
        canary: "setPassword,disconnectGoogle,connectGoogle,replaceGoogleAccount",
      }),
    ).toEqual({
      ...DISABLED_LOGIN_METHOD_CAPABILITIES,
      setPassword: true,
      disconnectGoogle: true,
      connectGoogle: true,
      replaceGoogleAccount: true,
    });
  });

  it.each([
    ["未設定", undefined],
    ["空文字", ""],
    ["重複", "connectGoogle,connectGoogle"],
    ["未知名", "unknownCapability"],
    ["前後空白", " connectGoogle"],
    ["区切り後の空要素", "connectGoogle,"],
  ])("canary候補集合が%sなら全操作を閉じる", (_label, canary) => {
    expect(
      buildLoginMethodCapabilities({
        mode: "clerk-canary",
        canary,
      }),
    ).toEqual(DISABLED_LOGIN_METHOD_CAPABILITIES);
  });

  it("固定allowlistにはcanary対象だけを含め、全項目をbooleanとして返す", () => {
    const capabilities = buildLoginMethodCapabilities({
      mode: "clerk-canary",
      canary: LOGIN_METHOD_CAPABILITY_NAMES.join(","),
    });

    expect(LOGIN_METHOD_CAPABILITY_NAMES).toEqual([
      "connectGoogle",
      "reconnectGoogle",
      "disconnectGoogle",
      "setPassword",
      "changePassword",
      "removePassword",
      "removeEmailAddress",
      "replaceGoogleAccount",
    ]);
    expect(Object.keys(capabilities)).toEqual(LOGIN_METHOD_CAPABILITY_NAMES);
    expect(Object.values(capabilities).every((value) => typeof value === "boolean")).toBe(true);
    expect(Object.values(capabilities).every(Boolean)).toBe(true);
  });
});
