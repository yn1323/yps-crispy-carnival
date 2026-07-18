// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("@chakra-ui/react", () => ({
  Stack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/src/components/features/AccountDeletion", () => ({
  AccountDeletion: () => <div data-testid="account-deletion-entry" />,
}));

vi.mock("@/src/components/templates/ContentWrapper", () => ({
  ContentWrapper: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock("@/src/configs/env", () => ({
  ACCOUNT_DELETION_ENABLED: false,
}));

vi.mock("../HeroSummary", () => ({
  WelcomeHero: () => <div>セットアップ案内</div>,
}));

vi.mock("../SetupModal", () => ({
  SetupModal: () => null,
}));

import { SetupView } from "./SetupView";

it("機能フラグが無効な場合はセットアップ画面にアカウント削除入口を表示しない", () => {
  render(
    <SetupView
      announcement={null}
      dialog={{ isOpen: false, open: vi.fn(), onOpenChange: vi.fn() }}
      isSubmitting={false}
      onComplete={vi.fn()}
    />,
  );

  expect(screen.getByText("セットアップ案内")).not.toBeNull();
  expect(screen.queryByTestId("account-deletion-entry")).toBeNull();
});
