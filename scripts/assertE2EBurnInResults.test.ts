import { describe, expect, it } from "vitest";
import { assertE2EBurnInResults, E2E_BURN_IN_PHASES } from "./assertE2EBurnInResults.mjs";

type ResultOverride = {
  contractId?: string;
  projectName?: string;
  status?: string;
  results?: Array<{ duration: number }>;
};

function report(phaseName: "desktop" | "mobile", override: ResultOverride = {}) {
  const phase = E2E_BURN_IN_PHASES.get(phaseName);
  if (!phase) throw new Error("missing test phase");

  const specs = phase.contractIds.flatMap((defaultContractId) =>
    Array.from({ length: phase.repetitions }, (_, index) => {
      const contractId =
        index === 0 && defaultContractId === phase.contractIds[0]
          ? (override.contractId ?? defaultContractId)
          : defaultContractId;
      return {
        title: `[${contractId}] representative browser boundary`,
        tests: [
          {
            projectName: override.projectName ?? phase.projectName,
            status: override.status ?? "expected",
            results: override.results ?? [{ duration: 100 }],
          },
        ],
      };
    }),
  );
  specs.push(
    ...Array.from({ length: phase.setupCount }, (_, index) => ({
      title: `prepare authenticated state ${index}`,
      tests: [{ projectName: "setup", status: "expected", results: [{ duration: 100 }] }],
    })),
  );

  return {
    stats: { skipped: 0, unexpected: 0, flaky: 0 },
    suites: [{ title: "burn-in", specs }],
  };
}

describe("E2E burn-in result gate", () => {
  it("desktop 12契約を120回、mobile 1契約を10回のphaseへ固定する", () => {
    const desktop = E2E_BURN_IN_PHASES.get("desktop");
    const mobile = E2E_BURN_IN_PHASES.get("mobile");

    expect(desktop).toMatchObject({ repetitions: 10 });
    expect(desktop?.contractIds).toHaveLength(12);
    expect((desktop?.contractIds.length ?? 0) * (desktop?.repetitions ?? 0)).toBe(120);
    expect(mobile).toMatchObject({ repetitions: 10 });
    expect(mobile?.contractIds).toHaveLength(1);
    expect((mobile?.contractIds.length ?? 0) * (mobile?.repetitions ?? 0)).toBe(10);
  });

  it.each(["desktop", "mobile"] as const)("%sの契約を各10回、初回成功で検証する", (phaseName) => {
    const phase = E2E_BURN_IN_PHASES.get(phaseName);
    expect(assertE2EBurnInResults(report(phaseName), phaseName)).toEqual(
      phase?.contractIds.map((contractId) => ({ contractId, count: 10 })),
    );
  });

  it("desktopで管理者招待の発行・取消と別actor受諾を各10回要求する", () => {
    const summary = assertE2EBurnInResults(report("desktop"), "desktop");

    expect(summary).toContainEqual({ contractId: "E2E-MANAGER-01", count: 10 });
    expect(summary).toContainEqual({ contractId: "E2E-MANAGER-02", count: 10 });
  });

  it.each([
    ["skip", { status: "skipped" }, "must be expected"],
    ["retry", { results: [{ duration: 10 }, { duration: 20 }] }, "first attempt"],
    ["wrong project", { projectName: "wrong-project" }, "scenario must run in"],
    ["unknown contract", { contractId: "E2E-UNKNOWN-01" }, "unexpected core contract"],
  ])("%sを拒否する", (_label, override, expectedMessage) => {
    expect(() => assertE2EBurnInResults(report("desktop", override), "desktop")).toThrow(expectedMessage);
  });

  it("反復不足を拒否する", () => {
    const missing = report("mobile");
    missing.suites[0].specs.pop();
    expect(() => assertE2EBurnInResults(missing, "mobile")).toThrow("must run exactly 10 times");
  });

  it("desktopの認証setup不足を拒否する", () => {
    const missingSetup = report("desktop");
    missingSetup.suites[0].specs.pop();
    expect(() => assertE2EBurnInResults(missingSetup, "desktop")).toThrow("setup must run exactly 3 times");
  });

  it("report集計上のflakeを拒否する", () => {
    const flaky = report("mobile");
    flaky.stats.flaky = 1;
    expect(() => assertE2EBurnInResults(flaky, "mobile")).toThrow("stats.flaky must be 0");
  });
});
