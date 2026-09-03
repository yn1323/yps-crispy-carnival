// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useShopQuery: vi.fn(),
  useShopPaginatedQuery: vi.fn(),
  getDashboardStaffOrderScopeRef: Symbol("getDashboardStaffOrderScope"),
  getDashboardStaffsRef: Symbol("getDashboardStaffs"),
  useStaffInvitation: vi.fn(),
}));

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
vi.mock("./StaffManagementView", () => ({
  StaffManagementView: ({
    staffs,
    onOpenDetail,
  }: {
    staffs: Array<{ name: string; organizationPersonId: string }>;
    onOpenDetail: (staff: { name: string; organizationPersonId: string }) => void;
  }) => (
    <>
      <output data-testid="staff-management-view">{staffs.map((staff) => staff.name).join(",")}</output>
      {staffs[0] && (
        <button type="button" onClick={() => onOpenDetail(staffs[0])}>
          先頭スタッフを開く
        </button>
      )}
    </>
  ),
}));
vi.mock("./useStaffInvitation", () => ({ useStaffInvitation: mocks.useStaffInvitation }));

import { StaffManagement } from ".";

const queryResult = {
  results: [{ _id: "staff-1", organizationPersonId: "person-1", name: "山田 花子", isManager: false }],
  status: "Exhausted",
  loadMore: vi.fn(),
};

const mixedStaffs = [
  { _id: "staff-1", organizationPersonId: "person-1", name: "一般スタッフA", isManager: false },
  { _id: "staff-2", organizationPersonId: "person-2", name: "管理者A", isManager: true },
  { _id: "staff-3", organizationPersonId: "person-3", name: "一般スタッフB", isManager: false },
  { _id: "staff-4", organizationPersonId: "person-4", name: "管理者B", isManager: true },
] as never;

function TestView() {
  return (
    <StaffManagement>
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
  mocks.useShopQuery.mockReset();
  mocks.useShopPaginatedQuery.mockReset();
  mocks.useStaffInvitation.mockReset();
  mocks.useShopQuery.mockReturnValue({ mode: "legacy" });
  mocks.useShopPaginatedQuery.mockReturnValue(queryResult);
  mocks.useStaffInvitation.mockReturnValue({});
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
      <StaffManagement data={{ staffs: mixedStaffs, status: "Exhausted", canLoadMore: false }}>
        {(state) => state.content}
      </StaffManagement>,
    );

    expect(mocks.useShopQuery).toHaveBeenCalledWith(mocks.getDashboardStaffOrderScopeRef, "skip");
    expect(mocks.useShopPaginatedQuery).toHaveBeenCalledWith(mocks.getDashboardStaffsRef, "skip", {
      initialNumItems: 11,
    });
    expect(screen.getByTestId("staff-management-view").textContent).toBe("一般スタッフA,管理者A,一般スタッフB,管理者B");
  });

  it("登録済みスタッフの追加を常に表示対象にする", () => {
    render(<StaffManagement>{(state) => state.content}</StaffManagement>);

    expect(mocks.useStaffInvitation).toHaveBeenLastCalledWith(false, true, undefined);
  });

  it("スタッフ行から組織人物の詳細ページを開く", () => {
    const onOpenStaffDetail = vi.fn();
    render(<StaffManagement onOpenStaffDetail={onOpenStaffDetail}>{(state) => state.content}</StaffManagement>);

    fireEvent.click(screen.getByRole("button", { name: "先頭スタッフを開く" }));

    expect(onOpenStaffDetail).toHaveBeenCalledWith("person-1", 10);
  });
});
