import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertDevelopmentSeedDeployment,
  DEVELOPMENT_SEED_CONTRACT_FINGERPRINT,
  DEVELOPMENT_SEED_CONTRACT_VERSION,
  DEVELOPMENT_SEED_SCENARIO_KEYS,
  formatDevelopmentSeedError,
  main,
  parseDevelopmentSeedCliArgs,
  runDevelopmentSeed,
} from "./seedDevelopmentData";

const PREFLIGHT = {
  contractVersion: DEVELOPMENT_SEED_CONTRACT_VERSION,
  contractFingerprint: DEVELOPMENT_SEED_CONTRACT_FINGERPRINT,
  deploymentUrl: "https://team-project.convex.cloud",
  today: "2026-08-20",
  scenarioKeys: [...DEVELOPMENT_SEED_SCENARIO_KEYS],
  tableCount: 57,
};

const VERIFY_RESULT = {
  contractVersion: DEVELOPMENT_SEED_CONTRACT_VERSION,
  contractFingerprint: DEVELOPMENT_SEED_CONTRACT_FINGERPRINT,
  scenarioCount: 9,
  tableCount: 57,
  organizationCount: 9,
  shopCount: 12,
  staffCount: 169,
  recruitmentCount: 22,
  openFailureCount: 1,
  activeOutboxCount: 0,
  activeFanoutCount: 0,
  delayedDeadlineCount: 0,
  liveScheduledFunctionCount: 0,
};
const AUDIT_TOKEN = "00000000-0000-4000-8000-000000000001";
const PERSONAL_DEV_ENV = "CONVEX_DEPLOYMENT=dev:team-project\n";
const SHARED_DEVELOPMENT_ENV = "CONVEX_DEPLOY_KEY=prod:team-project|test-deploy-key\n";

function readInvocation(args: readonly string[]) {
  const functionName = args.at(-2);
  const rawPayload = args.at(-1);
  if (!functionName || !rawPayload) throw new Error("invalid test invocation");
  return { functionName, payload: JSON.parse(rawPayload) as Record<string, unknown> };
}

function createSuccessfulRunner(events?: string[]) {
  let cancelCallCount = 0;
  let clearCallCount = 0;

  return vi.fn((args: readonly string[], _env: Readonly<NodeJS.ProcessEnv>) => {
    const { functionName, payload } = readInvocation(args);
    events?.push(functionName);

    if (functionName === "developmentSeed/mutations:preflight") {
      return `Convex result\n${JSON.stringify(PREFLIGHT)}`;
    }
    if (functionName === "developmentSeed/mutations:cancelScheduledFunctions") {
      cancelCallCount += 1;
      if (cancelCallCount === 1) {
        expect(payload).toEqual({ cursor: null, auditToken: null });
        return JSON.stringify({
          auditToken: AUDIT_TOKEN,
          continueCursor: "cursor-1",
          isDone: false,
          cancelledCount: 2,
          inProgressCount: 0,
        });
      }
      expect(payload).toEqual({ cursor: "cursor-1", auditToken: AUDIT_TOKEN });
      return JSON.stringify({
        auditToken: AUDIT_TOKEN,
        continueCursor: "",
        isDone: true,
        cancelledCount: 1,
        inProgressCount: 0,
      });
    }
    if (functionName === "developmentSeed/mutations:clearAllTables") {
      clearCallCount += 1;
      if (clearCallCount === 1) {
        expect(payload).toEqual({ tableIndex: 0, auditToken: AUDIT_TOKEN });
        return JSON.stringify({ done: false, nextTableIndex: 0, deletedCount: 500, tableName: "shops" });
      }
      if (clearCallCount === 2) {
        expect(payload).toEqual({ tableIndex: 0, auditToken: AUDIT_TOKEN });
        return JSON.stringify({ done: false, nextTableIndex: 1, deletedCount: 2, tableName: "shops" });
      }
      expect(payload).toEqual({ tableIndex: 1, auditToken: AUDIT_TOKEN });
      return JSON.stringify({ done: true, nextTableIndex: 57, deletedCount: 3, tableName: null });
    }
    if (functionName === "developmentSeed/mutations:seedActors") {
      expect(payload).toEqual({ today: PREFLIGHT.today, auditToken: AUDIT_TOKEN });
      return JSON.stringify({ createdCount: 3 });
    }
    if (functionName === "developmentSeed/mutations:seedScenario") {
      expect(payload.today).toBe(PREFLIGHT.today);
      expect(payload.auditToken).toBe(AUDIT_TOKEN);
      return JSON.stringify({ scenarioKey: payload.scenarioKey, insertedCount: 10 });
    }
    if (functionName === "developmentSeed/queries:verify") {
      expect(payload).toEqual({ today: PREFLIGHT.today, auditToken: AUDIT_TOKEN });
      return JSON.stringify(VERIFY_RESULT);
    }
    throw new Error(`unexpected function: ${functionName}`);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("seedDevelopmentData CLI", () => {
  it("localと--yes付きdevの固定コマンドだけを受け付ける", () => {
    expect(parseDevelopmentSeedCliArgs(["local"])).toBe("local");
    expect(parseDevelopmentSeedCliArgs(["dev", "--yes"])).toBe("dev");
    expect(parseDevelopmentSeedCliArgs(["dev", "--", "--yes"])).toBe("dev");

    expect(() => parseDevelopmentSeedCliArgs(["dev"])).toThrow("--yes");
    expect(() => parseDevelopmentSeedCliArgs(["production", "--yes"])).toThrow("対象やenv fileは変更できません");
    expect(() => parseDevelopmentSeedCliArgs(["dev", "--yes", "--env-file", ".env.production"])).toThrow(
      "対象やenv fileは変更できません",
    );
    expect(() => parseDevelopmentSeedCliArgs(["local", "--yes"])).toThrow("対象やenv fileは変更できません");
  });

  it("localは個人用dev selector、Developmentは固定deploy keyだけを許可する", () => {
    expect(() => assertDevelopmentSeedDeployment("local", PERSONAL_DEV_ENV)).not.toThrow();
    expect(() => assertDevelopmentSeedDeployment("dev", SHARED_DEVELOPMENT_ENV)).not.toThrow();
    expect(() =>
      assertDevelopmentSeedDeployment("dev", "CONVEX_DEPLOY_KEY=dev:team-project|test-deploy-key\n"),
    ).toThrow("固定したDevelopment deploymentのkeyを持っていません");

    expect(() => assertDevelopmentSeedDeployment("local", "CONVEX_DEPLOYMENT=localhost\n")).toThrow(
      "個人用dev deploymentを指していません",
    );
    expect(() => assertDevelopmentSeedDeployment("local", "CONVEX_DEPLOYMENT=local:local-project\n")).toThrow(
      "個人用dev deploymentを指していません",
    );
    expect(() => assertDevelopmentSeedDeployment("local", "CONVEX_DEPLOYMENT=prod:team-project\n")).toThrow(
      "個人用dev deploymentを指していません",
    );
    expect(() =>
      assertDevelopmentSeedDeployment("local", "CONVEX_DEPLOYMENT=dev:first\nCONVEX_DEPLOYMENT=dev:second\n"),
    ).toThrow("CONVEX_DEPLOYMENTを一意に確認できません");
    expect(() => assertDevelopmentSeedDeployment("dev", "CONVEX_DEPLOYMENT=prod:team-project\n")).toThrow(
      "CONVEX_DEPLOY_KEYを一意に確認できません",
    );
    expect(() =>
      assertDevelopmentSeedDeployment("dev", "CONVEX_DEPLOY_KEY=preview:team:project|test-deploy-key\n"),
    ).toThrow("固定したDevelopment deploymentのkeyを持っていません");
    expect(() =>
      assertDevelopmentSeedDeployment("dev", "CONVEX_DEPLOY_KEY=project:team:project|test-deploy-key\n"),
    ).toThrow("固定したDevelopment deploymentのkeyを持っていません");
    expect(() => assertDevelopmentSeedDeployment("dev", "CONVEX_DEPLOY_KEY=prod:team-project\n")).toThrow(
      "固定したDevelopment deploymentのkeyを持っていません",
    );
    expect(() => assertDevelopmentSeedDeployment("dev", "OTHER=value\n")).toThrow(
      "CONVEX_DEPLOY_KEYを一意に確認できません",
    );
    expect(() =>
      assertDevelopmentSeedDeployment(
        "dev",
        "CONVEX_DEPLOY_KEY=prod:first|first-secret\nCONVEX_DEPLOY_KEY=prod:second|second-secret\n",
      ),
    ).toThrow("CONVEX_DEPLOY_KEYを一意に確認できません");
  });

  it.each([
    "CONVEX_DEPLOY_KEY=dev:other-project|secret",
    "CONVEX_DEPLOYMENT_TOKEN=dev:other-project|secret",
    "CONVEX_SELF_HOSTED_URL=https://self-hosted.example.test",
    "CONVEX_SELF_HOSTED_ADMIN_KEY=secret",
  ])("localでは優先selector %s を削除前に拒否する", (selector) => {
    const commandRunner = vi.fn();

    expect(() =>
      runDevelopmentSeed("local", {
        commandRunner,
        fileReader: () => `${PERSONAL_DEV_ENV}${selector}\n`,
        logger: { log: vi.fn() },
      }),
    ).toThrow(/CONVEX_DEPLOY_KEYは設定できません|許可されていないdeployment selector/);
    expect(commandRunner).not.toHaveBeenCalled();
  });

  it.each([
    "CONVEX_DEPLOYMENT=dev:other-project",
    "CONVEX_DEPLOYMENT_TOKEN=dev:other-project|secret",
    "CONVEX_SELF_HOSTED_URL=https://self-hosted.example.test",
    "CONVEX_SELF_HOSTED_ADMIN_KEY=secret",
  ])("Developmentでは競合selector %s を削除前に拒否する", (selector) => {
    const commandRunner = vi.fn();

    expect(() =>
      runDevelopmentSeed("dev", {
        commandRunner,
        fileReader: () => `${SHARED_DEVELOPMENT_ENV}${selector}\n`,
        logger: { log: vi.fn() },
      }),
    ).toThrow(/CONVEX_DEPLOYMENTは設定できません|許可されていないdeployment selector/);
    expect(commandRunner).not.toHaveBeenCalled();
  });

  it("preflightから検証までを固定Development deploy keyで順番に実行する", () => {
    const events: string[] = [];
    const commandRunner = createSuccessfulRunner(events);
    const fileReader = vi.fn(() => SHARED_DEVELOPMENT_ENV);
    const log = vi.fn();

    const summary = runDevelopmentSeed("dev", { commandRunner, fileReader, logger: { log } });

    expect(summary).toEqual({
      target: "dev",
      today: "2026-08-20",
      scenarioCount: 9,
      tableCount: 57,
      cancelledScheduledFunctionCount: 3,
      deletedDocumentCount: 505,
      insertedDocumentCount: 93,
      verification: VERIFY_RESULT,
    });
    expect(fileReader).toHaveBeenCalledExactlyOnceWith(".env.develop");

    const invocations = commandRunner.mock.calls.map(([args]) => readInvocation(args));
    expect(invocations.map(({ functionName }) => functionName)).toEqual([
      "developmentSeed/mutations:preflight",
      "developmentSeed/mutations:cancelScheduledFunctions",
      "developmentSeed/mutations:cancelScheduledFunctions",
      "developmentSeed/mutations:clearAllTables",
      "developmentSeed/mutations:clearAllTables",
      "developmentSeed/mutations:clearAllTables",
      "developmentSeed/mutations:seedActors",
      ...DEVELOPMENT_SEED_SCENARIO_KEYS.map(() => "developmentSeed/mutations:seedScenario"),
      "developmentSeed/queries:verify",
    ]);
    expect(
      invocations
        .filter(({ functionName }) => functionName === "developmentSeed/mutations:seedScenario")
        .map(({ payload }) => payload.scenarioKey),
    ).toEqual(DEVELOPMENT_SEED_SCENARIO_KEYS);
    expect(events).toEqual(invocations.map(({ functionName }) => functionName));

    const childEnvironments = new Set<Readonly<NodeJS.ProcessEnv>>();
    for (const [args, env] of commandRunner.mock.calls) {
      expect(args.slice(0, 3)).toEqual(["exec", "convex", "run"]);
      expect(args).not.toContain("--deployment");
      expect(args).not.toContain("--push");
      expect(args).not.toContain("--env-file");
      expect(env).toMatchObject({
        CONVEX_DEPLOYMENT: "",
        CONVEX_DEPLOY_KEY: "prod:team-project|test-deploy-key",
        CONVEX_DEPLOYMENT_TOKEN: "",
        CONVEX_SELF_HOSTED_URL: "",
        CONVEX_SELF_HOSTED_ADMIN_KEY: "",
      });
      childEnvironments.add(env);
    }
    expect(childEnvironments.size).toBe(1);
    const output = JSON.stringify(log.mock.calls);
    expect(output).not.toContain("test-deploy-key");
    expect(output).not.toContain("primary-manager@seed.example.test");
  });

  it.each([
    ["旧contract", { ...PREFLIGHT, contractVersion: "development-seed-v2" }],
    ["旧table catalog", { ...PREFLIGHT, tableCount: 65 }],
    ["別deployment", { ...PREFLIGHT, deploymentUrl: "https://other-development.convex.cloud" }],
    ["HTTP URL", { ...PREFLIGHT, deploymentUrl: "http://team-project.convex.cloud" }],
    ["port付きURL", { ...PREFLIGHT, deploymentUrl: "https://team-project.convex.cloud:443" }],
    ["path付きURL", { ...PREFLIGHT, deploymentUrl: "https://team-project.convex.cloud/path" }],
    ["query付きURL", { ...PREFLIGHT, deploymentUrl: "https://team-project.convex.cloud?target=other" }],
  ])("preflightが%sならcancel・削除前に停止する", (_caseName, preflight) => {
    const commandRunner = vi.fn((_args: readonly string[], _env: Readonly<NodeJS.ProcessEnv>) =>
      JSON.stringify(preflight),
    );
    expect(() =>
      runDevelopmentSeed("dev", {
        commandRunner,
        fileReader: () => SHARED_DEVELOPMENT_ENV,
        logger: { log: vi.fn() },
      }),
    ).toThrow(/cancel・削除は実行していません|固定env fileと一致しません/);
    expect(commandRunner).toHaveBeenCalledTimes(1);
    expect(readInvocation(commandRunner.mock.calls[0]?.[0] ?? []).functionName).toBe(
      "developmentSeed/mutations:preflight",
    );
  });

  it("個人用dev selectorとpreflight URLが違えば削除前に停止する", () => {
    const commandRunner = vi.fn(() =>
      JSON.stringify({ ...PREFLIGHT, deploymentUrl: "https://other-development.convex.cloud" }),
    );
    expect(() =>
      runDevelopmentSeed("local", {
        commandRunner,
        fileReader: () => PERSONAL_DEV_ENV,
        logger: { log: vi.fn() },
      }),
    ).toThrow("個人用dev deploymentが固定env fileと一致しません");
    expect(commandRunner).toHaveBeenCalledTimes(1);
  });

  it("env fileがpreflight後に変わっても検証済みdeployment snapshotだけを全phaseへ渡す", () => {
    let envContents = SHARED_DEVELOPMENT_ENV;
    const successfulRunner = createSuccessfulRunner();
    const commandRunner = vi.fn((args: readonly string[], env: Readonly<NodeJS.ProcessEnv>) => {
      envContents = "CONVEX_DEPLOY_KEY=prod:production-project|other-secret\n";
      return successfulRunner(args, env);
    });
    const fileReader = vi.fn(() => envContents);

    runDevelopmentSeed("dev", { commandRunner, fileReader, logger: { log: vi.fn() } });

    expect(fileReader).toHaveBeenCalledTimes(1);
    for (const [, env] of commandRunner.mock.calls) {
      expect(env.CONVEX_DEPLOYMENT).toBe("");
      expect(env.CONVEX_DEPLOY_KEY).toBe("prod:team-project|test-deploy-key");
    }
  });

  it("実行中scheduled functionを検出したら全テーブル削除を開始しない", () => {
    const commandRunner = vi.fn((args: readonly string[], _env: Readonly<NodeJS.ProcessEnv>) => {
      const { functionName } = readInvocation(args);
      if (functionName === "developmentSeed/mutations:preflight") return JSON.stringify(PREFLIGHT);
      if (functionName === "developmentSeed/mutations:cancelScheduledFunctions") {
        return JSON.stringify({
          auditToken: AUDIT_TOKEN,
          continueCursor: "",
          isDone: true,
          cancelledCount: 2,
          inProgressCount: 1,
        });
      }
      throw new Error("clear must not run");
    });
    const fileReader = vi.fn(() => PERSONAL_DEV_ENV);

    expect(() =>
      runDevelopmentSeed("local", {
        commandRunner,
        fileReader,
        logger: { log: vi.fn() },
      }),
    ).toThrow("全テーブル削除は開始していません");
    expect(fileReader).toHaveBeenCalledExactlyOnceWith(".env.local");
    for (const [args, env] of commandRunner.mock.calls) {
      expect(args.slice(0, 3)).toEqual(["exec", "convex", "run"]);
      expect(args).not.toContain("--deployment");
      expect(env.CONVEX_DEPLOYMENT).toBe("dev:team-project");
      expect(env.CONVEX_DEPLOY_KEY).toBe("");
    }
    expect(commandRunner.mock.calls.map(([args]) => readInvocation(args).functionName)).toEqual([
      "developmentSeed/mutations:preflight",
      "developmentSeed/mutations:cancelScheduledFunctions",
    ]);
  });

  it("シナリオ途中の失敗では後続シナリオとverifyを実行せず、生エラーを露出しない", () => {
    const successfulRunner = createSuccessfulRunner();
    let scenarioCallCount = 0;
    const commandRunner = vi.fn((args: readonly string[], env: Readonly<NodeJS.ProcessEnv>) => {
      const { functionName } = readInvocation(args);
      if (functionName === "developmentSeed/mutations:seedScenario") {
        scenarioCallCount += 1;
        if (scenarioCallCount === 3) {
          throw new Error("token=secret-token primary-manager@seed.example.test");
        }
      }
      return successfulRunner(args, env);
    });
    let failure: unknown;
    try {
      runDevelopmentSeed("dev", {
        commandRunner,
        fileReader: () => SHARED_DEVELOPMENT_ENV,
        logger: { log: vi.fn() },
      });
    } catch (error) {
      failure = error;
    }

    const safeError = formatDevelopmentSeedError(failure);
    expect(safeError).toContain("後続処理を停止しました");
    expect(safeError).not.toContain("secret-token");
    expect(safeError).not.toContain("primary-manager@seed.example.test");
    expect(commandRunner.mock.calls.map(([args]) => readInvocation(args).functionName)).not.toContain(
      "developmentSeed/queries:verify",
    );
    expect(scenarioCallCount).toBe(3);
  });

  it("不正なJSON応答を出力へ複製せず、後続処理を止める", () => {
    const rawOutput = "token=secret-token primary-manager@seed.example.test";
    let failure: unknown;
    try {
      runDevelopmentSeed("local", {
        commandRunner: () => rawOutput,
        fileReader: () => PERSONAL_DEV_ENV,
        logger: { log: vi.fn() },
      });
    } catch (error) {
      failure = error;
    }

    const safeError = formatDevelopmentSeedError(failure);
    expect(safeError).toContain("応答形式を確認できません");
    expect(safeError).not.toContain("secret-token");
    expect(safeError).not.toContain("primary-manager@seed.example.test");
  });

  it("引数エラーをnonzeroにし、安全なusageだけを表示する", () => {
    const previousExitCode = process.exitCode;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.exitCode = undefined;

    try {
      main(["dev"]);

      expect(process.exitCode).toBe(1);
      expect(consoleError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("--yes"));
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it("package scriptのdev確認引数でmainから完走する", () => {
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;
    const commandRunner = createSuccessfulRunner();

    try {
      main(["dev", "--yes"], {
        commandRunner,
        fileReader: () => SHARED_DEVELOPMENT_ENV,
        logger: { log: vi.fn() },
      });

      expect(process.exitCode).toBeUndefined();
      expect(commandRunner).toHaveBeenCalled();
    } finally {
      process.exitCode = previousExitCode;
    }
  });
});
