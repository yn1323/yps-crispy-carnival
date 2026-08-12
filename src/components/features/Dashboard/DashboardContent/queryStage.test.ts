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

  it.each(["recruitment", "registrationRequests", "notificationFailures"] as const)(
    "%sが取得できない場合はTODOの一部失敗として扱う",
    (key) => {
      const stages = {
        recruitment: ready(),
        staff: ready(),
        registrationRequests: ready(),
        notificationFailures: ready(),
      };

      expect(getDashboardStageReadiness({ ...stages, [key]: { status: "unavailable", onRetry: vi.fn() } })).toEqual(
        expect.objectContaining({ hasUnavailableTasks: true }),
      );
    },
  );

  it("スタッフ一覧だけの失敗はTODOの失敗に混ぜない", () => {
    expect(
      getDashboardStageReadiness({
        recruitment: ready(),
        staff: { status: "unavailable", onRetry: vi.fn() },
        registrationRequests: ready(),
        notificationFailures: ready(),
      }),
    ).toEqual({ canEvaluateOnboarding: false, hasUnavailableTasks: false });
  });
});
