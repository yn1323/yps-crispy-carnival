// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useAtomValue: vi.fn(),
  useShopQuery: vi.fn(),
  useShopPaginatedQuery: vi.fn(),
  getDashboardStaffOrderScopeRef: Symbol("getDashboardStaffOrderScope"),
  getDashboardStaffsRef: Symbol("getDashboardStaffs"),
  selectedShopAtomRef: Symbol("selectedShopAtom"),
  featureVisibilityAtomRef: Symbol("featureVisibilityAtom"),
}));

vi.mock("jotai", () => ({ useAtomValue: mocks.useAtomValue }));
vi.mock("@/convex/_generated/api", () => ({
  api: {
    dashboard: {
      queries: {
        getDashboardStaffOrderScope: mocks.getDashboardStaffOrderScopeRef,
        getDashboardStaffs: mocks.getDashboardStaffsRef,
      },
    },
  },
}));
vi.mock("@/src/hooks/useShopQuery", () => ({ useShopQuery: mocks.useShopQuery }));
vi.mock("@/src/hooks/useShopPaginatedQuery", () => ({ useShopPaginatedQuery: mocks.useShopPaginatedQuery }));
vi.mock("@/src/providers/ManagerShopScopeProvider", () => ({
  useManagerShopScope: () => ({ shopId: "shop-1", expectedOrganizationId: "organization-1" }),
}));
vi.mock("@/src/stores/shop", () => ({ selectedShopAtom: mocks.selectedShopAtomRef }));
vi.mock("@/src/stores/user", () => ({ featureVisibilityAtom: mocks.featureVisibilityAtomRef }));
vi.mock("@/src/components/features/StaffNotificationHistory", () => ({ StaffNotificationHistory: () => null }));
vi.mock("./StaffManagementView", () => ({
  StaffManagementView: ({ staffs }: { staffs: Array<{ name: string }> }) => (
    <output data-testid="staff-management-view">{staffs.map((staff) => staff.name).join(",")}</output>
  ),
}));
vi.mock("./useStaffInvitation", () => ({ useStaffInvitation: () => ({}) }));
vi.mock("./useStaffLineConnection", () => ({
  useStaffLineConnection: () => ({
    reset: vi.fn(),
    onShowQr: vi.fn(),
    qrState: null,
    onSendInvite: vi.fn(),
    isSendingInvite: false,
  }),
}));
vi.mock("./useStaffProfileManagement", () => ({
  useStaffProfileManagement: () => ({
    staff: null,
    dialog: { isOpen: false },
    onOpen: vi.fn(),
    onOpenChange: vi.fn(),
    onClose: vi.fn(),
    onEdit: vi.fn(),
    isEditing: false,
    onDelete: vi.fn(),
    isDeleting: false,
    onChangeShiftTarget: vi.fn(),
    isChangingShiftTarget: false,
  }),
}));
vi.mock("./useStaffNotificationDelivery", () => ({
  useStaffNotificationDelivery: () => ({
    onSendRecruitments: vi.fn(),
    isSendingRecruitments: false,
    onSendCurrentShift: vi.fn(),
    isSendingCurrentShift: false,
  }),
}));

import { StaffManagement } from ".";

const queryResult = {
  results: [{ _id: "staff-1", name: "山田 花子", isManager: false }],
  status: "Exhausted",
  loadMore: vi.fn(),
};

const mixedStaffs = [
  { _id: "staff-1", name: "一般スタッフA", isManager: false },
  { _id: "staff-2", name: "管理者A", isManager: true },
  { _id: "staff-3", name: "一般スタッフB", isManager: false },
  { _id: "staff-4", name: "管理者B", isManager: true },
] as never;

function TestView() {
  return (
    <StaffManagement openRecruitments={[]} currentRecruitments={[]}>
      {(state) => (
        <>
          <output data-testid="initial-loading">{String(state.isInitialLoading)}</output>
          {state.content}
        </>
      )}
    </StaffManagement>
  );
}

beforeEach(() => {
  mocks.useAtomValue.mockReset();
  mocks.useShopQuery.mockReset();
  mocks.useShopPaginatedQuery.mockReset();
  mocks.useAtomValue.mockImplementation((atom) =>
    atom === mocks.featureVisibilityAtomRef ? { shopMembershipAddition: true } : null,
  );
  mocks.useShopQuery.mockReturnValue({ mode: "legacy" });
  mocks.useShopPaginatedQuery.mockReturnValue(queryResult);
});

describe("StaffManagement staff order scope", () => {
  it("scopeの取得完了までpaginationをskipし、revision更新でquery identityを分ける", () => {
    mocks.useShopQuery.mockReturnValue(undefined);
    mocks.useShopPaginatedQuery.mockReturnValue({ ...queryResult, results: [], status: "LoadingFirstPage" });
    const { rerender } = render(<TestView />);

    expect(mocks.useShopPaginatedQuery).toHaveBeenLastCalledWith(mocks.getDashboardStaffsRef, "skip", {
      initialNumItems: 11,
    });
    expect(screen.getByTestId("initial-loading").textContent).toBe("true");

    mocks.useShopQuery.mockReturnValue({ mode: "ordered", revision: 9 });
    mocks.useShopPaginatedQuery.mockReturnValue(queryResult);
    rerender(<TestView />);

    expect(mocks.useShopPaginatedQuery).toHaveBeenLastCalledWith(
      mocks.getDashboardStaffsRef,
      { orderRevision: 9 },
      { initialNumItems: 11 },
    );
    expect(screen.getByTestId("staff-management-view").textContent).toBe("山田 花子");
  });

  it("legacy scopeはnull revisionを明示して旧順paginationを開始する", () => {
    mocks.useShopPaginatedQuery.mockReturnValue({ ...queryResult, results: mixedStaffs });
    render(<TestView />);

    expect(mocks.useShopQuery).toHaveBeenCalledWith(mocks.getDashboardStaffOrderScopeRef, {});
    expect(mocks.useShopPaginatedQuery).toHaveBeenLastCalledWith(
      mocks.getDashboardStaffsRef,
      { orderRevision: null },
      { initialNumItems: 11 },
    );
    expect(screen.getByTestId("staff-management-view").textContent).toBe("管理者A,管理者B,一般スタッフA,一般スタッフB");
  });

  it("ordered scopeはquery入力順をそのまま表示する", () => {
    mocks.useShopQuery.mockReturnValue({ mode: "ordered", revision: 9 });
    mocks.useShopPaginatedQuery.mockReturnValue({ ...queryResult, results: mixedStaffs });
    render(<TestView />);

    expect(screen.getByTestId("staff-management-view").textContent).toBe("一般スタッフA,管理者A,一般スタッフB,管理者B");
  });

  it("Story等の注入dataではscopeとpaginationをskipする", () => {
    render(
      <StaffManagement
        data={{ staffs: mixedStaffs, status: "Exhausted", canLoadMore: false }}
        openRecruitments={[]}
        currentRecruitments={[]}
      >
        {(state) => state.content}
      </StaffManagement>,
    );

    expect(mocks.useShopQuery).toHaveBeenCalledWith(mocks.getDashboardStaffOrderScopeRef, "skip");
    expect(mocks.useShopPaginatedQuery).toHaveBeenCalledWith(mocks.getDashboardStaffsRef, "skip", {
      initialNumItems: 11,
    });
    expect(screen.getByTestId("staff-management-view").textContent).toBe("一般スタッフA,管理者A,一般スタッフB,管理者B");
  });
});
