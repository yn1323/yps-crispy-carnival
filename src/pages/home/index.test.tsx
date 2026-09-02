// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isCurrentWindowStandaloneWebApp: vi.fn(),
  replaceLocation: vi.fn(),
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
  mocks.replaceLocation.mockReset();
  mocks.isCurrentWindowStandaloneWebApp.mockReturnValue(false);
});

describe("HomePage", () => {
  it("通常ブラウザでは公開トップを表示する", () => {
    render(<HomePage replaceLocation={mocks.replaceLocation} />);

    expect(screen.getByRole("main").textContent).toBe("公開トップ");
    expect(mocks.replaceLocation).not.toHaveBeenCalled();
  });

  it("旧開始先を開くstandaloneではDashboardへdocument navigationする", async () => {
    mocks.isCurrentWindowStandaloneWebApp.mockReturnValue(true);

    render(<HomePage replaceLocation={mocks.replaceLocation} />);

    await waitFor(() => expect(mocks.replaceLocation).toHaveBeenCalledExactlyOnceWith("/dashboard"));
  });
});
