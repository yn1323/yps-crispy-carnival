// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  historyBack: vi.fn(),
  canGoBack: true,
  getSubmissionResultRef: Symbol("getSubmissionResult"),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ history: { back: mocks.historyBack } }),
  useCanGoBack: () => mocks.canGoBack,
}));
vi.mock("convex/react", () => ({ useQuery: mocks.useQuery }));
vi.mock("@/convex/_generated/api", () => ({
  api: { shiftSubmission: { queries: { getSubmissionResult: mocks.getSubmissionResultRef } } },
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

import { StaffShiftSubmitCompletedPage } from ".";

function storeSubmitSession(recruitmentId = "recruitment-1") {
  localStorage.setItem(
    `yps_session_submit_${recruitmentId}`,
    JSON.stringify({ sessionToken: "session-1", recruitmentId, accessKind: "submit" }),
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.useQuery.mockReset();
  mocks.historyBack.mockReset();
  mocks.canGoBack = true;
});

describe("StaffShiftSubmitCompletedPage", () => {
  it("募集IDまたは保存済みsubmit sessionがない直URLでは成功表示を出さずqueryを開始しない", () => {
    const { rerender } = render(<StaffShiftSubmitCompletedPage />);

    expect(screen.getByRole("heading", { name: "提出完了を確認できません" })).not.toBeNull();
    expect(mocks.useQuery).not.toHaveBeenCalled();

    rerender(<StaffShiftSubmitCompletedPage recruitmentId="recruitment-1" />);
    expect(screen.getByRole("heading", { name: "提出完了を確認できません" })).not.toBeNull();
    expect(mocks.useQuery).not.toHaveBeenCalled();
  });

  it("保存済みsubmit sessionとserverのsubmitted結果が一致した場合だけ成功表示を出す", () => {
    storeSubmitSession();
    mocks.useQuery.mockReturnValue({ status: "submitted", shopName: "確認済み店舗" });

    render(<StaffShiftSubmitCompletedPage recruitmentId="recruitment-1" />);

    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.getSubmissionResultRef, {
      sessionToken: "session-1",
      accessKind: "submit",
      recruitmentId: "recruitment-1",
    });
    expect(screen.getByRole("heading", { name: "提出が完了しました" })).not.toBeNull();
    expect(screen.getByRole("main").getAttribute("data-shop-name")).toBe("確認済み店舗");
  });

  it("serverが利用不可を返した場合は成功表示を出さない", () => {
    storeSubmitSession();
    mocks.useQuery.mockReturnValue({ status: "unavailable" });

    render(<StaffShiftSubmitCompletedPage recruitmentId="recruitment-1" />);

    expect(screen.getByRole("heading", { name: "提出完了を確認できません" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "提出が完了しました" })).toBeNull();
  });

  it("query errorから再試行するとquery componentをremountして成功状態へ回復する", () => {
    storeSubmitSession();
    let shouldThrow = true;
    mocks.useQuery.mockImplementation(() => {
      if (shouldThrow) throw new Error("query failed");
      return { status: "submitted", shopName: "回復店舗" };
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<StaffShiftSubmitCompletedPage recruitmentId="recruitment-1" />);
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "再試行する" }));

    expect(screen.getByRole("heading", { name: "提出が完了しました" })).not.toBeNull();
    expect(mocks.useQuery.mock.calls.length).toBeGreaterThanOrEqual(2);
    errorSpy.mockRestore();
  });

  it("履歴操作は提出画面を断定しないラベルで戻る", () => {
    storeSubmitSession();
    mocks.useQuery.mockReturnValue({ status: "submitted", shopName: "確認済み店舗" });

    render(<StaffShiftSubmitCompletedPage recruitmentId="recruitment-1" />);
    fireEvent.click(screen.getByRole("button", { name: "前の画面に戻る" }));

    expect(mocks.historyBack).toHaveBeenCalledOnce();
  });
});
