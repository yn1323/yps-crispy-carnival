export const ANALYTICS_POLICY = {
  shopsPerPage: 20,
  /** 2名以上・通知ありの組織・店舗を数える段階で、1回のmutationで確認する上限。 */
  engagementTargetsPerPage: 100,
  recoveryDaysPerTick: 7,
  recoveryRunsPerStatus: 10,
  staleRunMs: 12 * 60 * 60 * 1000,
  retryDelaysMs: [60_000, 300_000, 900_000],
  retention: { detailMonths: 25, resultMonths: 60, pageSize: 50 },
} as const;
