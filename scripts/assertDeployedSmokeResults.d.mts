export const EXPECTED_DEPLOYED_SMOKE_CONTRACTS: Map<string, string>;

export type DeployedSmokeResultSummary = {
  contractId: string;
  projectName: string;
  status: string;
  retries: number;
  durationMs: number;
};

export type DeployedSmokeCollectedTest = {
  contractIds: string[];
  durationMs: number;
  projectName: string;
  resultStatuses: string[];
  retries: number;
  status: string;
  title: string;
};

export type PlaywrightContractGateOptions = {
  contractPattern: RegExp;
  expectedContracts: Map<string, string>;
  label: string;
};

export function collectPlaywrightContractTests(suites: unknown, contractPattern: RegExp): DeployedSmokeCollectedTest[];
export function assertPlaywrightContractResults(
  report: unknown,
  options: PlaywrightContractGateOptions,
): DeployedSmokeResultSummary[];
export function collectDeployedSmokeTests(suites: unknown): DeployedSmokeCollectedTest[];
export function assertDeployedSmokeResults(report: unknown): DeployedSmokeResultSummary[];
