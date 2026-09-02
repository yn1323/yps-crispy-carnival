// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clerkProvider: vi.fn(),
}));

vi.mock("@clerk/localizations", () => ({ jaJP: { locale: "ja-JP" } }));
vi.mock("@clerk/react", () => ({
  ClerkProvider: (props: Record<string, unknown> & { children: ReactNode }) => {
    mocks.clerkProvider(props);
    return props.children;
  },
}));
vi.mock("@/src/configs/authEnv", () => ({
  CLERK_PUBLISHABLE_KEY: "pk_test_example",
  CONVEX_URL: "https://test.convex.cloud",
}));
vi.mock("@/src/providers/ConvexProvider", () => ({
  ConvexClientProvider: ({ children }: { children: ReactNode }) => children,
}));

import { AuthProviders } from "./AuthProviders";

describe("AuthProviders", () => {
  it("Clerkの認証画面とfallback先をシフトリのrouteへ固定する", () => {
    render(
      <AuthProviders>
        <div>認証済み領域</div>
      </AuthProviders>,
    );

    expect(screen.getByText("認証済み領域")).toBeTruthy();
    expect(mocks.clerkProvider).toHaveBeenCalledOnce();
    const props = mocks.clerkProvider.mock.calls[0]?.[0];
    expect(props).toMatchObject({
      publishableKey: "pk_test_example",
      localization: { locale: "ja-JP" },
      signInUrl: "/login",
      signUpUrl: "/signup",
      signInFallbackRedirectUrl: "/dashboard",
      signUpFallbackRedirectUrl: "/dashboard",
    });
    expect(props).not.toHaveProperty("signInForceRedirectUrl");
    expect(props).not.toHaveProperty("signUpForceRedirectUrl");
  });
});
