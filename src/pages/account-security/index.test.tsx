// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loginMethodsProps: null as Record<string, unknown> | null }));

vi.mock("@chakra-ui/react", () => ({
  Heading: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
  Stack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/src/components/features/LoginMethods", () => ({
  LoginMethods: (props: Record<string, unknown>) => {
    mocks.loginMethodsProps = props;
    return null;
  },
}));

vi.mock("@/src/components/templates/AuthenticatedPageContent", () => ({
  AuthenticatedPageContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { AccountSecurityPage } from "./index";

describe("AccountSecurityPage", () => {
  it("カードを維持したまま追加flowとOAuth帰還をLoginMethodsへ渡す", () => {
    const onStartFlow = vi.fn();
    const onBackToOverview = vi.fn();
    const onGoogleOAuthReturnHandled = vi.fn();

    render(
      <AccountSecurityPage
        flow="connect-google"
        oauth="google"
        onStartFlow={onStartFlow}
        onBackToOverview={onBackToOverview}
        onGoogleOAuthReturnHandled={onGoogleOAuthReturnHandled}
      />,
    );

    expect(screen.getByRole("heading", { name: "アカウント設定" })).not.toBeNull();
    expect(mocks.loginMethodsProps).toEqual(
      expect.objectContaining({
        flow: "connect-google",
        oauth: "google",
        onStartFlow,
        onBackToOverview,
        onGoogleOAuthReturnHandled,
      }),
    );
  });
});
