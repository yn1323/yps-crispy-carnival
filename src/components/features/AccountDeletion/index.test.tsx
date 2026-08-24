// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAccountDeletionControllerMock } = vi.hoisted(() => ({
  useAccountDeletionControllerMock: vi.fn(() => ({
    isOpen: false,
    isRunning: false,
    isPreviewStale: false,
    preview: null,
    error: null,
    open: vi.fn(),
    onClose: vi.fn(),
    onOpenChange: vi.fn(),
    onSubmit: vi.fn(),
  })),
}));

vi.mock("./AccountDeletionSection", () => ({
  AccountDeletionSection: () => <div data-testid="connected-account-deletion-section" />,
}));

vi.mock("./AccountDeletionTrigger", () => ({
  AccountDeletionTrigger: () => <button type="button">従来の削除入口</button>,
}));

vi.mock("./AccountDeletionDialog", () => ({
  AccountDeletionDialog: () => <div data-testid="account-deletion-dialog" />,
}));

vi.mock("./useAccountDeletionController", () => ({
  useAccountDeletionController: useAccountDeletionControllerMock,
}));

import { AccountDeletion } from "./index";

describe("AccountDeletion", () => {
  beforeEach(() => {
    useAccountDeletionControllerMock.mockClear();
  });

  it("setupでは最新previewを取得する接続済みsectionを使う", () => {
    render(<AccountDeletion variant="setup" />);

    expect(screen.getByTestId("connected-account-deletion-section")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "従来の削除入口" })).toBeNull();
    expect(useAccountDeletionControllerMock).not.toHaveBeenCalled();
  });

  it("legacyでは従来payloadの削除入口を維持する", () => {
    render(<AccountDeletion variant="legacy" />);

    expect(screen.getByRole("button", { name: "従来の削除入口" })).not.toBeNull();
    expect(screen.getByTestId("account-deletion-dialog")).not.toBeNull();
    expect(useAccountDeletionControllerMock).toHaveBeenCalledOnce();
  });
});
