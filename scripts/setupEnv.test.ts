import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execFileSyncMock, dotenvConfigMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  dotenvConfigMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({ execFileSync: execFileSyncMock }));
vi.mock("dotenv", () => ({ config: dotenvConfigMock }));

const SECRET_SENTINEL = "secret-sentinel-should-never-be-printed";
const TEST_ENV_KEY = "STRIPE_SECRET_KEY";
const BUSINESS_PRICE_ENV_KEY = "STRIPE_BUSINESS_PRICE_ID";
const DARK_LAUNCH_ENV_KEYS = [
  "FEATURE_SHOP_ADDITION",
  "FEATURE_BILLING",
  "FEATURE_ORGANIZATION_CREATION",
  "FEATURE_MANAGER_INVITATION",
] as const;

describe("setupEnv", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env[TEST_ENV_KEY] = SECRET_SENTINEL;
    for (const key of DARK_LAUNCH_ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    delete process.env[TEST_ENV_KEY];
    delete process.env[BUSINESS_PRICE_ENV_KEY];
    for (const key of DARK_LAUNCH_ENV_KEYS) delete process.env[key];
    vi.restoreAllMocks();
  });

  it("secretをargvへ含めずstdinだけでConvex CLIへ渡す", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await import("./setupEnv");

    const secretCall = execFileSyncMock.mock.calls.find(([, args]) => args.at(-1) === TEST_ENV_KEY);
    expect(secretCall).toBeDefined();
    if (!secretCall) return;
    const [command, argv, options] = secretCall;
    expect(JSON.stringify([command, argv])).not.toContain(SECRET_SENTINEL);
    expect(options).toMatchObject({ input: `${SECRET_SENTINEL}\n`, stdio: ["pipe", "pipe", "pipe"] });
    expect(`${logSpy.mock.calls.flat().join(" ")} ${errorSpy.mock.calls.flat().join(" ")}`).not.toContain(
      SECRET_SENTINEL,
    );
  });

  it("子プロセスのerror・stdout・stderr・commandにsecretが含まれても固定エラーだけを表示する", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    execFileSyncMock.mockImplementation((_command, args) => {
      if (args.at(-1) !== TEST_ENV_KEY) return Buffer.from("");
      throw Object.assign(new Error(`command failed with ${SECRET_SENTINEL}`), {
        command: `pnpm exec convex env set ${TEST_ENV_KEY} ${SECRET_SENTINEL}`,
        stdout: Buffer.from(SECRET_SENTINEL),
        stderr: Buffer.from(SECRET_SENTINEL),
      });
    });

    await expect(import("./setupEnv")).resolves.toBeDefined();

    const output = `${logSpy.mock.calls.flat().join(" ")} ${errorSpy.mock.calls.flat().join(" ")}`;
    expect(output).toContain(`❌ ${TEST_ENV_KEY}: 設定失敗`);
    expect(output).not.toContain(SECRET_SENTINEL);
    const secretCall = execFileSyncMock.mock.calls.find(([, args]) => args.at(-1) === TEST_ENV_KEY);
    expect(secretCall).toBeDefined();
    if (!secretCall) return;
    expect(JSON.stringify(secretCall.slice(0, 2))).not.toContain(SECRET_SENTINEL);
  });

  it("Business Price IDをargvへ含めずstdinでConvex環境変数へ同期する", async () => {
    const businessPriceId = "price_business_setup_env";
    process.env[BUSINESS_PRICE_ENV_KEY] = businessPriceId;
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    await import("./setupEnv");

    const businessPriceCall = execFileSyncMock.mock.calls.find(([, args]) => args.at(-1) === BUSINESS_PRICE_ENV_KEY);
    expect(businessPriceCall).toBeDefined();
    if (!businessPriceCall) return;
    const [command, argv, options] = businessPriceCall;
    expect(JSON.stringify([command, argv])).not.toContain(businessPriceId);
    expect(options).toMatchObject({ input: `${businessPriceId}\n`, stdio: ["pipe", "pipe", "pipe"] });
  });

  it("未設定のダークローンチ公開フラグをdisabledとして同期する", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    await import("./setupEnv");

    for (const key of DARK_LAUNCH_ENV_KEYS) {
      const call = execFileSyncMock.mock.calls.find(([, args]) => args.at(-1) === key);
      expect(call).toBeDefined();
      expect(call?.[2]).toMatchObject({ input: "disabled\n", stdio: ["pipe", "pipe", "pipe"] });
    }
  });
});
