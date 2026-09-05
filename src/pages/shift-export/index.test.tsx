// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExportFixture } from "@/src/components/features/ShiftExport/fixtures";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  scopeQuery: Symbol("getShiftBoardShopScopeForOrganization"),
  exportQuery: Symbol("getShiftExportData"),
  scope: undefined as unknown,
  data: undefined as unknown,
  errorQuery: null as null | "scope" | "data",
  blockMessage: vi.fn((reason: string) => `出力停止:${reason}`),
  mounted: vi.fn(),
  unmounted: vi.fn(),
  featureProps: vi.fn(),
}));

vi.mock("convex/react", () => ({ useQuery: mocks.useQuery }));
vi.mock("@/convex/_generated/api", () => ({
  api: {
    shiftBoard: { queries: { getShiftBoardShopScopeForOrganization: mocks.scopeQuery } },
    shiftExport: { queries: { getShiftExportData: mocks.exportQuery } },
  },
}));
vi.mock("@/src/components/features/ShiftExport", () => ({
  getExportBlockMessage: mocks.blockMessage,
  ShiftExportPage: ({ data }: { data: { shopName: string } }) => {
    mocks.featureProps(data);
    useEffect(() => {
      mocks.mounted();
      return () => {
        mocks.unmounted();
      };
    }, []);
    return <div data-testid="export-page">{data.shopName}</div>;
  },
}));
vi.mock("@/src/components/ui/Button", () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock("@/src/components/ui/Empty", () => ({
  Empty: ({ title, description, action }: { title: string; description?: string; action?: ReactNode }) => (
    <section>
      <h1>{title}</h1>
      <p>{description}</p>
      {action}
    </section>
  ),
}));
vi.mock("@/src/components/ui/ShiftoriLoading", () => ({
  ShiftoriLoading: ({ message }: { message: string }) => <output>{message}</output>,
}));

import { ShiftExportRoutePage } from ".";

const scope = { shopId: "verified-shop", shopName: "出力店舗" };
const routeProps = { organizationId: "organization-a", recruitmentId: "recruitment-a" };
const SESSION_ID = "00000000-0000-4000-8000-00000000000a";
const INITIAL_DAY_KEY = `2026-09-30:${SESSION_ID}:0`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-09-30T23:59:59.900+09:00"));
  vi.spyOn(crypto, "randomUUID").mockReturnValue(SESSION_ID);
  mocks.scope = undefined;
  mocks.data = undefined;
  mocks.errorQuery = null;
  mocks.useQuery.mockImplementation((reference: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    if (reference === mocks.scopeQuery) {
      if (mocks.errorQuery === "scope") throw new Error("scope query unavailable");
      return mocks.scope;
    }
    if (reference === mocks.exportQuery) {
      if (mocks.errorQuery === "data") throw new Error("export query unavailable");
      return mocks.data;
    }
    throw new Error("unexpected query reference");
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ShiftExportRoutePage", () => {
  it("店舗scopeの解決まで帳票queryを止め、認可済みの店舗・組織・募集だけを渡す", () => {
    const { rerender } = render(<ShiftExportRoutePage {...routeProps} />);

    expect(screen.getByRole("status")).toBeTruthy();
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.scopeQuery, {
      organizationId: "organization-a",
      recruitmentId: "recruitment-a",
    });
    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.exportQuery, "skip");
    expect(mocks.mounted).not.toHaveBeenCalled();

    mocks.scope = scope;
    rerender(<ShiftExportRoutePage {...routeProps} />);

    expect(screen.getByRole("status")).toBeTruthy();
    expect(mocks.useQuery).toHaveBeenLastCalledWith(mocks.exportQuery, {
      shopId: "verified-shop",
      expectedOrganizationId: "organization-a",
      recruitmentId: "recruitment-a",
      refreshDayKey: INITIAL_DAY_KEY,
    });
    expect(mocks.mounted).not.toHaveBeenCalled();

    const data = createExportFixture();
    mocks.data = data;
    rerender(<ShiftExportRoutePage {...routeProps} />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByTestId("export-page").textContent).toBe(data.shopName);
    expect(mocks.featureProps).toHaveBeenLastCalledWith(data);
    expect(mocks.mounted).toHaveBeenCalledTimes(1);
  });

  it.each(["scope", "data"])("%sが利用不可なら生成画面を表示しない", (missing) => {
    mocks.scope = missing === "scope" ? null : scope;
    mocks.data = missing === "data" ? null : undefined;

    render(<ShiftExportRoutePage {...routeProps} />);

    expect(screen.getByRole("heading", { name: "シフト表が見つかりません" })).toBeTruthy();
    expect(mocks.mounted).not.toHaveBeenCalled();
    if (missing === "scope") expect(mocks.useQuery).toHaveBeenCalledWith(mocks.exportQuery, "skip");
  });

  it("JST日付変更後に帳票queryを再取得し、削除staff割当による出力停止を再評価する", async () => {
    mocks.scope = scope;
    const data = createExportFixture();
    mocks.useQuery.mockImplementation((reference: unknown, args: { refreshDayKey?: string } | "skip") => {
      if (reference === mocks.scopeQuery) return scope;
      if (args === "skip") return undefined;
      return args.refreshDayKey === `2026-10-01:${SESSION_ID}:1`
        ? data
        : { ...data, exportBlockReason: "excludedStaffAssignments" };
    });
    render(<ShiftExportRoutePage {...routeProps} />);
    expect(screen.getByRole("heading", { name: "シフト表を出力できません" })).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_101);
    });

    expect(mocks.useQuery).toHaveBeenLastCalledWith(mocks.exportQuery, {
      shopId: "verified-shop",
      expectedOrganizationId: "organization-a",
      recruitmentId: "recruitment-a",
      refreshDayKey: `2026-10-01:${SESSION_ID}:1`,
    });
    expect(screen.queryByRole("heading", { name: "シフト表を出力できません" })).toBeNull();
    expect(screen.getByTestId("export-page").textContent).toBe(data.shopName);
  });

  it.each(["noStaffs", "excludedStaffAssignments"] as const)(
    "出力停止理由%sを案内し、生成画面をmountしない",
    (reason) => {
      mocks.scope = scope;
      mocks.data = createExportFixture({ exportBlockReason: reason });

      render(<ShiftExportRoutePage {...routeProps} />);

      expect(screen.getByRole("heading", { name: "シフト表を出力できません" })).toBeTruthy();
      expect(mocks.blockMessage).toHaveBeenCalledExactlyOnceWith(reason);
      expect(screen.getByText(`出力停止:${reason}`)).toBeTruthy();
      expect(mocks.mounted).not.toHaveBeenCalled();
    },
  );

  it.each(["scope-lost", "scope-loading", "data-lost", "data-loading", "blocked"])(
    "表示後の%sで生成画面をunmountし、過去の帳票を残さない",
    (transition) => {
      mocks.scope = scope;
      mocks.data = createExportFixture();
      const { rerender } = render(<ShiftExportRoutePage {...routeProps} />);
      expect(screen.getByTestId("export-page")).toBeTruthy();

      if (transition === "scope-lost") mocks.scope = null;
      else if (transition === "scope-loading") mocks.scope = undefined;
      else if (transition === "data-lost") mocks.data = null;
      else if (transition === "data-loading") mocks.data = undefined;
      else mocks.data = createExportFixture({ exportBlockReason: "excludedStaffAssignments" });
      rerender(<ShiftExportRoutePage {...routeProps} />);

      expect(screen.queryByTestId("export-page")).toBeNull();
      expect(mocks.unmounted).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["organizationId", "recruitmentId"] as const)(
    "URLの%sを切り替えると、同時に次のデータが読めても前の生成画面をunmountする",
    (key) => {
      mocks.scope = scope;
      mocks.data = createExportFixture({ shopName: "前の店舗" });
      const { rerender } = render(<ShiftExportRoutePage {...routeProps} />);

      mocks.scope = { ...scope, shopId: "next-verified-shop" };
      mocks.data = createExportFixture({ shopName: "次の店舗" });
      const nextProps = { ...routeProps, [key]: "next-id" };
      rerender(<ShiftExportRoutePage {...nextProps} />);

      expect(screen.getByTestId("export-page").textContent).toBe("次の店舗");
      expect(mocks.useQuery).toHaveBeenLastCalledWith(mocks.exportQuery, {
        shopId: "next-verified-shop",
        expectedOrganizationId: nextProps.organizationId,
        recruitmentId: nextProps.recruitmentId,
        refreshDayKey: INITIAL_DAY_KEY,
      });
      expect(mocks.unmounted).toHaveBeenCalledTimes(1);
      expect(mocks.mounted).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["scope", "data"] as const)("%sの取得エラーで生成画面を破棄し、別の募集では読み込みを再開する", (query) => {
    mocks.scope = scope;
    mocks.data = createExportFixture();
    const { rerender } = render(<ShiftExportRoutePage {...routeProps} />, { onCaughtError: vi.fn() });

    mocks.errorQuery = query;
    rerender(<ShiftExportRoutePage {...routeProps} />);

    expect(screen.queryByTestId("export-page")).toBeNull();
    expect(mocks.unmounted).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "シフト表を読み込めませんでした" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "再読み込みする" })).toBeTruthy();

    mocks.errorQuery = null;
    mocks.data = createExportFixture({ shopName: "次の募集" });
    rerender(<ShiftExportRoutePage {...routeProps} recruitmentId="next-recruitment" />);

    expect(screen.getByTestId("export-page").textContent).toBe("次の募集");
    expect(mocks.mounted).toHaveBeenCalledTimes(2);
  });
});
