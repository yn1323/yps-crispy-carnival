export const EXPECTED_CORE_CONTRACTS: Map<string, string>;

export type E2ECoreResultSummary = {
  contractId: string;
  projectName: string;
  status: string;
  retries: number;
  durationMs: number;
};

export type E2ECollectedTest = {
  contractIds: string[];
  title: string;
  projectName: string;
  status: string;
  retries: number;
  durationMs: number;
};

export function collectE2ETests(suites: unknown): E2ECollectedTest[];
export function assertE2ECoreResults(report: unknown): E2ECoreResultSummary[];
