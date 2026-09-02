// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LineCallbackStatus } from "./LineCallbackView";

const mocks = vi.hoisted(() => ({
  redeemLineToken: vi.fn(),
}));

vi.mock("./useRedeemLineToken", () => ({
  useRedeemLineToken: () => mocks.redeemLineToken,
}));

vi.mock("@/src/components/templates/StaffLayout", () => ({
  StaffLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("./LineCallbackView", () => ({
  LineCallbackView: ({ status }: { status: LineCallbackStatus }) => <output data-testid="status">{status}</output>,
}));

import { LineCallback } from ".";

beforeEach(() => {
  mocks.redeemLineToken.mockReset();
});

describe("LineCallback", () => {
  it.each([
    { code: undefined, state: "line-state" },
    { code: "authorization-code", state: undefined },
  ])("codeまたはstateが欠けている場合はactionを呼ばず無効なリンクとして扱う", async ({ code, state }) => {
    render(<LineCallback code={code} state={state} />);

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("expired"));
    expect(mocks.redeemLineToken).not.toHaveBeenCalled();
  });

  it.each(["ok", "needs_follow", "expired", "rate_limited"] as const)(
    "actionの%s結果を画面状態へ反映する",
    async (status) => {
      mocks.redeemLineToken.mockResolvedValue({ status });

      render(<LineCallback code="authorization-code" state="line-state" />);

      await waitFor(() => expect(screen.getByTestId("status").textContent).toBe(status));
      expect(mocks.redeemLineToken).toHaveBeenCalledOnce();
      expect(mocks.redeemLineToken).toHaveBeenCalledWith({ code: "authorization-code", state: "line-state" });
    },
  );

  it("actionが失敗した場合はエラー状態へ進む", async () => {
    mocks.redeemLineToken.mockRejectedValue(new Error("LINE provider error"));

    render(<LineCallback code="authorization-code" state="line-state" />);

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("error"));
    expect(mocks.redeemLineToken).toHaveBeenCalledOnce();
  });

  it("StrictModeでeffectが再実行されてもOAuth codeの交換は一度だけ行う", async () => {
    mocks.redeemLineToken.mockResolvedValue({ status: "ok" });

    render(
      <StrictMode>
        <LineCallback code="authorization-code" state="line-state" />
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ok"));
    expect(mocks.redeemLineToken).toHaveBeenCalledOnce();
  });
});
