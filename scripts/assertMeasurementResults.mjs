import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { assertPlaywrightContractResults } from "./assertDeployedSmokeResults.mjs";

export const EXPECTED_MEASUREMENT_CONTRACTS = new Map([
  ["MEASUREMENT-BROWSER-01", "measurement-enabled-chromium"],
  ["MEASUREMENT-BROWSER-02", "measurement-enabled-chromium"],
]);

const CONTRACT_PATTERN = /\b(MEASUREMENT-BROWSER-\d{2})\b/g;

export function assertMeasurementResults(report) {
  return assertPlaywrightContractResults(report, {
    contractPattern: CONTRACT_PATTERN,
    expectedContracts: EXPECTED_MEASUREMENT_CONTRACTS,
    label: "measurement browser contract",
  });
}

async function main() {
  const reportPath = process.argv[2];
  if (!reportPath || process.argv.length !== 3) {
    throw new Error("Usage: node scripts/assertMeasurementResults.mjs <playwright-json-report>");
  }

  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const summary = assertMeasurementResults(report);
  console.log(`Measurement browser result gate passed: ${summary.map(({ contractId }) => contractId).join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Measurement browser result gate failed.");
    process.exitCode = 1;
  });
}
