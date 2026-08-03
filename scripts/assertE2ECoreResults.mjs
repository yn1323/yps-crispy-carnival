import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const EXPECTED_CORE_CONTRACTS = new Map([
  ["E2E-AUTH-01", "desktop-chromium"],
  ["E2E-SETUP-01", "desktop-chromium"],
  ["E2E-SHIFT-01", "desktop-chromium"],
  ["E2E-TENANT-01", "desktop-chromium"],
  ["E2E-MOBILE-01", "mobile-chrome"],
]);

const CONTRACT_PATTERN = /\b(E2E-[A-Z]+-\d{2})\b/g;

export function collectE2ETests(suites, parentTitles = [], collected = []) {
  for (const suite of suites ?? []) {
    const titles = suite.title ? [...parentTitles, suite.title] : parentTitles;
    for (const spec of suite.specs ?? []) {
      const fullTitle = [...titles, spec.title].join(" ");
      const contractIds = [...fullTitle.matchAll(CONTRACT_PATTERN)].map((match) => match[1]);
      for (const test of spec.tests ?? []) {
        collected.push({
          contractIds,
          title: fullTitle,
          projectName: String(test.projectName ?? "unknown"),
          status: String(test.status ?? "unknown"),
          retries: Math.max(0, (test.results?.length ?? 1) - 1),
          durationMs: (test.results ?? []).reduce((total, result) => total + Number(result.duration ?? 0), 0),
        });
      }
    }
    collectE2ETests(suite.suites, titles, collected);
  }
  return collected;
}

export function assertE2ECoreResults(report) {
  const tests = collectE2ETests(report?.suites);
  const contractTests = new Map([...EXPECTED_CORE_CONTRACTS.keys()].map((contractId) => [contractId, []]));
  const unknownContracts = new Set();

  for (const test of tests) {
    for (const contractId of test.contractIds) {
      const matches = contractTests.get(contractId);
      if (matches) matches.push(test);
      else unknownContracts.add(contractId);
    }
  }

  const errors = [];
  const nonContractTests = tests.filter((test) => test.projectName !== "setup" && test.contractIds.length === 0);
  if (nonContractTests.length > 0) {
    errors.push(
      `non-setup tests must declare a core contract: ${nonContractTests
        .map((test) => `${test.projectName}:${test.title}`)
        .sort()
        .join(", ")}`,
    );
  }
  if (unknownContracts.size > 0) {
    errors.push(`unknown core contracts: ${[...unknownContracts].sort().join(", ")}`);
  }

  const summary = [];
  for (const [contractId, expectedProject] of EXPECTED_CORE_CONTRACTS) {
    const matches = contractTests.get(contractId) ?? [];
    if (matches.length !== 1) {
      errors.push(`${contractId} must run exactly once (actual: ${matches.length})`);
      continue;
    }

    const [result] = matches;
    if (result.projectName !== expectedProject) {
      errors.push(`${contractId} must run in ${expectedProject} (actual: ${result.projectName})`);
    }
    if (result.status !== "expected") {
      errors.push(`${contractId} must be expected (actual: ${result.status})`);
    }
    if (result.retries > 0) {
      errors.push(`${contractId} must pass on the first attempt (retries: ${result.retries})`);
    }
    summary.push({
      contractId,
      projectName: result.projectName,
      status: result.status,
      retries: result.retries,
      durationMs: result.durationMs,
    });
  }

  if (errors.length > 0) {
    throw new Error(`E2E core result gate failed: ${errors.join("; ")}`);
  }
  return summary;
}

async function main() {
  const reportPath = process.argv[2];
  if (!reportPath || process.argv.length !== 3) {
    throw new Error("Usage: node scripts/assertE2ECoreResults.mjs <playwright-json-report>");
  }
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const summary = assertE2ECoreResults(report);
  console.log(`E2E core result gate passed: ${summary.map(({ contractId }) => contractId).join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "E2E core result gate failed.");
    process.exitCode = 1;
  });
}
