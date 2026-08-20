// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { ChakraProvider } from "@/src/providers/ChakraProvider";

const mocks = vi.hoisted(() => ({
  getManageOverview: Symbol("getManageOverview"),
  listOrganizationShops: Symbol("listOrganizationShops"),
  navigate: vi.fn(),
  useQuery: vi.fn(),
  usePaginatedQuery: vi.fn(),
  showErrorToast: vi.fn(),
  features: {
    organizationCreation: false,
    shopAddition: false,
    managerInvitation: false,
    billing: false,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ history: { back: vi.fn() } }),
}));
vi.mock("convex/react", () => ({
  useQuery: mocks.useQuery,
  usePaginatedQuery: mocks.usePaginatedQuery,
  useMutation: () => vi.fn(),
}));
vi.mock("@/convex/_generated/api", () => ({
  api: {
    appOrganization: {
      manageQueries: {
        getManageOverview: mocks.getManageOverview,
        listOrganizationShops: mocks.listOrganizationShops,
      },
    },
  },
}));
vi.mock("@/src/components/shared/feedback", () => ({
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: vi.fn(),
}));
vi.mock("@/src/components/templates/Animation", () => ({
  Animation: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/src/components/templates/AuthenticatedPageContent", () => ({
  AuthenticatedPageContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/src/components/ui/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/src/components/features/ManagerSettings", () => ({
  ManagerSettings: () => <output>manager settings</output>,
  ManagerSettingsSkeleton: () => <output>manager loading</output>,
  ManagerCandidatePageContent: () => <output>candidate</output>,
  ManagerCandidatePageSkeleton: () => <output>candidate loading</output>,
  ManagerExternalInviteForm: () => <output>external invite</output>,
  ManagerExternalInvitePageSkeleton: () => <output>external loading</output>,
}));
vi.mock("@/src/components/features/OrganizationSettings", () => ({
  OrganizationDeletionSection: () => null,
  OrganizationUsageSection: () => <output>usage</output>,
  PlanAndPaymentSection: () => null,
  ShopsSection: ({ showAddShop }: { showAddShop: boolean }) => (
    <output data-testid="show-add-shop">{String(showAddShop)}</output>
  ),
}));
vi.mock(
  "@/src/components/features/OrganizationSettings/OrganizationCreation/useOrganizationCreationController",
  () => ({
    useOrganizationCreationController: () => ({
      createOrganization: vi.fn(),
      dialog: { dialog: null, isRunning: false, onClose: vi.fn(), onSubmit: vi.fn() },
    }),
  }),
);
vi.mock("@/src/components/features/OrganizationSettings/OrganizationCreation/OrganizationCreationDialog", () => ({
  OrganizationCreationDialog: () => <output>creation dialog</output>,
}));
vi.mock("@/src/components/features/OrganizationSettings/ShopManagement/useShopManagementController", () => ({
  useShopManagementController: () => ({
    addShop: vi.fn(),
    dialog: { dialog: null, isRunning: false, onClose: vi.fn(), onSubmit: vi.fn() },
  }),
}));
vi.mock("@/src/components/features/OrganizationSettings/ShopManagement/ShopManagementDialog", () => ({
  ShopManagementDialog: () => <output>shop dialog</output>,
}));

import { AppManageBillingRoutePage, AppManageManagersRoutePage, AppManageRoutePage } from ".";

const organizationId = "organization-a" as Id<"organizations">;
const overview = () => ({
  organizationId,
  organizationName: "A組織",
  organizationCreatedAt: Date.parse("2026-01-01T00:00:00Z"),
  organizationUpdatedAt: Date.parse("2026-08-15T00:00:00Z"),
  memberStatus: "active" as const,
  usage: {
    state: "business",
    currentPlan: "business",
    peopleUsage: { current: 2, max: 100 },
    shopUsage: { current: 1, max: 10 },
    managerUsage: { current: 1, max: 5, pendingInvitations: 0 },
  },
  shopCounts: { active: 1, archived: 0, planSuspended: 0, hasOverflow: false },
  features: { ...mocks.features },
  capabilities: {
    canUpdateOrganizationName: true,
    canAddShop: mocks.features.shopAddition,
    canDeleteOrganization: false,
    canCreateOrganization: mocks.features.organizationCreation,
  },
});

const renderPage = (node: ReactNode) => render(<ChakraProvider>{node}</ChakraProvider>);

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  mocks.navigate.mockReset();
  mocks.useQuery.mockReset();
  mocks.usePaginatedQuery.mockReset();
  mocks.showErrorToast.mockReset();
  Object.assign(mocks.features, {
    organizationCreation: false,
    shopAddition: false,
    managerInvitation: false,
    billing: false,
  });
  mocks.useQuery.mockImplementation((reference: unknown) => {
    if (reference === mocks.getManageOverview) return overview();
    throw new Error("未公開機能のqueryが実行されました");
  });
  mocks.usePaginatedQuery.mockReturnValue({
    status: "Exhausted",
    results: [{ shopId: "shop-a", shopName: "A店舗", operatingStatus: "active" }],
    loadMore: vi.fn(),
  });
});

describe("AppManage release boundary", () => {
  it("閉状態では組織・店舗追加と管理者・支払いの導線をDOMへ出さない", () => {
    renderPage(<AppManageRoutePage organizationId={organizationId} memberStatus="active" />);

    expect(screen.getByRole("button", { name: "組織情報を開く" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "新しい組織を作る" })).toBeNull();
    expect(screen.queryByRole("button", { name: "管理者と権限を開く" })).toBeNull();
    expect(screen.queryByRole("button", { name: "プランと支払いを開く" })).toBeNull();
    expect(screen.getByTestId("show-add-shop").textContent).toBe("false");
    expect(screen.queryByText("creation dialog")).toBeNull();
    expect(screen.queryByText("shop dialog")).toBeNull();
  });

  it("明示的に有効な環境だけ将来機能の導線を描画する", () => {
    Object.assign(mocks.features, {
      organizationCreation: true,
      shopAddition: true,
      managerInvitation: true,
      billing: true,
    });

    renderPage(<AppManageRoutePage organizationId={organizationId} memberStatus="active" />);

    expect(screen.getByRole("button", { name: "新しい組織を作る" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "管理者と権限を開く" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "プランと支払いを開く" })).not.toBeNull();
    expect(screen.getByTestId("show-add-shop").textContent).toBe("true");
  });

  it("旧backendのDTOにfeaturesがない場合も将来機能をfail-closedにする", () => {
    const { features: _features, ...legacyOverview } = overview();
    mocks.useQuery.mockReturnValue(legacyOverview);

    renderPage(<AppManageRoutePage organizationId={organizationId} memberStatus="active" />);

    expect(screen.queryByRole("button", { name: "新しい組織を作る" })).toBeNull();
    expect(screen.queryByRole("button", { name: "管理者と権限を開く" })).toBeNull();
    expect(screen.queryByRole("button", { name: "プランと支払いを開く" })).toBeNull();
    expect(screen.getByTestId("show-add-shop").textContent).toBe("false");
  });

  it.each([
    ["管理者", <AppManageManagersRoutePage key="managers" organizationId={organizationId} memberStatus="active" />],
    ["支払い", <AppManageBillingRoutePage key="billing" organizationId={organizationId} memberStatus="active" />],
  ])("閉状態の%s direct routeは内容をqueryせず管理へreplaceする", async (_label, page) => {
    renderPage(page);

    expect(screen.getByText("この機能は現在利用できません。管理画面へ戻ります。")).not.toBeNull();
    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/manage",
        search: { org: organizationId },
        replace: true,
      });
    });
    expect(mocks.showErrorToast).toHaveBeenCalledOnce();
    expect(mocks.useQuery).toHaveBeenCalledTimes(1);
  });

  it("旧backendのDTOにfeaturesがないdirect routeも管理へreplaceする", async () => {
    const { features: _features, ...legacyOverview } = overview();
    mocks.useQuery.mockReturnValue(legacyOverview);

    renderPage(<AppManageManagersRoutePage organizationId={organizationId} memberStatus="active" />);

    expect(screen.getByText("この機能は現在利用できません。管理画面へ戻ります。")).not.toBeNull();
    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/manage",
        search: { org: organizationId },
        replace: true,
      });
    });
    expect(mocks.useQuery).toHaveBeenCalledTimes(1);
  });
});
