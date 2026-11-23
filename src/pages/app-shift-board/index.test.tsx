// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  scopeQueryRef: Symbol("getShiftBoardShopScopeForOrganization"),
  dataQueryRef: Symbol("getShiftBoardData"),
  dateNotesQueryRef: Symbol("getShiftBoardDateNotes"),
  staffingQueryRef: Symbol("getShiftBoardStaffing"),
  queryResults: {
    scope: undefined as unknown,
    data: undefined as unknown,
    dateNotes: undefined as unknown,
    staffing: undefined as unknown,
  },
}));

vi.mock("@/src/components/features/ShiftExport", () => ({ useOpenShiftExport: () => vi.fn() }));

vi.mock("@chakra-ui/react", () => ({
  Box: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Flex: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("convex/react", () => ({ useQuery: mocks.useQuery }));
vi.mock("@/convex/_generated/api", () => ({
  api: {
    shiftBoard: {
      queries: {
        getShiftBoardShopScopeForOrganization: mocks.scopeQueryRef,
        getShiftBoardData: mocks.dataQueryRef,
        getShiftBoardDateNotes: mocks.dateNotesQueryRef,
        getShiftBoardStaffing: mocks.staffingQueryRef,
      },
    },
  },
}));
vi.mock("@/src/components/features/ShiftBoard", () => ({
  ShiftBoardPage: ({
    data,
    layout,
    header,
    dateNotes,
    staffing,
    onChromeHiddenChange,
  }: {
    data: { shopId: string };
    layout?: string;
    header?: { desktopTitle: string };
    dateNotes?: unknown;
    staffing?: unknown;
    onChromeHiddenChange?: (isHidden: boolean) => void;
  }) => (
    <>
      {/* シフト表の内側のスクロールで、上の行を隠す・表示するを伝える操作の代わり。 */}
      <button type="button" onClick={() => onChromeHiddenChange?.(true)}>
        上の行を隠す
      </button>
      <button type="button" onClick={() => onChromeHiddenChange?.(false)}>
        上の行を表示する
      </button>
      <output
        data-testid="shop-id"
        data-layout={layout}
        data-date-notes={JSON.stringify(dateNotes)}
        data-staffing={JSON.stringify(staffing ?? null)}
      >
        {data.shopId}
      </output>
      {header && <h1>{header.desktopTitle}</h1>}
    </>
  ),
}));
vi.mock("@/src/components/templates/Animation", () => ({
  Animation: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/src/components/templates/AuthenticatedAppShell", () => ({
  AUTHENTICATED_APP_CONTENT_HEIGHT: "100dvh",
}));
vi.mock("@/src/components/ui/Button", () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock("@/src/components/ui/Empty", () => ({
  Empty: ({ title, description }: { title: ReactNode; description?: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  ),
}));
vi.mock("@/src/components/ui/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/src/components/ui/ShiftoriLoading", () => ({
  ShiftoriLoading: ({ message }: { message?: ReactNode }) => <output>{message}</output>,
}));
vi.mock("@/src/hooks/useShiftBoardDayKey", () => ({
  useShiftBoardDayKey: () => "2026-08-14:test",
}));
vi.mock("@/src/providers/ManagerShopScopeProvider", () => ({
  ManagerShopScopeProvider: ({
    children,
    shopId,
    expectedOrganizationId,
  }: {
    children: ReactNode;
    shopId: string;
    expectedOrganizationId: string;
  }) => (
    <section data-testid="manager-shop-scope" data-shop-id={shopId} data-organization-id={expectedOrganizationId}>
      {children}
    </section>
  ),
}));

import { AppHeaderVisibilityProvider, useAppHeaderVisibility } from "@/src/providers/AppHeaderVisibilityProvider";
import { AppShiftBoardRoutePage } from ".";

/** アプリのヘッダーが、画面の内側のスクロールで隠されているかを読む。 */
function AppHeaderHiddenProbe() {
  const { isHiddenByContent } = useAppHeaderVisibility();
  return <output data-testid="app-header-hidden">{String(isHiddenByContent)}</output>;
}

/** アプリの枠の中で、シフト表とほかの画面を切り替える。 */
function AppScreen({ showsShiftBoard }: { showsShiftBoard: boolean }) {
  return (
    <AppHeaderVisibilityProvider>
      <AppHeaderHiddenProbe />
      {showsShiftBoard && <AppShiftBoardRoutePage organizationId="organization-1" recruitmentId="recruitment-1" />}
    </AppHeaderVisibilityProvider>
  );
}

const staffing = {
  breakRule: { minWorkMinutes: 360, breakMinutes: 60 },
  staffProfiles: [],
  hasPreviousConfirmedRecruitment: true,
  isAiDraftConfigured: false,
  aiDraftRemainingCount: 3,
  isLocked: false,
  templates: [{ _id: "template-1", name: "通常" }],
  days: [
    {
      date: "2026-08-17",
      source: "weekday",
      templateId: "template-1",
      templateName: "通常",
      requirements: { kind: "time", bars: [{ positionId: "position-1", startTime: "09:00", endTime: "22:00" }] },
    },
  ],
};
const boardData = {
  shopId: "shop-1",
  recruitment: { deadline: "2026-08-12", periodStart: "2026-08-17", periodEnd: "2026-08-24", status: "open" },
  staffs: [],
};

beforeEach(() => {
  mocks.useQuery.mockReset();
  mocks.queryResults.scope = undefined;
  mocks.queryResults.data = undefined;
  mocks.queryResults.dateNotes = undefined;
  mocks.queryResults.staffing = undefined;
  mocks.useQuery.mockImplementation((reference) => {
    if (reference === mocks.scopeQueryRef) return mocks.queryResults.scope;
    if (reference === mocks.dataQueryRef) return mocks.queryResults.data;
    if (reference === mocks.dateNotesQueryRef) return mocks.queryResults.dateNotes;
    if (reference === mocks.staffingQueryRef) return mocks.queryResults.staffing;
    throw new Error("unexpected query reference");
  });
});

describe("AppShiftBoardRoutePage", () => {
  it("URLのorgと募集IDでqueryし、店舗名と募集期間をヘッダーへ表示する", async () => {
    mocks.queryResults.scope = { shopId: "shop-1", shopName: "yn1323店舗" };
    mocks.queryResults.data = {
      shopId: "shop-1",
      recruitment: {
        deadline: "2026-08-12",
        periodStart: "2026-08-17",
        periodEnd: "2026-08-24",
        status: "open",
      },
      staffs: [{ isSubmitted: true }, { isSubmitted: false }, { isSubmitted: true, isRemoved: true }],
    };
    mocks.queryResults.staffing = staffing;

    render(<AppShiftBoardRoutePage organizationId="organization-1" recruitmentId="recruitment-1" />);

    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.scopeQueryRef, {
      organizationId: "organization-1",
      recruitmentId: "recruitment-1",
    });
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.dataQueryRef, {
      shopId: "shop-1",
      expectedOrganizationId: "organization-1",
      recruitmentId: "recruitment-1",
      refreshDayKey: "2026-08-14:test",
    });
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.dateNotesQueryRef, {
      shopId: "shop-1",
      expectedOrganizationId: "organization-1",
      recruitmentId: "recruitment-1",
    });
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.staffingQueryRef, {
      shopId: "shop-1",
      expectedOrganizationId: "organization-1",
      recruitmentId: "recruitment-1",
    });
    expect(screen.getByTestId("shop-id").textContent).toBe("shop-1");
    expect(screen.getByTestId("shop-id").getAttribute("data-layout")).toBe("app");
    expect(screen.getByTestId("shop-id").getAttribute("data-date-notes")).toBe(JSON.stringify("loading"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "yn1323店舗：8/17 〜 24" })).not.toBeNull());
    const managerShopScope = screen.getByTestId("manager-shop-scope");
    expect(managerShopScope.getAttribute("data-shop-id")).toBe("shop-1");
    expect(managerShopScope.getAttribute("data-organization-id")).toBe("organization-1");
  });

  it("serverが対象外と判定した募集は空画面にせず利用不可を表示する", () => {
    mocks.queryResults.scope = null;

    render(<AppShiftBoardRoutePage organizationId="organization-1" recruitmentId="other-recruitment" />);

    expect(screen.getByRole("heading", { name: "シフト表が見つかりません" })).not.toBeNull();
    expect(screen.getByText(/この組織から閲覧できない可能性/)).not.toBeNull();
  });

  it("日付メモを取得できたらシフト表へ渡し、対象外ならメモなしとして扱う", () => {
    mocks.queryResults.scope = { shopId: "shop-1", shopName: "メモ店舗" };
    mocks.queryResults.data = {
      shopId: "shop-1",
      recruitment: { deadline: "2026-08-12", periodStart: "2026-08-17", periodEnd: "2026-08-24", status: "open" },
      staffs: [],
    };
    mocks.queryResults.dateNotes = [{ staffId: "staff-1", date: "2026-08-17", note: "17時以降なら入れます" }];
    mocks.queryResults.staffing = staffing;

    const { rerender } = render(
      <AppShiftBoardRoutePage organizationId="organization-1" recruitmentId="recruitment-1" />,
    );
    expect(screen.getByTestId("shop-id").getAttribute("data-date-notes")).toBe(
      JSON.stringify([{ staffId: "staff-1", date: "2026-08-17", note: "17時以降なら入れます" }]),
    );

    mocks.queryResults.dateNotes = null;
    rerender(<AppShiftBoardRoutePage organizationId="organization-1" recruitmentId="recruitment-1" />);
    expect(screen.getByTestId("shop-id").getAttribute("data-date-notes")).toBe(JSON.stringify([]));
  });

  it("店舗のscopeを確認できるまでは、シフト表・日付メモ・店舗の設定を購読しない", () => {
    render(<AppShiftBoardRoutePage organizationId="organization-1" recruitmentId="recruitment-1" />);

    const skipped = [mocks.dataQueryRef, mocks.dateNotesQueryRef, mocks.staffingQueryRef].map((reference) =>
      mocks.useQuery.mock.calls.filter(([calledReference]) => calledReference === reference).map(([, args]) => args),
    );
    expect(skipped).toEqual([["skip"], ["skip"], ["skip"]]);
    expect(screen.getByText("Loading...")).not.toBeNull();
    expect(screen.queryByTestId("shop-id")).toBeNull();
  });

  it("店舗の設定を読み込み中はLoadingのままにし、読み込めたらシフト表へ渡す", () => {
    mocks.queryResults.scope = { shopId: "shop-1", shopName: "設定店舗" };
    mocks.queryResults.data = boardData;

    const { rerender } = render(
      <AppShiftBoardRoutePage organizationId="organization-1" recruitmentId="recruitment-1" />,
    );
    expect(screen.getByText("Loading...")).not.toBeNull();
    expect(screen.queryByTestId("shop-id")).toBeNull();

    mocks.queryResults.staffing = staffing;
    rerender(<AppShiftBoardRoutePage organizationId="organization-1" recruitmentId="recruitment-1" />);

    expect(screen.queryByText("Loading...")).toBeNull();
    expect(screen.getByTestId("shop-id").getAttribute("data-staffing")).toBe(JSON.stringify(staffing));
  });

  it("シフト表の読み込み中は、店舗の設定が先に届いてもLoadingのままにする", () => {
    mocks.queryResults.scope = { shopId: "shop-1", shopName: "設定店舗" };
    mocks.queryResults.staffing = staffing;

    render(<AppShiftBoardRoutePage organizationId="organization-1" recruitmentId="recruitment-1" />);

    expect(screen.getByText("Loading...")).not.toBeNull();
    expect(screen.queryByTestId("shop-id")).toBeNull();
  });

  it("店舗の設定が対象外として返った場合は、設定なしでシフト表を表示する", () => {
    mocks.queryResults.scope = { shopId: "shop-1", shopName: "設定店舗" };
    mocks.queryResults.data = boardData;
    mocks.queryResults.staffing = null;

    render(<AppShiftBoardRoutePage organizationId="organization-1" recruitmentId="recruitment-1" />);

    expect(screen.getByTestId("shop-id").textContent).toBe("shop-1");
    expect(screen.getByTestId("shop-id").getAttribute("data-staffing")).toBe("null");
  });

  it("シフト表が上の行を隠すとアプリのヘッダーも隠し、表示へ戻すとヘッダーも表示する", () => {
    mocks.queryResults.scope = { shopId: "shop-1", shopName: "設定店舗" };
    mocks.queryResults.data = boardData;
    mocks.queryResults.staffing = staffing;

    render(<AppScreen showsShiftBoard />);
    expect(screen.getByTestId("app-header-hidden").textContent).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "上の行を隠す" }));
    expect(screen.getByTestId("app-header-hidden").textContent).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "上の行を表示する" }));
    expect(screen.getByTestId("app-header-hidden").textContent).toBe("false");
  });

  it("ヘッダーを隠したままほかの画面へ移ると、ヘッダーを表示した状態へ戻す", () => {
    mocks.queryResults.scope = { shopId: "shop-1", shopName: "設定店舗" };
    mocks.queryResults.data = boardData;
    mocks.queryResults.staffing = staffing;

    const { rerender } = render(<AppScreen showsShiftBoard />);
    fireEvent.click(screen.getByRole("button", { name: "上の行を隠す" }));
    expect(screen.getByTestId("app-header-hidden").textContent).toBe("true");

    rerender(<AppScreen showsShiftBoard={false} />);

    expect(screen.queryByTestId("shop-id")).toBeNull();
    expect(screen.getByTestId("app-header-hidden").textContent).toBe("false");
  });
});
