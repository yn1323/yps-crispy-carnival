// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChakraProvider } from "@/src/providers/ChakraProvider";
import { userAtom } from "@/src/stores/user";

const mocks = vi.hoisted(() => ({
  linkProps: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  SignOutButton: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, search }: { children: React.ReactNode; to: string; search?: Record<string, unknown> }) => {
    mocks.linkProps({ to, search });
    return <a href={to}>{children}</a>;
  },
}));

import { UserMenu } from "./index";

describe("UserMenu", () => {
  beforeEach(() => {
    mocks.linkProps.mockReset();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  it("本人設定だけをcanonical accountへ向け、メールアドレスと旧組織設定を表示しない", async () => {
    const store = createStore();
    store.set(userAtom, {
      authId: "user_actor",
      name: "管理者",
      email: "convex@example.com",
    });
    render(
      <Provider store={store}>
        <ChakraProvider>
          <UserMenu />
        </ChakraProvider>
      </Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "ユーザーメニュー" }));

    expect(await screen.findByText("アカウント設定")).not.toBeNull();
    expect(screen.queryByText("組織設定")).toBeNull();
    expect(screen.queryByText("convex@example.com")).toBeNull();
    expect(mocks.linkProps).toHaveBeenCalledWith({ to: "/account", search: undefined });
  });

  it("ヘルプと問い合わせは別タブで開く", async () => {
    const store = createStore();
    store.set(userAtom, {
      authId: "user_actor",
      name: "管理者",
      email: "convex@example.com",
    });
    render(
      <Provider store={store}>
        <ChakraProvider>
          <UserMenu />
        </ChakraProvider>
      </Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "ユーザーメニュー" }));

    const helpLink = await screen.findByRole("menuitem", { name: "ヘルプ" });
    expect(helpLink.getAttribute("href")).toBe("/help");
    expect(helpLink.getAttribute("target")).toBe("_blank");
    expect(screen.getByRole("menuitem", { name: "お問い合わせ" }).getAttribute("target")).toBe("_blank");
  });
});
