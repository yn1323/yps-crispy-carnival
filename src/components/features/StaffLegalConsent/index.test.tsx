// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffLegalConsentPageData } from "./types";

const mocks = vi.hoisted(() => ({
  acceptReference: Symbol("acceptStaffLegalConsent"),
  accept: vi.fn(),
  useMutation: vi.fn(),
  showSuccessToast: vi.fn(),
  showErrorToast: vi.fn(),
  createToast: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: mocks.useMutation,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: { legal: { mutations: { acceptStaffLegalConsent: mocks.acceptReference } } },
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showSuccessToast: mocks.showSuccessToast,
  showErrorToast: mocks.showErrorToast,
}));

vi.mock("@/src/components/ui/toaster", () => ({
  toaster: { create: mocks.createToast },
}));

vi.mock("./ConsentView", () => ({
  StaffLegalConsentView: ({
    data,
    isSubmitting,
    onAccept,
  }: {
    data: StaffLegalConsentPageData;
    isSubmitting: boolean;
    onAccept: () => Promise<void>;
  }) => (
    <div>
      <output data-testid="status">{data.status}</output>
      <output data-testid="submitting">{String(isSubmitting)}</output>
      <button type="button" onClick={() => void onAccept()}>
        同意する
      </button>
    </div>
  ),
}));

import { StaffLegalConsent } from ".";

const pageData: StaffLegalConsentPageData = {
  status: "ok",
  staffName: "田中 花子",
  shopName: "シフトリ食堂",
  expiresAt: Date.UTC(2026, 8, 1),
  documents: {
    terms: {
      title: "スタッフ向け利用規約",
      documentVersion: "2026-08-01",
      requiredConsentVersion: "2026-08-01",
      path: "/terms/staff",
    },
    privacy: {
      title: "スタッフ向けプライバシーポリシー",
      documentVersion: "2026-08-01",
      requiredConsentVersion: "2026-08-01",
      path: "/privacy/staff",
    },
  },
};

beforeEach(() => {
  mocks.accept.mockReset();
  mocks.useMutation.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.createToast.mockReset();
  mocks.useMutation.mockReturnValue(mocks.accept);
});

describe("StaffLegalConsent", () => {
  it("tokenと同意済みフラグをmutationへ渡し、成功後に同意済み表示へ進む", async () => {
    mocks.accept.mockResolvedValue({ status: "ok" });

    render(<StaffLegalConsent token="legal-consent-token" data={pageData} />);
    fireEvent.click(screen.getByRole("button", { name: "同意する" }));

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("accepted"));
    expect(mocks.useMutation).toHaveBeenCalledWith(mocks.acceptReference);
    expect(mocks.accept).toHaveBeenCalledOnce();
    expect(mocks.accept).toHaveBeenCalledWith({ token: "legal-consent-token", acceptedLegal: true });
    expect(mocks.showSuccessToast).toHaveBeenCalledWith({ title: "同意を記録しました" });
  });

  it("処理中の連打は一回のmutationにまとめ、完了後に送信状態を戻す", async () => {
    let resolveAccept: ((value: { status: "ok" }) => void) | undefined;
    mocks.accept.mockReturnValue(
      new Promise<{ status: "ok" }>((resolve) => {
        resolveAccept = resolve;
      }),
    );

    render(<StaffLegalConsent token="legal-consent-token" data={pageData} />);
    const button = screen.getByRole("button", { name: "同意する" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByTestId("submitting").textContent).toBe("true"));
    expect(mocks.accept).toHaveBeenCalledOnce();

    resolveAccept?.({ status: "ok" });
    await waitFor(() => expect(screen.getByTestId("submitting").textContent).toBe("false"));
  });

  it("mutationが同意を受理しない場合は成功表示へ進めず、リンクエラーを表示する", async () => {
    mocks.accept.mockResolvedValue({ status: "expired" });

    render(<StaffLegalConsent token="legal-consent-token" data={pageData} />);
    fireEvent.click(screen.getByRole("button", { name: "同意する" }));

    await waitFor(() => {
      expect(mocks.createToast).toHaveBeenCalledWith({ title: "このリンクでは同意できません", type: "error" });
    });
    expect(screen.getByTestId("status").textContent).toBe("ok");
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("mutation失敗時は共通エラー表示へ渡し、入力可能な状態へ戻す", async () => {
    const error = new Error("network error");
    mocks.accept.mockRejectedValue(error);

    render(<StaffLegalConsent token="legal-consent-token" data={pageData} />);
    fireEvent.click(screen.getByRole("button", { name: "同意する" }));

    await waitFor(() => expect(mocks.showErrorToast).toHaveBeenCalledWith(error));
    expect(screen.getByTestId("status").textContent).toBe("ok");
    expect(screen.getByTestId("submitting").textContent).toBe("false");
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });
});
