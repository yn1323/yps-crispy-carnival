// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createExportFixture } from "@/src/components/features/ShiftExport/fixtures";

const mocks = vi.hoisted(() => ({ query: vi.fn(), receive: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: mocks.query }));
vi.mock("@/src/components/features/ShiftExport", () => ({
  useReceivedShiftExport: mocks.receive,
  ShiftExportPage: ({ data }: { data: { shopName: string } }) => <div>{data.shopName}</div>,
}));
vi.mock("@/src/components/ui/Empty", () => ({
  Empty: ({ title, description }: { title: string; description: string }) => (
    <section>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  ),
}));
vi.mock("@/src/components/ui/ShiftoriLoading", () => ({
  ShiftoriLoading: ({ message }: { message: string }) => <output>{message}</output>,
}));
vi.mock("@/src/components/ui/Button", () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));

import { ShiftExportRoutePage } from ".";

const props = { organizationId: "org", recruitmentId: "recruitment" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockReturnValue({ shopId: "shop" });
  mocks.receive.mockReturnValue({ snapshot: { data: createExportFixture() }, storageAvailable: true, error: null });
});
describe("受信したシフト表の出力ページ", () => {
  it("勤務内容をqueryせず、検証した店舗scopeと受信データを使う", () => {
    render(<ShiftExportRoutePage {...props} />);
    expect(screen.getByText("シフトリ駅前店")).toBeTruthy();
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.receive).toHaveBeenCalledWith({ ...props, shopId: "shop" }, true);
  });
  it.each([null, undefined])("scopeが%sなら受信済み内容も表示しない", (scope) => {
    mocks.query.mockReturnValue(scope);
    render(<ShiftExportRoutePage {...props} />);
    expect(screen.queryByText("シフトリ駅前店")).toBeNull();
    expect(mocks.receive).toHaveBeenCalledWith({ ...props, shopId: undefined }, scope === null ? false : undefined);
  });
  it("受信失敗では開き直しを案内し、DBの内容へ戻さない", () => {
    mocks.receive.mockReturnValue({ snapshot: null, error: "シフト表から出力画面を開き直してください。" });
    render(<ShiftExportRoutePage {...props} />);
    expect(screen.getByText("シフト表から出力画面を開き直してください。")).toBeTruthy();
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
  it("表示中の権限喪失で生成画面を外す", () => {
    const { rerender } = render(<ShiftExportRoutePage {...props} />);
    mocks.query.mockReturnValue(null);
    rerender(<ShiftExportRoutePage {...props} />);
    expect(screen.queryByText("シフトリ駅前店")).toBeNull();
  });
});
