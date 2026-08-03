// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChakraProvider } from "@/src/providers/ChakraProvider";
import { selectedShopAtom } from "@/src/stores/shop";
import { userAtom } from "@/src/stores/user";

const mocks = vi.hoisted(() => ({
  useUser: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  SignOutButton: ({ children }: { children: React.ReactNode }) => children,
  useUser: mocks.useUser,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/settings">{children}</a>,
}));

import { UserMenu } from "./index";

describe("UserMenu", () => {
  beforeEach(() => {
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
    mocks.useUser.mockReturnValue({
      isLoaded: true,
      user: { primaryEmailAddress: { emailAddress: "login@example.com" } },
    });
  });

  it("Convex atomと異なってもClerk primary emailだけを表示する", async () => {
    const store = createStore();
    store.set(userAtom, {
      authId: "user_actor",
      name: "管理者",
      email: "convex@example.com",
      featureVisibility: {
        organizationSettingsNavigation: false,
        billing: false,
        shopMembershipAddition: false,
      },
    });
    store.set(selectedShopAtom, null);
    render(
      <Provider store={store}>
        <ChakraProvider>
          <UserMenu />
        </ChakraProvider>
      </Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "ユーザーメニュー" }));

    expect(await screen.findByText("login@example.com")).not.toBeNull();
    expect(screen.queryByText("convex@example.com")).toBeNull();
  });

  it("Clerk primaryを確認できない間もConvexメールへfallbackしない", async () => {
    mocks.useUser.mockReturnValue({ isLoaded: false, user: null });
    const store = createStore();
    store.set(userAtom, {
      authId: "user_actor",
      name: "管理者",
      email: "convex@example.com",
      featureVisibility: {
        organizationSettingsNavigation: false,
        billing: false,
        shopMembershipAddition: false,
      },
    });
    render(
      <Provider store={store}>
        <ChakraProvider>
          <UserMenu />
        </ChakraProvider>
      </Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "ユーザーメニュー" }));

    expect(await screen.findByText("メールアドレスを確認中")).not.toBeNull();
    expect(screen.queryByText("convex@example.com")).toBeNull();
  });
});
