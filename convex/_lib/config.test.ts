import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertDevelopmentSeedEnabled,
  getDebugNotificationDeliveryMode,
  getDebugTrialDurationDays,
  getDevelopmentSeedConfiguration,
  isDebugModeEnabled,
} from "./config";

const CLERK_ISSUER = "https://clerk.seed.example.test";
const PRIMARY_AUTH_TOKEN_IDENTIFIER = `${CLERK_ISSUER}|user_seedPrimary`;

describe("debug mode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["未設定", "", false],
    ["false", "false", false],
    ["true", "true", true],
    ["前後空白付きtrue", " true ", true],
  ])("DEBUG_MODEが%sならenabled=%sを返す", (_label, value, expected) => {
    vi.stubEnv("DEBUG_MODE", value);

    expect(isDebugModeEnabled()).toBe(expected);
  });

  it.each(["TRUE", "1", "yes"])("DEBUG_MODEの不正値 %s を拒否する", (value) => {
    vi.stubEnv("DEBUG_MODE", value);

    expect(() => isDebugModeEnabled()).toThrowError("DEBUG_MODE must be either true or false");
  });
});

describe("debug notification delivery mode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(["", "false", "true"])("配送mode未設定ならDEBUG_MODE=%sでもliveにする", (debugMode) => {
    vi.stubEnv("DEBUG_MODE", debugMode);
    vi.stubEnv("DEBUG_NOTIFICATION_DELIVERY_MODE", "");

    expect(getDebugNotificationDeliveryMode()).toBe("live");
  });

  it.each(["dry-run", "force-failure"] as const)("DEBUG_MODE=trueなら%sを許可する", (mode) => {
    vi.stubEnv("DEBUG_MODE", "true");
    vi.stubEnv("DEBUG_NOTIFICATION_DELIVERY_MODE", mode);

    expect(getDebugNotificationDeliveryMode()).toBe(mode);
  });

  it.each(["", "false"])("DEBUG_MODE=%sで配送modeがあれば拒否する", (debugMode) => {
    vi.stubEnv("DEBUG_MODE", debugMode);
    vi.stubEnv("DEBUG_NOTIFICATION_DELIVERY_MODE", "dry-run");

    expect(() => getDebugNotificationDeliveryMode()).toThrowError(
      "DEBUG_NOTIFICATION_DELIVERY_MODE requires DEBUG_MODE=true",
    );
  });

  it.each(["live", "disabled", "mock", "DRY-RUN"])("配送modeの不正値 %s を拒否する", (mode) => {
    vi.stubEnv("DEBUG_MODE", "true");
    vi.stubEnv("DEBUG_NOTIFICATION_DELIVERY_MODE", mode);

    expect(() => getDebugNotificationDeliveryMode()).toThrowError(
      "DEBUG_NOTIFICATION_DELIVERY_MODE must be dry-run or force-failure",
    );
  });
});

describe("debug trial duration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(["", "false", "true"])("日数未設定ならDEBUG_MODE=%sでもoverrideしない", (debugMode) => {
    vi.stubEnv("DEBUG_MODE", debugMode);
    vi.stubEnv("DEBUG_TRIAL_DURATION_DAYS", "");

    expect(getDebugTrialDurationDays()).toBeUndefined();
  });

  it("DEBUG_MODEが無効なまま日数があれば拒否する", () => {
    vi.stubEnv("DEBUG_MODE", "false");
    vi.stubEnv("DEBUG_TRIAL_DURATION_DAYS", "7");

    expect(() => getDebugTrialDurationDays()).toThrowError("DEBUG_TRIAL_DURATION_DAYS requires DEBUG_MODE=true");
  });

  it.each(["1", "7", "30"])("DEBUG_MODE=trueなら範囲内の日数 %s を返す", (value) => {
    vi.stubEnv("DEBUG_MODE", "true");
    vi.stubEnv("DEBUG_TRIAL_DURATION_DAYS", value);

    expect(getDebugTrialDurationDays()).toBe(Number(value));
  });

  it.each(["0", "-1", "1.5", "1e1", "01", "31", "abc", "9007199254740992"])("範囲外の日数 %s を拒否する", (value) => {
    vi.stubEnv("DEBUG_MODE", "true");
    vi.stubEnv("DEBUG_TRIAL_DURATION_DAYS", value);

    expect(() => getDebugTrialDurationDays()).toThrowError(RangeError);
  });
});

describe("development seed guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  function stubReadyEnvironment() {
    vi.stubEnv("DEBUG_MODE", "true");
    vi.stubEnv("CONVEX_CLOUD_URL", "https://seed-development.convex.cloud/");
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", CLERK_ISSUER);
    vi.stubEnv("DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER", PRIMARY_AUTH_TOKEN_IDENTIFIER);
  }

  it("DEBUG_MODEとseed対象actorが揃った時だけ許可する", () => {
    stubReadyEnvironment();

    expect(assertDevelopmentSeedEnabled()).toEqual({
      enabled: true,
      currentDeploymentUrl: "https://seed-development.convex.cloud",
      primaryAuthTokenIdentifier: PRIMARY_AUTH_TOKEN_IDENTIFIER,
    });
  });

  it.each([
    ["DEBUG_MODE未設定", "DEBUG_MODE", "", "Development seed is disabled"],
    ["DEBUG_MODEの表記揺れ", "DEBUG_MODE", "TRUE", "DEBUG_MODE must be either true or false"],
    ["Clerk issuer未設定", "CLERK_JWT_ISSUER_DOMAIN", "", "Development seed Clerk issuer is not configured"],
    [
      "主利用者識別子未設定",
      "DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER",
      "",
      "Development seed primary auth token identifier is not configured",
    ],
  ])("%sをfail closedにする", (_label, key, value, expectedError) => {
    stubReadyEnvironment();
    vi.stubEnv(key, value);

    if (key !== "DEBUG_MODE") {
      expect(getDevelopmentSeedConfiguration().enabled).toBe(true);
    }
    expect(() => assertDevelopmentSeedEnabled()).toThrowError(expectedError);
  });

  it.each([
    ["区切りなし", "user_seedPrimary"],
    ["Clerk User以外", `${CLERK_ISSUER}|session_seedPrimary`],
    ["issuerのpath付き", `${CLERK_ISSUER}/path|user_seedPrimary`],
  ])("主利用者識別子が%sならfail closedにする", (_label, value) => {
    stubReadyEnvironment();
    vi.stubEnv("DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER", value);

    expect(() => assertDevelopmentSeedEnabled()).toThrowError(/primary auth token identifier is invalid/);
  });

  it("主利用者識別子のissuerがClerk設定と異なればfail closedにする", () => {
    stubReadyEnvironment();
    vi.stubEnv("DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER", "https://other-clerk.seed.example.test|user_seedPrimary");

    expect(() => assertDevelopmentSeedEnabled()).toThrowError(/issuer does not match/);
  });

  it("Clerk設定の末尾slashと値の前後空白を認証時の完全一致値へ正規化する", () => {
    stubReadyEnvironment();
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", `${CLERK_ISSUER}/`);
    vi.stubEnv("DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER", `  ${PRIMARY_AUTH_TOKEN_IDENTIFIER}  `);

    expect(assertDevelopmentSeedEnabled().primaryAuthTokenIdentifier).toBe(PRIMARY_AUTH_TOKEN_IDENTIFIER);
  });
});
