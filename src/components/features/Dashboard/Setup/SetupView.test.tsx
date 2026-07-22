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

vi.mock("../HeroSummary", () => ({
  WelcomeHero: () => <div>セットアップ案内</div>,
}));

vi.mock("../SetupModal", () => ({
  SetupModal: () => null,
}));

import { SetupView } from "./SetupView";

function renderSetupView(showAccountDeletion: boolean) {
  render(
    <SetupView
      announcement={null}
      dialog={{ isOpen: false, open: vi.fn(), onOpenChange: vi.fn() }}
      showAccountDeletion={showAccountDeletion}
      isSubmitting={false}
      onComplete={vi.fn()}
    />,
  );
}

it("初回セットアップではアカウント削除入口を表示しない", () => {
  renderSetupView(false);

  expect(screen.getByText("セットアップ案内")).not.toBeNull();
  expect(screen.queryByTestId("account-deletion-entry")).toBeNull();
});

it("既存の所属なしユーザーにはアカウント削除入口を表示する", () => {
  renderSetupView(true);

  expect(screen.getByText("セットアップ案内")).not.toBeNull();
  expect(screen.getByTestId("account-deletion-entry")).not.toBeNull();
});
