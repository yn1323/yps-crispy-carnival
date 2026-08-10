export const EXPECTED_A11Y_CONTRACT: {
  contractId: string;
  projectName: string;
};

export type E2EA11yResultSummary = {
  contractId: string;
  projectName: string;
  status: string;
  retries: number;
  durationMs: number;
};

export function assertE2EA11yResults(report: unknown): E2EA11yResultSummary;
