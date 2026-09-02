import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execFileSyncMock, dotenvConfigMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  dotenvConfigMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({ execFileSync: execFileSyncMock }));
vi.mock("dotenv", () => ({ config: dotenvConfigMock }));

const SECRET_SENTINEL = "secret-sentinel-should-never-be-printed";
const TEST_ENV_KEY = "STRIPE_SECRET_KEY";
const STANDARD_PRICE_ENV_KEY = "STRIPE_STANDARD_PRICE_ID";
const PROMOTION_CODE_ENV_KEY = "PROMOTION_COMPLIMENTARY_PRO_CODE";

describe("setupEnv", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env[TEST_ENV_KEY] = SECRET_SENTINEL;
  });

  afterEach(() => {
    delete process.env[TEST_ENV_KEY];
    delete process.env[STANDARD_PRICE_ENV_KEY];
    delete process.env[PROMOTION_CODE_ENV_KEY];
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

  it("Standard Price IDをargvへ含めずstdinでConvex環境変数へ同期する", async () => {
    const standardPriceId = "price_standard_setup_env";
    process.env[STANDARD_PRICE_ENV_KEY] = standardPriceId;
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    await import("./setupEnv");

    const standardPriceCall = execFileSyncMock.mock.calls.find(([, args]) => args.at(-1) === STANDARD_PRICE_ENV_KEY);
    expect(standardPriceCall).toBeDefined();
    if (!standardPriceCall) return;
    const [command, argv, options] = standardPriceCall;
    expect(JSON.stringify([command, argv])).not.toContain(standardPriceId);
    expect(options).toMatchObject({ input: `${standardPriceId}\n`, stdio: ["pipe", "pipe", "pipe"] });
  });

  it("プロモーションコードをargvやlogへ含めずstdinでConvex環境変数へ同期する", async () => {
    const promotionCode = "A1B2C3";
    process.env[PROMOTION_CODE_ENV_KEY] = promotionCode;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await import("./setupEnv");

    const promotionCodeCall = execFileSyncMock.mock.calls.find(([, args]) => args.at(-1) === PROMOTION_CODE_ENV_KEY);
    expect(promotionCodeCall).toBeDefined();
    if (!promotionCodeCall) return;
    const [command, argv, options] = promotionCodeCall;
    expect(JSON.stringify([command, argv])).not.toContain(promotionCode);
    expect(options).toMatchObject({ input: `${promotionCode}\n`, stdio: ["pipe", "pipe", "pipe"] });
    expect(`${logSpy.mock.calls.flat().join(" ")} ${errorSpy.mock.calls.flat().join(" ")}`).not.toContain(
      promotionCode,
    );
  });
});
