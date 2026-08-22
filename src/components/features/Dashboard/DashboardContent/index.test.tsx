// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Component, type ReactNode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardContent } from ".";

type SourceKind = "recruitment" | "staff" | "registrationRequests" | "notificationFailures";
type QueryStage =
  | { status: "loading" }
  | { status: "ready"; data: { probeMountId: number; probeValueVersion: number } }
  | { status: "unavailable"; onRetry: () => void };

const sourceKinds: SourceKind[] = ["recruitment", "staff", "registrationRequests", "notificationFailures"];
const probes = vi.hoisted(() => ({
  shouldThrow: {
    recruitment: false,
    staff: false,
    registrationRequests: false,
    notificationFailures: false,
  },
  mounts: {
    recruitment: 0,
    staff: 0,
    registrationRequests: 0,
    notificationFailures: 0,
  },
  valueVersion: 1,
  viewThrows: false,
  recruitmentShopTargets: [] as Array<
    | {
        mode: "fixed";
        shop: { shopId: string; shopName: string };
      }
    | undefined
  >,
  staffOrganizationShopCounts: [] as Array<number | undefined>,
  viewSnapshots: [] as Array<{
    selectedShopId: string;
    stages: Record<SourceKind, { status: QueryStage["status"]; valueVersion?: number }>;
  }>,
}));

vi.mock("../DashboardAnnouncement", () => ({
  DashboardAnnouncement: ({ children }: { children: (state: { content: null }) => ReactNode }) =>
    children({ content: null }),
}));

vi.mock("../RecruitmentManagement", () => ({
  RecruitmentManagement: ({
    children,
    shopTarget,
  }: {
    children: (state: Record<string, unknown>) => ReactNode;
    shopTarget?: { mode: "fixed"; shop: { shopId: string; shopName: string } };
  }) => {
    const [probeMountId] = useState(() => ++probes.mounts.recruitment);
    probes.recruitmentShopTargets.push(shopTarget);
    if (probes.shouldThrow.recruitment) throw new Error("recruitment query failed");
    return children({
      isInitialLoading: false,
      probeMountId,
      probeValueVersion: probes.valueVersion,
      openRecruitments: [],
      currentRecruitments: [],
    });
  },
}));

vi.mock("../StaffManagement", () => ({
  StaffManagement: ({
    children,
    organizationShopCount,
  }: {
    children: (state: Record<string, unknown>) => ReactNode;
    organizationShopCount?: number;
  }) => {
    const [probeMountId] = useState(() => ++probes.mounts.staff);
    probes.staffOrganizationShopCounts.push(organizationShopCount);
    if (probes.shouldThrow.staff) throw new Error("staff query failed");
    return children({
      isInitialLoading: false,
      probeMountId,
      probeValueVersion: probes.valueVersion,
    });
  },
}));

vi.mock("../StaffRegistrationRequestManagement", () => ({
  StaffRegistrationRequestManagement: ({ children }: { children: (state: Record<string, unknown>) => ReactNode }) => {
    const [probeMountId] = useState(() => ++probes.mounts.registrationRequests);
    if (probes.shouldThrow.registrationRequests) throw new Error("registration request query failed");
    return children({
      isInitialLoading: false,
      probeMountId,
      probeValueVersion: probes.valueVersion,
    });
  },
}));

vi.mock("../NotificationFailureRecovery", () => ({
  NotificationFailureRecovery: ({ children }: { children: (state: Record<string, unknown>) => ReactNode }) => {
    const [probeMountId] = useState(() => ++probes.mounts.notificationFailures);
    if (probes.shouldThrow.notificationFailures) throw new Error("notification failure query failed");
    return children({
      isInitialLoading: false,
      probeMountId,
      probeValueVersion: probes.valueVersion,
    });
  },
}));

vi.mock("../Setup", () => ({
  Setup: () => <p>初期設定</p>,
}));

vi.mock("./DashboardContentView", () => ({
  DashboardContentSkeleton: () => <p>ダッシュボード読込中</p>,
  DashboardContentView: ({
    operationContextData,
    recruitment,
    staff,
    registrationRequests,
    notificationFailures,
  }: {
    operationContextData?: { selectedShop: { shopId: string } };
    recruitment: QueryStage;
    staff: QueryStage;
    registrationRequests: QueryStage;
    notificationFailures: QueryStage;
  }) => {
    const stages = { recruitment, staff, registrationRequests, notificationFailures };
    probes.viewSnapshots.push({
      selectedShopId: operationContextData?.selectedShop.shopId ?? "unknown",
      stages: Object.fromEntries(
        sourceKinds.map((kind) => [
          kind,
          {
            status: stages[kind].status,
            ...(stages[kind].status === "ready" ? { valueVersion: stages[kind].data.probeValueVersion } : {}),
          },
        ]),
      ) as Record<SourceKind, { status: QueryStage["status"]; valueVersion?: number }>,
    });

    if (probes.viewThrows) throw new Error("dashboard view failed");

    return (
      <section aria-label="production dashboard composition">
        {sourceKinds.map((kind) => {
          const stage = stages[kind];
          if (stage.status === "loading") return <p key={kind}>{kind}:loading</p>;
          if (stage.status === "unavailable") {
            return (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  probes.shouldThrow[kind] = false;
                  stage.onRetry();
                }}
              >
                {kind}を再試行
              </button>
            );
          }
          return (
            <p key={kind} data-testid={`${kind}-ready`}>
              {kind}:mount-{stage.data.probeMountId}:value-{stage.data.probeValueVersion}
            </p>
          );
        })}
      </section>
    );
  },
}));

const shop = {
  name: "テスト店舗",
  regularClosedDays: [],
  submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "18:00" },
};

function operationContextData(shopId: string) {
  const selectedShop = {
    shopId,
    shopName: `店舗${shopId}`,
    shopStatus: "active" as const,
    organizationId: "organization-1",
    organizationName: "テスト組織",
    organizationPlan: "pro" as const,
    memberStatus: "active" as const,
  };
  return { shops: [selectedShop], selectedShop };
}

function renderDashboard(shopId = "shop-1") {
  return render(
    <DashboardContent
      shop={shop}
      managerLegalConsentStatus={{
        required: false,
        documents: {
          terms: { title: "利用規約", path: "/terms/manager" },
          privacy: { title: "プライバシーポリシー", path: "/privacy/manager" },
        },
      }}
      operationContextData={operationContextData(shopId)}
    />,
  );
}

class ParentErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? <p>ページを表示できません</p> : this.props.children;
  }
}

beforeEach(() => {
  for (const kind of sourceKinds) {
    probes.shouldThrow[kind] = false;
    probes.mounts[kind] = 0;
  }
  probes.valueVersion = 1;
  probes.viewThrows = false;
  probes.recruitmentShopTargets = [];
  probes.staffOrganizationShopCounts = [];
  probes.viewSnapshots = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DashboardContent production composition", () => {
  it("OperationContextの選択店舗を募集作成フォームへ明示的に渡す", async () => {
    renderDashboard("app-home-shop");

    await screen.findByTestId("recruitment-ready");
    expect(probes.recruitmentShopTargets).toContainEqual({
      mode: "fixed",
      shop: { shopId: "app-home-shop", shopName: "店舗app-home-shop" },
    });
    expect(probes.staffOrganizationShopCounts).toContain(1);
  });

  it("OperationContextを注入しない旧Dashboardでは店舗指定を省略してatom fallbackを維持する", async () => {
    render(<DashboardContent shop={shop} />);

    await screen.findByTestId("recruitment-ready");
    expect(probes.recruitmentShopTargets.every((target) => target === undefined)).toBe(true);
  });

  it.each(sourceKinds)("%sのthrowだけを該当queryのunavailableへ分類する", async (failedKind) => {
    probes.shouldThrow[failedKind] = true;

    renderDashboard();

    expect(await screen.findByRole("button", { name: `${failedKind}を再試行` })).not.toBeNull();
    expect(screen.getAllByRole("button", { name: /を再試行$/ })).toHaveLength(1);
    for (const kind of sourceKinds.filter((kind) => kind !== failedKind)) {
      expect(screen.getByTestId(`${kind}-ready`)).not.toBeNull();
    }
  });

  it.each(sourceKinds)("%sの再試行は該当query ownerだけをremountする", async (failedKind) => {
    probes.shouldThrow[failedKind] = true;
    renderDashboard();
    const retry = await screen.findByRole("button", { name: `${failedKind}を再試行` });
    const mountsBeforeRetry = { ...probes.mounts };

    fireEvent.click(retry);

    expect(await screen.findByTestId(`${failedKind}-ready`)).not.toBeNull();
    expect(probes.mounts[failedKind]).toBeGreaterThan(mountsBeforeRetry[failedKind]);
    for (const kind of sourceKinds.filter((kind) => kind !== failedKind)) {
      expect(probes.mounts[kind]).toBe(mountsBeforeRetry[kind]);
      expect(screen.getByTestId(`${kind}-ready`)).not.toBeNull();
    }
  });

  it("取得済みの兄弟sectionを、別queryの失敗中と再試行後も保持する", async () => {
    probes.shouldThrow.recruitment = true;
    renderDashboard();
    const staffBeforeRetry = (await screen.findByTestId("staff-ready")).textContent;

    fireEvent.click(screen.getByRole("button", { name: "recruitmentを再試行" }));

    expect(await screen.findByTestId("recruitment-ready")).not.toBeNull();
    expect(screen.getByTestId("staff-ready").textContent).toBe(staffBeforeRetry);
  });

  it("通常Viewのrender errorはquery unavailableへ変換せず上位Error Boundaryへ伝播する", () => {
    probes.viewThrows = true;

    render(
      <ParentErrorBoundary>
        <DashboardContent shop={shop} operationContextData={operationContextData("shop-1")} />
      </ParentErrorBoundary>,
    );

    expect(screen.getByText("ページを表示できません")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /を再試行$/ })).toBeNull();
  });

  it("店舗切替の最初のrenderで切替前店舗のready stageを表示しない", async () => {
    const { rerender } = renderDashboard("shop-1");
    await screen.findByTestId("recruitment-ready");
    probes.valueVersion = 2;
    probes.viewSnapshots = [];

    rerender(
      <DashboardContent
        shop={shop}
        managerLegalConsentStatus={{
          required: false,
          documents: {
            terms: { title: "利用規約", path: "/terms" },
            privacy: { title: "プライバシーポリシー", path: "/privacy" },
          },
        }}
        operationContextData={operationContextData("shop-2")}
      />,
    );

    await screen.findByText("recruitment:mount-2:value-2");
    const nextShopSnapshots = probes.viewSnapshots.filter((snapshot) => snapshot.selectedShopId === "shop-2");
    expect(nextShopSnapshots[0]?.stages).toEqual({
      recruitment: { status: "loading" },
      staff: { status: "loading" },
      registrationRequests: { status: "loading" },
      notificationFailures: { status: "loading" },
    });
    expect(
      nextShopSnapshots.some((snapshot) => sourceKinds.some((kind) => snapshot.stages[kind].valueVersion === 1)),
    ).toBe(false);
  });

  it("shopがnullから同じ店舗へ戻る場合も以前のready stageを再利用しない", async () => {
    const { rerender } = renderDashboard("shop-1");
    await screen.findByTestId("recruitment-ready");

    rerender(<DashboardContent shop={null} operationContextData={operationContextData("shop-1")} />);
    expect(screen.getByText("初期設定")).not.toBeNull();
    probes.valueVersion = 2;
    probes.viewSnapshots = [];

    rerender(<DashboardContent shop={shop} operationContextData={operationContextData("shop-1")} />);

    await screen.findByText(/recruitment:mount-\d+:value-2/);
    expect(probes.viewSnapshots[0]?.stages.recruitment).toEqual({ status: "loading" });
    expect(probes.viewSnapshots.some((snapshot) => snapshot.stages.recruitment.valueVersion === 1)).toBe(false);
  });
});
