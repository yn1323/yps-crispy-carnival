export const ANALYTICS_PLAN_ID_VERSION = 2 as const;

export type AnalyticsPlanIdVersionParams = {
  planIdVersion: typeof ANALYTICS_PLAN_ID_VERSION;
};

/** 旧共有URLのplan IDをcanonical IDへ移し、以後のURL契約をv2へ固定する。 */
export function upgradeAnalyticsPlanSearchParams(params: URLSearchParams) {
  if (params.get("planIdVersion") === String(ANALYTICS_PLAN_ID_VERSION)) return false;

  const plan = params.get("plan");
  if (plan === "pro") params.set("plan", "standard");
  if (plan === "business") params.set("plan", "pro");
  params.set("planIdVersion", String(ANALYTICS_PLAN_ID_VERSION));
  return true;
}
