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
  tableCount: 66,
};

const VERIFY_RESULT = {
  contractVersion: DEVELOPMENT_SEED_CONTRACT_VERSION,
  contractFingerprint: DEVELOPMENT_SEED_CONTRACT_FINGERPRINT,
  scenarioCount: 9,
  tableCount: 66,
  organizationCount: 9,
  shopCount: 11,
  staffCount: 19,
  recruitmentCount: 11,
  openFailureCount: 1,
  activeOutboxCount: 0,
  activeFanoutCount: 0,
  delayedDeadlineCount: 0,
  liveScheduledFunctionCount: 0,
};
const AUDIT_TOKEN = "00000000-0000-4000-8000-000000000001";

function readInvocation(args: readonly string[]) {
  const functionName = args.at(-2);
  const rawPayload = args.at(-1);
  if (!functionName || !rawPayload) throw new Error("invalid test invocation");
  return { functionName, payload: JSON.parse(rawPayload) as Record<string, unknown> };
}

function createSuccessfulRunner() {
  let cancelCallCount = 0;
  let clearCallCount = 0;

  return vi.fn((args: readonly string[], _env: Readonly<NodeJS.ProcessEnv>) => {
    const { functionName, payload } = readInvocation(args);

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
      return JSON.stringify({ done: true, nextTableIndex: 66, deletedCount: 3, tableName: null });
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

  it("固定env fileがlocalまたはdev deploymentを一意に指す場合だけ許可する", () => {
    expect(() => assertDevelopmentSeedDeployment("local", "CONVEX_DEPLOYMENT=local:local-project\n")).not.toThrow();
    expect(() => assertDevelopmentSeedDeployment("dev", 'CONVEX_DEPLOYMENT="dev:team-project"\n')).not.toThrow();
    expect(() =>
      assertDevelopmentSeedDeployment("dev", "export CONVEX_DEPLOYMENT=dev:team-project # comment\n"),
    ).not.toThrow();

    expect(() => assertDevelopmentSeedDeployment("local", "CONVEX_DEPLOYMENT=dev:team-project\n")).toThrow(
      "許可されたlocal deploymentを指していません",
    );
    expect(() => assertDevelopmentSeedDeployment("local", "CONVEX_DEPLOYMENT=localhost\n")).toThrow(
      "許可されたlocal deploymentを指していません",
    );
    expect(() => assertDevelopmentSeedDeployment("local", "CONVEX_DEPLOYMENT=prod:team-project\n")).toThrow(
      "許可されたlocal deploymentを指していません",
    );
    expect(() => assertDevelopmentSeedDeployment("dev", "CONVEX_DEPLOYMENT=prod:team-project\n")).toThrow(
      "許可されたdev deploymentを指していません",
    );
    expect(() => assertDevelopmentSeedDeployment("dev", "CONVEX_DEPLOYMENT=development\n")).toThrow(
      "許可されたdev deploymentを指していません",
    );
    expect(() => assertDevelopmentSeedDeployment("dev", "CONVEX_DEPLOYMENT=dev/team-project\n")).toThrow(
      "許可されたdev deploymentを指していません",
    );
    expect(() => assertDevelopmentSeedDeployment("dev", "OTHER=value\n")).toThrow("一意に確認できません");
    expect(() =>
      assertDevelopmentSeedDeployment("dev", "CONVEX_DEPLOYMENT=dev:first\nCONVEX_DEPLOYMENT=dev:second\n"),
    ).toThrow("一意に確認できません");
  });

  it.each([
    "CONVEX_DEPLOY_KEY=dev:other-project|secret",
    "CONVEX_DEPLOYMENT_TOKEN=dev:other-project|secret",
    "CONVEX_SELF_HOSTED_URL=https://self-hosted.example.test",
    "CONVEX_SELF_HOSTED_ADMIN_KEY=secret",
  ])("優先selector %s を削除前に拒否する", (selector) => {
    const commandRunner = vi.fn();

    expect(() =>
      runDevelopmentSeed("dev", {
        commandRunner,
        fileReader: () => `CONVEX_DEPLOYMENT=dev:team-project\n${selector}\n`,
        logger: { log: vi.fn() },
      }),
    ).toThrow("許可されていないdeployment selector");
    expect(commandRunner).not.toHaveBeenCalled();
  });

  it("preflightから検証までを固定dev targetで順番に実行する", () => {
    const commandRunner = createSuccessfulRunner();
    const fileReader = vi.fn(() => "CONVEX_DEPLOYMENT=dev:team-project\n");
    const log = vi.fn();

    const summary = runDevelopmentSeed("dev", { commandRunner, fileReader, logger: { log } });

    expect(summary).toEqual({
      target: "dev",
      today: "2026-08-20",
      scenarioCount: 9,
      tableCount: 66,
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

    const childEnvironments = new Set<Readonly<NodeJS.ProcessEnv>>();
    for (const [args, env] of commandRunner.mock.calls) {
      expect(args.slice(0, 5)).toEqual(["exec", "convex", "run", "--deployment", "dev"]);
      expect(args).not.toContain("--push");
      expect(args).not.toContain("--env-file");
      expect(env).toMatchObject({
        CONVEX_DEPLOYMENT: "dev:team-project",
        CONVEX_DEPLOY_KEY: "",
        CONVEX_DEPLOYMENT_TOKEN: "",
        CONVEX_SELF_HOSTED_URL: "",
        CONVEX_SELF_HOSTED_ADMIN_KEY: "",
      });
      childEnvironments.add(env);
    }
    expect(childEnvironments.size).toBe(1);
    const output = JSON.stringify(log.mock.calls);
    expect(output).not.toContain("primary-manager@seed.example.test");
  });

  it.each([
    ["旧contract", { ...PREFLIGHT, contractVersion: "development-seed-v2" }],
    ["旧table catalog", { ...PREFLIGHT, tableCount: 65 }],
    ["別deployment", { ...PREFLIGHT, deploymentUrl: "https://other-development.convex.cloud" }],
  ])("preflightが%sならcancel・削除前に停止する", (_caseName, preflight) => {
    const commandRunner = vi.fn((_args: readonly string[], _env: Readonly<NodeJS.ProcessEnv>) =>
      JSON.stringify(preflight),
    );

    expect(() =>
      runDevelopmentSeed("dev", {
        commandRunner,
        fileReader: () => "CONVEX_DEPLOYMENT=dev:team-project\n",
        logger: { log: vi.fn() },
      }),
    ).toThrow(/cancel・削除は実行していません|固定env fileと一致しません/);
    expect(commandRunner).toHaveBeenCalledTimes(1);
    expect(readInvocation(commandRunner.mock.calls[0]?.[0] ?? []).functionName).toBe(
      "developmentSeed/mutations:preflight",
    );
  });

  it("env fileがpreflight後に変わっても検証済みdeployment snapshotだけを全phaseへ渡す", () => {
    let envContents = "CONVEX_DEPLOYMENT=dev:team-project\n";
    const successfulRunner = createSuccessfulRunner();
    const commandRunner = vi.fn((args: readonly string[], env: Readonly<NodeJS.ProcessEnv>) => {
      envContents = "CONVEX_DEPLOYMENT=prod:production-project\nCONVEX_DEPLOY_KEY=prod:secret|token\n";
      return successfulRunner(args, env);
    });
    const fileReader = vi.fn(() => envContents);

    runDevelopmentSeed("dev", { commandRunner, fileReader, logger: { log: vi.fn() } });

    expect(fileReader).toHaveBeenCalledTimes(1);
    for (const [, env] of commandRunner.mock.calls) {
      expect(env.CONVEX_DEPLOYMENT).toBe("dev:team-project");
      expect(env.CONVEX_DEPLOY_KEY).toBe("");
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
    const fileReader = vi.fn(() => "CONVEX_DEPLOYMENT=local:local-project\n");

    expect(() =>
      runDevelopmentSeed("local", {
        commandRunner,
        fileReader,
        logger: { log: vi.fn() },
      }),
    ).toThrow("全テーブル削除は開始していません");
    expect(fileReader).toHaveBeenCalledExactlyOnceWith(".env.local");
    for (const [args, env] of commandRunner.mock.calls) {
      expect(args.slice(0, 5)).toEqual(["exec", "convex", "run", "--deployment", "local"]);
      expect(env.CONVEX_DEPLOYMENT).toBe("local:local-project");
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
        fileReader: () => "CONVEX_DEPLOYMENT=dev:team-project\n",
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
        fileReader: () => "CONVEX_DEPLOYMENT=local:local-project\n",
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

  it("package script由来のliteral -- を含むdev確認引数でmainから完走する", () => {
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;
    const commandRunner = createSuccessfulRunner();

    try {
      main(["dev", "--", "--yes"], {
        commandRunner,
        fileReader: () => "CONVEX_DEPLOYMENT=dev:team-project\n",
        logger: { log: vi.fn() },
      });

      expect(process.exitCode).toBeUndefined();
      expect(commandRunner).toHaveBeenCalled();
    } finally {
      process.exitCode = previousExitCode;
    }
  });
});
