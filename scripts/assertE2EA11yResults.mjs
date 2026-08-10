import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { collectE2ETests } from "./assertE2ECoreResults.mjs";

export const EXPECTED_A11Y_CONTRACT = {
  contractId: "E2E-A11Y-01",
  projectName: "a11y-chromium",
};

export function assertE2EA11yResults(report) {
  const tests = collectE2ETests(report?.suites);
  const scenarioTests = tests.filter((test) => test.projectName !== "setup");
  const matches = scenarioTests.filter((test) => test.contractIds.includes(EXPECTED_A11Y_CONTRACT.contractId));
  const errors = [];

  if (scenarioTests.length !== 1) {
    errors.push(`a11y smoke must run exactly one scenario (actual: ${scenarioTests.length})`);
  }
  if (matches.length !== 1) {
    errors.push(`${EXPECTED_A11Y_CONTRACT.contractId} must run exactly once (actual: ${matches.length})`);
  }

  const [result] = matches;
  if (result) {
    if (result.projectName !== EXPECTED_A11Y_CONTRACT.projectName) {
      errors.push(
        `${EXPECTED_A11Y_CONTRACT.contractId} must run in ${EXPECTED_A11Y_CONTRACT.projectName} (actual: ${result.projectName})`,
      );
    }
    if (result.status !== "expected") {
      errors.push(`${EXPECTED_A11Y_CONTRACT.contractId} must be expected (actual: ${result.status})`);
    }
    if (result.retries > 0) {
      errors.push(`${EXPECTED_A11Y_CONTRACT.contractId} must pass on the first attempt (retries: ${result.retries})`);
    }
    if (result.contractIds.length !== 1) {
      errors.push(`${EXPECTED_A11Y_CONTRACT.contractId} must declare exactly one contract ID`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`E2E a11y result gate failed: ${errors.join("; ")}`);
  }
  return {
    contractId: EXPECTED_A11Y_CONTRACT.contractId,
    projectName: result.projectName,
    status: result.status,
    retries: result.retries,
    durationMs: result.durationMs,
  };
}

async function main() {
  const reportPath = process.argv[2];
  if (!reportPath || process.argv.length !== 3) {
    throw new Error("Usage: node scripts/assertE2EA11yResults.mjs <playwright-json-report>");
  }
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const summary = assertE2EA11yResults(report);
  console.log(`E2E a11y result gate passed: ${summary.contractId}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "E2E a11y result gate failed.");
    process.exitCode = 1;
  });
}
