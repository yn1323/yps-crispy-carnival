// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  onUnmount: vi.fn(),
  loginMethodsProps: null as null | {
    onStartFlow: (flow: "add-email-password" | "connect-google" | "replace-google") => void;
    onRequestPreviousMethodRemoval: (kind: "google" | "password") => void;
    pendingRemovalKind: "google" | "password" | null;
    onPendingRemovalClaimed: () => void;
  },
}));

vi.mock("@chakra-ui/react", () => ({
  Heading: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
  Stack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

vi.mock("@/src/components/features/LoginMethods", async () => {
  const { useEffect } = await import("react");
  return {
    LoginMethods: (props: NonNullable<typeof mocks.loginMethodsProps>) => {
      mocks.loginMethodsProps = props;
      useEffect(() => () => mocks.onUnmount(), []);
      return null;
    },
  };
});

vi.mock("@/src/components/templates/AuthenticatedPageContent", () => ({
  AuthenticatedPageContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { AccountSecurityPage } from "./index";

describe("AccountSecurityPage", () => {
  it("flowを離脱または切替するとLoginMethodsをunmountして保留中の本人再確認をcancelできる", () => {
    const { rerender } = render(<AccountSecurityPage flow="connect-google" />);

    rerender(<AccountSecurityPage />);
    expect(mocks.onUnmount).toHaveBeenCalledOnce();

    rerender(<AccountSecurityPage flow="add-email-password" />);
    expect(mocks.onUnmount).toHaveBeenCalledTimes(2);
  });

  it("以前の方法を停止する意図をURLへ保存せずoverviewの次mountだけへ引き継ぐ", () => {
    const onBackToOverview = vi.fn();
    const { rerender } = render(<AccountSecurityPage flow="add-email-password" onBackToOverview={onBackToOverview} />);

    act(() => mocks.loginMethodsProps?.onRequestPreviousMethodRemoval("google"));

    expect(onBackToOverview).toHaveBeenCalledOnce();
    rerender(<AccountSecurityPage onBackToOverview={onBackToOverview} />);
    expect(mocks.loginMethodsProps?.pendingRemovalKind).toBe("google");

    act(() => mocks.loginMethodsProps?.onPendingRemovalClaimed());
    expect(mocks.loginMethodsProps?.pendingRemovalKind).toBeNull();
  });

  it("以前の方法の停止意図を保持したまま別flowを開始しない", () => {
    const onStartFlow = vi.fn();
    render(<AccountSecurityPage onStartFlow={onStartFlow} />);

    act(() => mocks.loginMethodsProps?.onRequestPreviousMethodRemoval("password"));
    expect(mocks.loginMethodsProps?.pendingRemovalKind).toBe("password");

    act(() => mocks.loginMethodsProps?.onStartFlow("connect-google"));

    expect(onStartFlow).toHaveBeenCalledWith("connect-google");
    expect(mocks.loginMethodsProps?.pendingRemovalKind).toBeNull();
  });
});
