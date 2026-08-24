// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardPlanStatusSource, PlanStatusCardProps, PlanStatusCardUsage } from "./types";

const mocks = vi.hoisted(() => ({
  getDashboardPlanUsage: Symbol("getDashboardPlanUsage"),
  query: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: (query: unknown, args: unknown) => mocks.query(query, args),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    dashboard: {
      queries: { getDashboardPlanUsage: mocks.getDashboardPlanUsage },
    },
  },
}));

import { usePlanStatusCardController } from "./usePlanStatusCardController";

const paidPlan = {
  kind: "paidPlan",
  plan: "pro",
  isComplimentary: false,
  currentPeriodEndsAt: Date.parse("2026-08-31T15:00:00.000Z"),
  canManagePlan: true,
  canUpdatePaymentMethod: true,
} satisfies DashboardPlanStatusSource;

type ControllerProps = {
  planStatus: DashboardPlanStatusSource | null | undefined;
  shopId: string | undefined;
};

const planUsage = {
  peopleUsage: { current: 12, max: 25 },
  shopUsage: { current: 2, max: 5 },
} satisfies PlanStatusCardUsage;

beforeEach(() => {
  mocks.query.mockReset();
  mocks.query.mockReturnValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePlanStatusCardController", () => {
  it("店舗未確定・旧backend・新backend非表示では利用状況を購読しない", () => {
    const onOpenBillingSettings = vi.fn();
    const { result, rerender } = renderHook(
      ({ planStatus, shopId }: ControllerProps) =>
        usePlanStatusCardController({ planStatus, shopId, onOpenBillingSettings }),
      {
        initialProps: {
          planStatus: paidPlan,
          shopId: undefined,
        } as ControllerProps,
      },
    );

    expect(currentCard(result.current).usage).toBeUndefined();
    expect(mocks.query).toHaveBeenLastCalledWith(mocks.getDashboardPlanUsage, "skip");
    rerender({ planStatus: undefined, shopId: "shop-1" });
    expect(result.current).toBeUndefined();
    expect(mocks.query).toHaveBeenLastCalledWith(mocks.getDashboardPlanUsage, "skip");
    rerender({ planStatus: null, shopId: "shop-1" });
    expect(result.current).toBeNull();
    expect(mocks.query).toHaveBeenLastCalledWith(mocks.getDashboardPlanUsage, "skip");
  });

  it("手動展開中だけ固定した時刻で利用状況を購読し、再展開時に時刻を更新する", () => {
    vi.useFakeTimers();
    const firstOpenedAt = Date.parse("2026-08-11T01:00:00.000Z");
    const secondOpenedAt = Date.parse("2026-08-11T02:00:00.000Z");
    vi.setSystemTime(firstOpenedAt);
    mocks.query.mockReturnValue(planUsage);
    const { result } = renderHook(() =>
      usePlanStatusCardController({
        planStatus: paidPlan,
        shopId: "shop-1",
        onOpenBillingSettings: vi.fn(),
      }),
    );

    expect(mocks.query).toHaveBeenLastCalledWith(mocks.getDashboardPlanUsage, "skip");
    expect(currentCard(result.current).usage).toBeUndefined();

    act(() => currentCard(result.current).onExpandedChange?.(true));
    expect(mocks.query).toHaveBeenLastCalledWith(mocks.getDashboardPlanUsage, {
      shopId: "shop-1",
      now: firstOpenedAt,
    });
    expect(currentCard(result.current).usage).toEqual(planUsage);

    vi.setSystemTime(secondOpenedAt);
    act(() => currentCard(result.current).onExpandedChange?.(false));
    expect(mocks.query).toHaveBeenLastCalledWith(mocks.getDashboardPlanUsage, "skip");
    expect(currentCard(result.current).usage).toBeUndefined();

    act(() => currentCard(result.current).onExpandedChange?.(true));
    expect(mocks.query).toHaveBeenLastCalledWith(mocks.getDashboardPlanUsage, {
      shopId: "shop-1",
      now: secondOpenedAt,
    });
  });

  it("app routeでは店舗とcanonical organizationを同じ利用状況queryへ渡す", () => {
    vi.useFakeTimers();
    const openedAt = Date.parse("2026-08-11T02:30:00.000Z");
    vi.setSystemTime(openedAt);
    const { result } = renderHook(() =>
      usePlanStatusCardController({
        planStatus: paidPlan,
        shopId: "shop-1",
        expectedOrganizationId: "organization-1" as never,
        onOpenBillingSettings: vi.fn(),
      }),
    );

    act(() => currentCard(result.current).onExpandedChange?.(true));

    expect(mocks.query).toHaveBeenLastCalledWith(mocks.getDashboardPlanUsage, {
      shopId: "shop-1",
      expectedOrganizationId: "organization-1",
      now: openedAt,
    });
  });

  it.each([
    {
      name: "支払い問題",
      source: {
        kind: "paymentIssue",
        phase: "grace",
        canManagePlan: true,
        canUpdatePaymentMethod: true,
      } satisfies DashboardPlanStatusSource,
    },
    {
      name: "契約制限中",
      source: {
        kind: "restricted",
        displayPlan: "free",
        canManagePlan: true,
        canUpdatePaymentMethod: false,
      } satisfies DashboardPlanStatusSource,
    },
    {
      name: "終了7日前の未選択トライアル",
      source: {
        kind: "trial",
        trialEndsAt: Date.parse("2026-08-17T15:00:00.000Z"),
        canManagePlan: true,
        canUpdatePaymentMethod: false,
      } satisfies DashboardPlanStatusSource,
    },
  ])("$nameの自動展開では初回から利用状況を購読する", ({ source }) => {
    vi.useFakeTimers();
    const openedAt = Date.parse("2026-08-11T03:00:00.000Z");
    vi.setSystemTime(openedAt);

    const { result } = renderHook(() =>
      usePlanStatusCardController({
        planStatus: source,
        shopId: "shop-1",
        onOpenBillingSettings: vi.fn(),
      }),
    );

    expect(currentCard(result.current).defaultExpanded).toBe(true);
    expect(mocks.query).toHaveBeenLastCalledWith(mocks.getDashboardPlanUsage, {
      shopId: "shop-1",
      now: openedAt,
    });
  });

  it("店舗切替時は旧店舗の利用状況を渡さず、自動展開する新店舗をloadingへ戻す", () => {
    vi.useFakeTimers();
    const firstOpenedAt = Date.parse("2026-08-11T04:00:00.000Z");
    const secondOpenedAt = Date.parse("2026-08-11T05:00:00.000Z");
    vi.setSystemTime(firstOpenedAt);
    mocks.query.mockImplementation((_query, args) => {
      if (args === "skip") return planUsage;
      return args.shopId === "shop-a" ? planUsage : undefined;
    });
    const paymentIssue = {
      kind: "paymentIssue",
      phase: "grace",
      canManagePlan: true,
      canUpdatePaymentMethod: true,
    } satisfies DashboardPlanStatusSource;
    const { result, rerender } = renderHook(
      ({ shopId }) =>
        usePlanStatusCardController({
          planStatus: paymentIssue,
          shopId,
          onOpenBillingSettings: vi.fn(),
        }),
      { initialProps: { shopId: "shop-a" } },
    );

    expect(currentCard(result.current).usage).toEqual(planUsage);
    vi.setSystemTime(secondOpenedAt);
    rerender({ shopId: "shop-b" });

    expect(currentCard(result.current).usage).toBeUndefined();
    expect(mocks.query).toHaveBeenLastCalledWith(mocks.getDashboardPlanUsage, {
      shopId: "shop-b",
      now: secondOpenedAt,
    });
  });

  it("利用状況のloading・非表示・取得成功を共通propへ区別して渡す", () => {
    let queryResult: PlanStatusCardUsage | null | undefined;
    mocks.query.mockImplementation(() => queryResult);
    const paymentIssue = {
      kind: "paymentIssue",
      phase: "grace",
      canManagePlan: true,
      canUpdatePaymentMethod: true,
    } satisfies DashboardPlanStatusSource;
    const { result, rerender } = renderHook(() =>
      usePlanStatusCardController({
        planStatus: paymentIssue,
        shopId: "shop-1",
        onOpenBillingSettings: vi.fn(),
      }),
    );

    expect(currentCard(result.current).usage).toBeUndefined();
    queryResult = null;
    rerender();
    expect(currentCard(result.current).usage).toBeNull();
    queryResult = planUsage;
    rerender();
    expect(currentCard(result.current).usage).toEqual(planUsage);
  });

  it("CTAはbilling設定へ進み、後で確認では遷移しない", () => {
    const onOpenBillingSettings = vi.fn();
    const { result } = renderHook(() =>
      usePlanStatusCardController({
        planStatus: paidPlan,
        shopId: "shop-1",
        onOpenBillingSettings,
      }),
    );

    act(() => currentCard(result.current).onAction("openPlanAndPayment"));
    expect(onOpenBillingSettings).toHaveBeenCalledOnce();
    act(() => currentCard(result.current).onAction("remindLater"));
    expect(onOpenBillingSettings).toHaveBeenCalledOnce();
  });

  it("支払い問題・契約制限中・終了7日前の未選択トライアルだけを初期展開する", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-08-10T03:00:00.000Z"));
    const paymentIssue = renderHook(() =>
      usePlanStatusCardController({
        planStatus: {
          kind: "paymentIssue",
          phase: "grace",
          canManagePlan: true,
          canUpdatePaymentMethod: true,
        },
        shopId: "shop-1",
        onOpenBillingSettings: vi.fn(),
      }),
    );
    const trial = renderHook(() =>
      usePlanStatusCardController({
        planStatus: {
          kind: "trial",
          trialEndsAt: Date.parse("2026-08-16T15:00:00.000Z"),
          canManagePlan: true,
          canUpdatePaymentMethod: false,
        },
        shopId: "shop-1",
        onOpenBillingSettings: vi.fn(),
      }),
    );
    const restricted = renderHook(() =>
      usePlanStatusCardController({
        planStatus: {
          kind: "restricted",
          displayPlan: "free",
          canManagePlan: true,
          canUpdatePaymentMethod: false,
        },
        shopId: "shop-1",
        onOpenBillingSettings: vi.fn(),
      }),
    );
    const selectedTrial = renderHook(() =>
      usePlanStatusCardController({
        planStatus: {
          kind: "trial",
          trialEndsAt: Date.parse("2026-08-16T15:00:00.000Z"),
          selectedPaidPlan: "pro",
          canManagePlan: true,
          canUpdatePaymentMethod: true,
        },
        shopId: "shop-1",
        onOpenBillingSettings: vi.fn(),
      }),
    );

    expect(currentCard(paymentIssue.result.current).defaultExpanded).toBe(true);
    expect(currentCard(restricted.result.current).defaultExpanded).toBe(true);
    expect(currentCard(trial.result.current).defaultExpanded).toBe(true);
    expect(currentCard(selectedTrial.result.current).defaultExpanded).toBe(false);
  });

  it("JSTの日付境界と終了境界で残日数と表示有無を再評価する", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-08-10T14:59:00.000Z"));
    const trialEndsAt = Date.parse("2026-08-17T15:00:00.000Z");
    const { result } = renderHook(() =>
      usePlanStatusCardController({
        planStatus: {
          kind: "trial",
          trialEndsAt,
          canManagePlan: true,
          canUpdatePaymentMethod: false,
        },
        shopId: "shop-1",
        onOpenBillingSettings: vi.fn(),
      }),
    );

    expect(currentCard(result.current).data).toMatchObject({ remainingDays: 8 });
    act(() => vi.advanceTimersByTime(60_000));
    expect(currentCard(result.current).data).toMatchObject({ remainingDays: 7 });

    act(() => vi.advanceTimersByTime(trialEndsAt - Date.now()));
    expect(result.current).toBeNull();
  });
});

function currentCard(value: PlanStatusCardProps | null | undefined): PlanStatusCardProps {
  if (!value) throw new Error("PlanStatusCardが表示されていません");
  return value;
}
