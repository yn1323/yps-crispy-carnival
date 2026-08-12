export type DashboardQueryStage<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "unavailable"; onRetry: () => void };

export type DashboardQueryStageSet = {
  recruitment: DashboardQueryStage<unknown>;
  staff: DashboardQueryStage<unknown>;
  registrationRequests: DashboardQueryStage<unknown>;
  notificationFailures: DashboardQueryStage<unknown>;
};

export function resolveDashboardQueryStage<T>(isInitialLoading: boolean, data: T): DashboardQueryStage<T> {
  return isInitialLoading ? { status: "loading" } : { status: "ready", data };
}

export function unavailableDashboardQueryStage<T>(onRetry: () => void): DashboardQueryStage<T> {
  return { status: "unavailable", onRetry };
}

export function getDashboardStageReadiness(stages: DashboardQueryStageSet) {
  return {
    canEvaluateOnboarding:
      stages.recruitment.status === "ready" &&
      stages.staff.status === "ready" &&
      stages.registrationRequests.status === "ready",
    hasUnavailableTasks:
      stages.recruitment.status === "unavailable" ||
      stages.registrationRequests.status === "unavailable" ||
      stages.notificationFailures.status === "unavailable",
  };
}
