export const E2E_BURN_IN_PHASES: Map<
  string,
  {
    projectName: string;
    setupCount: number;
    repetitions: number;
    contractIds: string[];
  }
>;

export type E2EBurnInResultSummary = {
  contractId: string;
  count: number;
};

export function assertE2EBurnInResults(report: unknown, phaseName: string): E2EBurnInResultSummary[];
