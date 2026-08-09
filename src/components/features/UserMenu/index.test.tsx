// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChakraProvider } from "@/src/providers/ChakraProvider";
import { selectedShopAtom } from "@/src/stores/shop";
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

  it("組織設定が非公開でもアカウント設定を表示し、メニューにメールアドレスを表示しない", async () => {
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

    expect(await screen.findByText("アカウント設定")).not.toBeNull();
    expect(screen.queryByText("組織設定")).toBeNull();
    expect(screen.queryByText("convex@example.com")).toBeNull();
    expect(mocks.linkProps).toHaveBeenCalledWith({ to: "/account", search: undefined });
  });

  it("アカウント設定には選択中の店舗を引き継がず、組織設定だけに店舗を渡す", async () => {
    const store = createStore();
    store.set(userAtom, {
      authId: "user_actor",
      name: "管理者",
      email: "convex@example.com",
      featureVisibility: {
        organizationSettingsNavigation: true,
        billing: false,
        shopMembershipAddition: false,
      },
    });
    store.set(selectedShopAtom, {
      shopId: "shop-a",
      shopName: "A店",
      shopStatus: "active",
      organizationId: "organization-a",
      organizationName: "A社",
      organizationPlan: "free",
      memberStatus: "active",
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
    expect(screen.queryByText("組織設定")).not.toBeNull();
    expect(mocks.linkProps).toHaveBeenCalledWith({ to: "/account", search: undefined });
    expect(mocks.linkProps).toHaveBeenCalledWith({ to: "/settings", search: { shop: "shop-a" } });
  });
});
