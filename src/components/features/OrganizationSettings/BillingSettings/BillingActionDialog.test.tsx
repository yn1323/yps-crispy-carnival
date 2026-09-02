// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChakraProvider } from "@/src/providers/ChakraProvider";
import { BillingActionDialog } from "./BillingActionDialog";
import type { BillingActionDialogState } from "./script";

const mocks = vi.hoisted(() => ({
  useCloseDialogOnBrowserBack: vi.fn(),
}));

vi.mock("@/src/hooks/useCloseDialogOnBrowserBack", () => ({
  useCloseDialogOnBrowserBack: mocks.useCloseDialogOnBrowserBack,
}));

const startStandardDialog: BillingActionDialogState = {
  kind: "startPaidPlan",
  source: "trial",
  targetPlan: "standard",
  intentKey: "start-standard",
  shopId: "organization-app",
  organizationName: "さくらダイニング",
  currentPlan: "trial",
  billingStartsOn: "2026年9月1日",
  price: {
    status: "available",
    value: {
      currency: "jpy",
      unitAmount: 3000,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
    },
  },
};

beforeEach(() => {
  mocks.useCloseDialogOnBrowserBack.mockReset();
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: false,
    media,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BillingActionDialog", () => {
  it("料金プラン画面のDialogではブラウザバック用の履歴を追加しない", () => {
    render(
      <ChakraProvider>
        <BillingActionDialog
          dialog={startStandardDialog}
          isRunning={false}
          onClose={vi.fn()}
          onRetryPrice={vi.fn()}
          onRetryPreview={vi.fn()}
          onSubmit={vi.fn()}
        />
      </ChakraProvider>,
    );

    expect(mocks.useCloseDialogOnBrowserBack).toHaveBeenCalledWith(false, expect.any(Function), undefined, true);
  });
});
