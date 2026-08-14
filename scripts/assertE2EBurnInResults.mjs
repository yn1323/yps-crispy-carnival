import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { collectE2ETests } from "./assertE2ECoreResults.mjs";

export const E2E_BURN_IN_PHASES = new Map([
  [
    "desktop",
    {
      projectName: "desktop-chromium",
      setupCount: 3,
      repetitions: 10,
      contractIds: [
        "E2E-AUTH-01",
        "E2E-AUTH-02",
        "E2E-SETUP-01",
        "E2E-STAFF-01",
        "E2E-SHIFT-01",
        "E2E-TENANT-01",
        "E2E-MEMBERSHIP-01",
        "E2E-SHOP-01",
        "E2E-ORGANIZATION-01",
        "E2E-ORGANIZATION-02",
        "E2E-MANAGER-01",
        "E2E-MANAGER-02",
        "E2E-NAV-01",
      ],
    },
  ],
  [
    "mobile",
    {
      projectName: "mobile-chrome",
      setupCount: 0,
      repetitions: 10,
      contractIds: ["E2E-MOBILE-01"],
    },
  ],
]);

export function assertE2EBurnInResults(report, phaseName) {
  const phase = E2E_BURN_IN_PHASES.get(phaseName);
  if (!phase) throw new Error(`Unknown E2E burn-in phase: ${phaseName}`);

  const tests = collectE2ETests(report?.suites);
  const setupTests = tests.filter((test) => test.projectName === "setup");
  const scenarioTests = tests.filter((test) => test.projectName !== "setup");
  const expectedContracts = new Set(phase.contractIds);
  const errors = [];

  if (setupTests.length !== phase.setupCount) {
    errors.push(`setup must run exactly ${phase.setupCount} times (actual: ${setupTests.length})`);
  }

  for (const test of tests) {
    if (test.status !== "expected") {
      errors.push(`${test.projectName}:${test.title} must be expected (actual: ${test.status})`);
    }
    if (test.retries > 0) {
      errors.push(`${test.projectName}:${test.title} must pass on the first attempt (retries: ${test.retries})`);
    }
  }

  for (const test of scenarioTests) {
    if (test.projectName !== phase.projectName) {
      errors.push(`scenario must run in ${phase.projectName} (actual: ${test.projectName})`);
    }
    if (test.contractIds.length !== 1) {
      errors.push(`${test.projectName}:${test.title} must declare exactly one core contract`);
      continue;
    }
    if (!expectedContracts.has(test.contractIds[0])) {
      errors.push(`unexpected core contract in ${phaseName} burn-in: ${test.contractIds[0]}`);
    }
  }

  const summary = [];
  for (const contractId of phase.contractIds) {
    const matches = scenarioTests.filter((test) => test.contractIds.includes(contractId));
    if (matches.length !== phase.repetitions) {
      errors.push(`${contractId} must run exactly ${phase.repetitions} times (actual: ${matches.length})`);
    }
    summary.push({ contractId, count: matches.length });
  }

  const stats = report?.stats;
  for (const field of ["skipped", "unexpected", "flaky"]) {
    if (Number(stats?.[field] ?? 0) !== 0) {
      errors.push(`report stats.${field} must be 0 (actual: ${String(stats?.[field])})`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`E2E burn-in result gate failed: ${errors.join("; ")}`);
  }
  return summary;
}

async function main() {
  const reportPath = process.argv[2];
  const phaseName = process.argv[3];
  if (!reportPath || !phaseName || process.argv.length !== 4) {
    throw new Error("Usage: node scripts/assertE2EBurnInResults.mjs <playwright-json-report> <desktop|mobile>");
  }
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const summary = assertE2EBurnInResults(report, phaseName);
  console.log(
    `E2E ${phaseName} burn-in result gate passed: ${summary
      .map(({ contractId, count }) => `${contractId}=${count}`)
      .join(", ")}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "E2E burn-in result gate failed.");
    process.exitCode = 1;
  });
}
