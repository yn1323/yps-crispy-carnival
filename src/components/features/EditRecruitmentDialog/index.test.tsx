// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { CreateRecruitmentData } from "@/src/components/features/CreateRecruitmentForm";

const mocks = vi.hoisted(() => ({ update: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("convex/react", () => ({ useMutation: () => mocks.update }));
vi.mock("@/src/components/shared/feedback", () => ({ showSuccessToast: mocks.success, showErrorToast: mocks.error }));
vi.mock("@/src/components/ui/StepperDialog", () => ({
  StepperDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/src/components/shared/RecruitmentChangedNotice", () => ({
  RecruitmentChangedNotice: () => <div data-testid="reload" />,
}));
vi.mock("@/src/components/features/CreateRecruitmentForm", () => ({
  CreateRecruitmentForm: ({
    defaultValues,
    onSubmit,
  }: {
    defaultValues: CreateRecruitmentData;
    onSubmit: (data: CreateRecruitmentData) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSubmit({
          periodStart: defaultValues.periodStart,
          periodEnd: defaultValues.periodEnd,
          deadline: "2099-01-18",
          shopClosedDates: defaultValues.shopClosedDates,
        })
      }
    >
      変更を保存
    </button>
  ),
}));

import { EditRecruitmentDialog } from ".";

const recruitment = {
  _id: "recruitment" as Id<"recruitments">,
  editVersion: 3,
  status: "open" as const,
  periodStart: "2099-01-20",
  periodEnd: "2099-01-25",
  deadline: "2099-01-17",
  shopClosedDates: ["2099-01-22"],
};
const shop = { shopId: "shop", shopName: "サンプル店舗", regularClosedDays: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockResolvedValue({ changed: true, requiresResubmission: false });
});

describe("募集編集dialogの保存", () => {
  it("開いた時点の版と明示した店舗・組織を送り、保存成功後に閉じる", async () => {
    const onClose = vi.fn();
    render(
      <EditRecruitmentDialog
        recruitment={recruitment}
        shop={shop}
        expectedOrganizationId="organization"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      recruitmentId: recruitment._id,
      expectedEditVersion: 3,
      shopId: "shop",
      expectedOrganizationId: "organization",
      periodStart: "2099-01-20",
      periodEnd: "2099-01-25",
      deadline: "2099-01-18",
      shopClosedDates: ["2099-01-22"],
    });
  });

  it("別の編集が届いたらフォームを隠し、自動で最新の版を送らない", () => {
    const { rerender } = render(
      <EditRecruitmentDialog
        recruitment={recruitment}
        shop={shop}
        expectedOrganizationId="organization"
        onClose={vi.fn()}
      />,
    );
    rerender(
      <EditRecruitmentDialog
        recruitment={{ ...recruitment, editVersion: 4 }}
        shop={shop}
        expectedOrganizationId="organization"
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "変更を保存" })).toBeNull();
    expect(screen.getByTestId("reload")).toBeTruthy();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("queryより先に保存競合が返っても再読み込みの案内へ切り替える", async () => {
    mocks.update.mockRejectedValue({ data: { code: "RECRUITMENT_CHANGED" } });
    const onClose = vi.fn();
    render(
      <EditRecruitmentDialog
        recruitment={recruitment}
        shop={shop}
        expectedOrganizationId="organization"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));
    await screen.findByTestId("reload");
    expect(onClose).not.toHaveBeenCalled();
  });
});
