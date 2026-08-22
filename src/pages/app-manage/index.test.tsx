// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
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
  createOrganization: vi.fn(),
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
  showErrorToast: vi.fn(),
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
  ShopsSection: ({ canAddShop }: { canAddShop: boolean }) => (
    <output data-testid="can-add-shop">{String(canAddShop)}</output>
  ),
}));
vi.mock(
  "@/src/components/features/OrganizationSettings/OrganizationCreation/useOrganizationCreationController",
  () => ({
    useOrganizationCreationController: () => ({
      createOrganization: mocks.createOrganization,
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

import { AppManageRoutePage } from ".";

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
  capabilities: {
    canUpdateOrganizationName: true,
    canAddShop: true,
    canDeleteOrganization: false,
    canCreateOrganization: true,
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
  mocks.createOrganization.mockReset();
  mocks.useQuery.mockImplementation((reference: unknown) => {
    if (reference === mocks.getManageOverview) return overview();
    throw new Error("想定外のqueryが実行されました");
  });
  mocks.usePaginatedQuery.mockReturnValue({
    status: "Exhausted",
    results: [{ shopId: "shop-a", shopName: "A店舗", operatingStatus: "active" }],
    loadMore: vi.fn(),
  });
});

describe("AppManage", () => {
  it("組織・店舗追加と管理者・支払いの導線を常に表示する", () => {
    renderPage(<AppManageRoutePage organizationId={organizationId} memberStatus="active" />);

    expect(screen.getByRole("button", { name: "組織情報を開く" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "新しい組織を作る" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "管理者と権限を開く" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "プランと支払いを開く" })).not.toBeNull();
    expect(screen.getByTestId("can-add-shop").textContent).toBe("true");
    expect(screen.getByText("creation dialog")).not.toBeNull();
    expect(screen.getByText("shop dialog")).not.toBeNull();
  });

  it("組織作成上限では入口をdisabledにせず、クリックをcontrollerへ渡す", () => {
    const currentOverview = overview();
    mocks.useQuery.mockReturnValue({
      ...currentOverview,
      capabilities: {
        ...currentOverview.capabilities,
        canCreateOrganization: false,
        createOrganizationDisabledReason: "作成できる組織は3つまでです",
      },
    });

    renderPage(<AppManageRoutePage organizationId={organizationId} memberStatus="active" />);

    const button = screen.getByRole("button", { name: "新しい組織を作る" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.click();
    expect(mocks.createOrganization).toHaveBeenCalledOnce();
  });
});
