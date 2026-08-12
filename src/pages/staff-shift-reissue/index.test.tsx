// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  getRecruitmentInfoRef: Symbol("getRecruitmentInfo"),
}));

vi.mock("convex/react", () => ({ useQuery: mocks.useQuery }));
vi.mock("@/convex/_generated/api", () => ({
  api: { staffAuth: { queries: { getRecruitmentInfo: mocks.getRecruitmentInfoRef } } },
}));
vi.mock("@/src/components/features/StaffShiftReissue", () => ({
  StaffShiftReissue: ({ recruitmentId, periodLabel }: { recruitmentId: string; periodLabel: string }) => (
    <div>
      <output data-testid="canonical-recruitment-id">{recruitmentId}</output>
      <output data-testid="period-label">{periodLabel}</output>
    </div>
  ),
}));
vi.mock("@/src/components/templates/FullPageSpinner", () => ({ FullPageSpinner: () => <output>loading</output> }));
vi.mock("@/src/components/templates/StaffLayout", () => ({
  StaffLayout: ({ children, shopName }: { children: ReactNode; shopName: string }) => (
    <main data-shop-name={shopName}>{children}</main>
  ),
  StaffCenteredContent: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock("@/src/components/ui/Button", () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock("@/src/components/ui/Empty", () => ({
  Empty: ({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {action}
    </div>
  ),
}));

import { StaffShiftReissuePage } from ".";

beforeEach(() => {
  mocks.useQuery.mockReset();
});

describe("StaffShiftReissuePage", () => {
  it("募集ID欠落時はqueryをskipして利用不可を表示する", () => {
    render(<StaffShiftReissuePage />);

    expect(screen.getByRole("heading", { name: "このページから再発行できません" })).not.toBeNull();
    expect(mocks.useQuery).not.toHaveBeenCalled();
  });

  it("対象募集がない場合は利用不可を表示する", () => {
    mocks.useQuery.mockReturnValue(null);

    render(<StaffShiftReissuePage recruitmentId="route-recruitment-id" />);

    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.getRecruitmentInfoRef, {
      recruitmentId: "route-recruitment-id",
    });
    expect(screen.getByRole("heading", { name: "このページから再発行できません" })).not.toBeNull();
  });

  it("serverが返したcanonical IDと募集期間だけを再発行formへ渡す", () => {
    mocks.useQuery.mockReturnValue({
      recruitmentId: "canonical-recruitment-id",
      shopName: "対象店舗",
      periodStart: "2026-08-03",
      periodEnd: "2026-08-09",
    });

    render(<StaffShiftReissuePage recruitmentId="route-recruitment-id" />);

    expect(screen.getByTestId("canonical-recruitment-id").textContent).toBe("canonical-recruitment-id");
    expect(screen.getByTestId("period-label").textContent).toBe("8/3(月) 〜 8/9(日)");
    expect(screen.getByRole("main").getAttribute("data-shop-name")).toBe("対象店舗");
  });

  it("query errorを対象なしと混同せず、再試行でquery componentをremountする", () => {
    let shouldThrow = true;
    mocks.useQuery.mockImplementation(() => {
      if (shouldThrow) throw new Error("query failed");
      return null;
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<StaffShiftReissuePage recruitmentId="route-recruitment-id" />);
    expect(screen.getByRole("heading", { name: "募集情報を読み込めませんでした" })).not.toBeNull();
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "再試行する" }));

    expect(screen.getByRole("heading", { name: "このページから再発行できません" })).not.toBeNull();
    expect(mocks.useQuery.mock.calls.length).toBeGreaterThanOrEqual(2);
    errorSpy.mockRestore();
  });
});
