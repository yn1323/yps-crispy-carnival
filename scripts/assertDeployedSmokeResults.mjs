import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const EXPECTED_DEPLOYED_SMOKE_CONTRACTS = new Map([
  ["DEPLOY-SMOKE-HTTP-01", "deployed-chromium"],
  ["DEPLOY-SMOKE-BROWSER-01", "deployed-chromium"],
]);

const CONTRACT_PATTERN = /\b(DEPLOY-SMOKE-[A-Z0-9]+-\d{2})\b/g;

export function collectPlaywrightContractTests(suites, contractPattern, parentTitles = [], collected = []) {
  for (const suite of suites ?? []) {
    const titles = suite.title ? [...parentTitles, suite.title] : parentTitles;
    for (const spec of suite.specs ?? []) {
      const fullTitle = [...titles, spec.title].join(" ");
      const contractIds = [...fullTitle.matchAll(contractPattern)].map((match) => match[1]);
      for (const test of spec.tests ?? []) {
        const results = test.results ?? [];
        collected.push({
          contractIds,
          title: fullTitle,
          projectName: String(test.projectName ?? "unknown"),
          status: String(test.status ?? "unknown"),
          resultStatuses: results.map((result) => String(result.status ?? "unknown")),
          retries: Math.max(0, results.length - 1),
          durationMs: results.reduce((total, result) => total + Number(result.duration ?? 0), 0),
        });
      }
    }
    collectPlaywrightContractTests(suite.suites, contractPattern, titles, collected);
  }
  return collected;
}

export function assertPlaywrightContractResults(report, { contractPattern, expectedContracts, label }) {
  const tests = collectPlaywrightContractTests(report?.suites, contractPattern);
  const contractTests = new Map([...expectedContracts.keys()].map((contractId) => [contractId, []]));
  const unknownContracts = new Set();
  const errors = [];

  for (const test of tests) {
    if (test.contractIds.length !== 1) {
      errors.push(`${test.projectName}:${test.title} must declare exactly one ${label} contract`);
      continue;
    }

    const [contractId] = test.contractIds;
    const matches = contractTests.get(contractId);
    if (matches) matches.push(test);
    else unknownContracts.add(contractId);
  }

  if (unknownContracts.size > 0) {
    errors.push(`unknown ${label} contracts: ${[...unknownContracts].sort().join(", ")}`);
  }

  const summary = [];
  for (const [contractId, expectedProject] of expectedContracts) {
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
    if (result.resultStatuses.length !== 1 || result.resultStatuses[0] !== "passed") {
      errors.push(`${contractId} must have one passed result (actual: ${result.resultStatuses.join(", ") || "none"})`);
    }
    summary.push({
      contractId,
      projectName: result.projectName,
      status: result.status,
      retries: result.retries,
      durationMs: result.durationMs,
    });
  }

  const stats = report?.stats;
  if (Number(stats?.expected ?? -1) !== expectedContracts.size) {
    errors.push(`report stats.expected must be ${expectedContracts.size} (actual: ${String(stats?.expected)})`);
  }
  for (const field of ["skipped", "unexpected", "flaky"]) {
    if (Number(stats?.[field] ?? -1) !== 0) {
      errors.push(`report stats.${field} must be 0 (actual: ${String(stats?.[field])})`);
    }
  }

  if (errors.length > 0) {
    const resultGateLabel = `${label.slice(0, 1).toUpperCase()}${label.slice(1)}`;
    throw new Error(`${resultGateLabel} result gate failed: ${errors.join("; ")}`);
  }
  return summary;
}

export function collectDeployedSmokeTests(suites) {
  return collectPlaywrightContractTests(suites, CONTRACT_PATTERN);
}

export function assertDeployedSmokeResults(report) {
  return assertPlaywrightContractResults(report, {
    contractPattern: CONTRACT_PATTERN,
    expectedContracts: EXPECTED_DEPLOYED_SMOKE_CONTRACTS,
    label: "deployed smoke",
  });
}

async function main() {
  const reportPath = process.argv[2];
  if (!reportPath || process.argv.length !== 3) {
    throw new Error("Usage: node scripts/assertDeployedSmokeResults.mjs <playwright-json-report>");
  }

  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const summary = assertDeployedSmokeResults(report);
  console.log(`Deployed smoke result gate passed: ${summary.map(({ contractId }) => contractId).join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Deployed smoke result gate failed.");
    process.exitCode = 1;
  });
}
