import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertDevelopmentSeedEnabled,
  getAiShiftDraftRecruitmentLimit,
  getAiShiftDraftSettings,
  getAnthropicApiKey,
  getDebugNotificationDeliveryMode,
  getDebugTrialDurationDays,
  getDevelopmentSeedConfiguration,
  getShiftSetupAssistMode,
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

  it.each([
    ["dry-run", undefined, "live"],
    [undefined, "dry-run", "dry-run"],
    ["dry-run", "force-failure", "force-failure"],
  ] as const)("環境変数オブジェクトの差し替え後は %s → %s を反映する", (before, after, expected) => {
    vi.stubEnv("DEBUG_MODE", "true");
    vi.stubEnv("DEBUG_NOTIFICATION_DELIVERY_MODE", before);
    expect(getDebugNotificationDeliveryMode()).toBe(before ?? "live");

    const previousEnv = process.env;
    try {
      process.env = { ...previousEnv };
      if (after === undefined) delete process.env.DEBUG_NOTIFICATION_DELIVERY_MODE;
      else process.env.DEBUG_NOTIFICATION_DELIVERY_MODE = after;

      expect(getDebugNotificationDeliveryMode()).toBe(expected);
    } finally {
      process.env = previousEnv;
    }
  });

  it("環境変数オブジェクトの差し替え後にDEBUG_MODEを無効にすると配送modeを拒否する", () => {
    vi.stubEnv("DEBUG_MODE", "true");
    vi.stubEnv("DEBUG_NOTIFICATION_DELIVERY_MODE", "dry-run");
    expect(getDebugNotificationDeliveryMode()).toBe("dry-run");

    const previousEnv = process.env;
    try {
      process.env = { ...previousEnv, DEBUG_MODE: "false" };

      expect(getDebugNotificationDeliveryMode).toThrowError(
        "DEBUG_NOTIFICATION_DELIVERY_MODE requires DEBUG_MODE=true",
      );
    } finally {
      process.env = previousEnv;
    }
  });

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

describe("shift setup assist mode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["未設定", "", "off"],
    ["空白だけ", "  ", "off"],
    ["random", "random", "random"],
    ["前後空白付きrandom", " random ", "random"],
  ])("SHIFT_SETUP_ASSIST_MODEが%sなら%sを返す", (_label, value, expected) => {
    vi.stubEnv("SHIFT_SETUP_ASSIST_MODE", value);

    expect(getShiftSetupAssistMode()).toBe(expected);
  });

  // 書き間違えた値で、根拠のない人数を出すAIサポートを有効にしない。
  it.each(["RANDOM", "true", "on", "off"])("SHIFT_SETUP_ASSIST_MODEの不正値 %s を拒否する", (value) => {
    vi.stubEnv("SHIFT_SETUP_ASSIST_MODE", value);

    expect(() => getShiftSetupAssistMode()).toThrowError("SHIFT_SETUP_ASSIST_MODE must be random or unset");
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

describe("AI shift draft settings", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("設定していない項目は既定の値を使う", () => {
    vi.stubEnv("AI_SHIFT_DRAFT_MODE", "");
    vi.stubEnv("AI_SHIFT_DRAFT_DAYS_PER_REQUEST", "");
    vi.stubEnv("AI_SHIFT_DRAFT_MODEL", "");
    vi.stubEnv("AI_SHIFT_DRAFT_EFFORT", "");
    vi.stubEnv("AI_SHIFT_DRAFT_MAX_TOKENS", "");

    expect(getAiShiftDraftSettings()).toEqual({
      mode: "revise",
      model: "claude-haiku-5-5",
      effort: "low",
      maxTokens: 16000,
      daysPerRequest: 1,
    });
  });

  it("モデル、考える量、返答の上限を、それぞれの環境変数から読む", () => {
    vi.stubEnv("AI_SHIFT_DRAFT_MODE", "scratch");
    vi.stubEnv("AI_SHIFT_DRAFT_DAYS_PER_REQUEST", "7");
    vi.stubEnv("AI_SHIFT_DRAFT_MODEL", " claude-opus-5-5 ");
    vi.stubEnv("AI_SHIFT_DRAFT_EFFORT", "high");
    vi.stubEnv("AI_SHIFT_DRAFT_MAX_TOKENS", "8000");

    expect(getAiShiftDraftSettings()).toEqual({
      mode: "scratch",
      model: "claude-opus-5-5",
      effort: "high",
      maxTokens: 8000,
      daysPerRequest: 7,
    });
  });

  it.each([
    ["AI_SHIFT_DRAFT_MODE", "auto", "AI_SHIFT_DRAFT_MODE must be scratch or revise"],
    ["AI_SHIFT_DRAFT_DAYS_PER_REQUEST", "32", "AI_SHIFT_DRAFT_DAYS_PER_REQUEST must be an integer between 0 and 31"],
    ["AI_SHIFT_DRAFT_DAYS_PER_REQUEST", "1.5", "AI_SHIFT_DRAFT_DAYS_PER_REQUEST must be an integer between 0 and 31"],
    ["AI_SHIFT_DRAFT_MODEL", "gpt-5", "AI_SHIFT_DRAFT_MODEL must be a Claude model ID"],
    ["AI_SHIFT_DRAFT_EFFORT", "max", "AI_SHIFT_DRAFT_EFFORT must be low, medium, or high"],
    ["AI_SHIFT_DRAFT_MAX_TOKENS", "1000", "AI_SHIFT_DRAFT_MAX_TOKENS must be an integer between 1024 and 128000"],
    ["AI_SHIFT_DRAFT_MAX_TOKENS", "200000", "AI_SHIFT_DRAFT_MAX_TOKENS must be an integer between 1024 and 128000"],
    ["AI_SHIFT_DRAFT_MAX_TOKENS", "1e4", "AI_SHIFT_DRAFT_MAX_TOKENS must be an integer between 1024 and 128000"],
  ])("%sの想定しない値 %s を、既定に戻さずに拒否する", (name, value, message) => {
    vi.stubEnv(name, value);

    expect(() => getAiShiftDraftSettings()).toThrowError(message);
  });

  it("APIキーがなければ失敗する", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", " ");

    expect(() => getAnthropicApiKey()).toThrowError("ANTHROPIC_API_KEY is not configured");
  });
});

describe("AI shift draft recruitment limit", () => {
  it("設定していなければ、既定の回数を使う", () => {
    vi.stubEnv("AI_SHIFT_DRAFT_RECRUITMENT_LIMIT", "");

    expect(getAiShiftDraftRecruitmentLimit()).toBe(5);
  });

  it.each([
    ["5", 5],
    [" 100 ", 100],
    // 0は、どの募集でもAIを使えない設定である。
    ["0", 0],
    ["1000", 1000],
  ])("環境変数の %s を回数として読む", (value, expected) => {
    vi.stubEnv("AI_SHIFT_DRAFT_RECRUITMENT_LIMIT", value);

    expect(getAiShiftDraftRecruitmentLimit()).toBe(expected);
  });

  it.each(["-1", "1.5", "1e2", "many", "1001"])("想定しない値 %s を、既定に戻さずに拒否する", (value) => {
    vi.stubEnv("AI_SHIFT_DRAFT_RECRUITMENT_LIMIT", value);

    expect(() => getAiShiftDraftRecruitmentLimit()).toThrowError(
      "AI_SHIFT_DRAFT_RECRUITMENT_LIMIT must be an integer between 0 and 1000",
    );
  });
});
