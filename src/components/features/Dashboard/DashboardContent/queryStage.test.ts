import { describe, expect, it, vi } from "vitest";
import {
  type DashboardQueryStage,
  getDashboardStageReadiness,
  resolveDashboardQueryStage,
  unavailableDashboardQueryStage,
} from "./queryStage";

const ready = (): DashboardQueryStage<unknown> => ({ status: "ready", data: {} });

describe("Dashboard query stage", () => {
  it("初回取得中と取得済みを同じ空データとして扱わない", () => {
    expect(resolveDashboardQueryStage(true, [])).toEqual({ status: "loading" });
    expect(resolveDashboardQueryStage(false, [])).toEqual({ status: "ready", data: [] });
  });

  it("取得失敗は再試行を持つunavailableとして保持する", () => {
    const onRetry = vi.fn();

    const stage = unavailableDashboardQueryStage(onRetry);

    expect(stage).toEqual({ status: "unavailable", onRetry });
  });

  it.each(["recruitment", "staff", "registrationRequests"] as const)(
    "%sが未確定ならオンボーディングを評価しない",
    (key) => {
      const stages = {
        recruitment: ready(),
        staff: ready(),
        registrationRequests: ready(),
        notificationFailures: ready(),
      };

      expect(getDashboardStageReadiness({ ...stages, [key]: { status: "unavailable", onRetry: vi.fn() } })).toEqual(
        expect.objectContaining({ canEvaluateOnboarding: false }),
      );
    },
  );
});
