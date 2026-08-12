import type { DeployedSmokeResultSummary } from "./assertDeployedSmokeResults.mjs";

export const EXPECTED_MEASUREMENT_CONTRACTS: Map<string, string>;
export function assertMeasurementResults(report: unknown): DeployedSmokeResultSummary[];
