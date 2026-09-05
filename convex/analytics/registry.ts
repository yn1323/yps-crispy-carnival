export const ANALYTICS_POLICY = {
  shopsPerPage: 20,
  recoveryDaysPerTick: 7,
  recoveryRunsPerStatus: 10,
  staleRunMs: 12 * 60 * 60 * 1000,
  retryDelaysMs: [60_000, 300_000, 900_000],
  retention: { detailMonths: 25, resultMonths: 60, pageSize: 50 },
} as const;
