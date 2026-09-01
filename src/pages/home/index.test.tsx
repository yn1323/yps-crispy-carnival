// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isCurrentWindowStandaloneWebApp: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/src/components/features/LandingPage", () => ({
  LandingPage: () => <main>公開トップ</main>,
}));

vi.mock("@/src/lib/pwaDisplayMode", () => ({
  isCurrentWindowStandaloneWebApp: mocks.isCurrentWindowStandaloneWebApp,
}));

import { HomePage } from ".";

beforeEach(() => {
  mocks.isCurrentWindowStandaloneWebApp.mockReset();
  mocks.navigate.mockReset();
  mocks.isCurrentWindowStandaloneWebApp.mockReturnValue(false);
  mocks.navigate.mockResolvedValue(undefined);
});

describe("HomePage", () => {
  it("通常ブラウザでは公開トップを表示する", () => {
    render(<HomePage />);

    expect(screen.getByRole("main").textContent).toBe("公開トップ");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("旧開始先を開くstandaloneではDashboardへreplaceする", async () => {
    mocks.isCurrentWindowStandaloneWebApp.mockReturnValue(true);

    render(<HomePage />);

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard", search: {}, replace: true }));
    expect(mocks.navigate).toHaveBeenCalledOnce();
  });
});
