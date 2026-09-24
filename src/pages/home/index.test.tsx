// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isCurrentDocumentStandaloneLaunchAt: vi.fn(),
  replaceLocation: vi.fn(),
}));

vi.mock("@/src/components/features/LandingPage", () => ({
  LandingPage: () => <main>公開トップ</main>,
}));

vi.mock("@/src/lib/pwaDisplayMode", () => ({
  isCurrentDocumentStandaloneLaunchAt: mocks.isCurrentDocumentStandaloneLaunchAt,
}));

import { HomePage } from ".";

beforeEach(() => {
  mocks.isCurrentDocumentStandaloneLaunchAt.mockReset();
  mocks.replaceLocation.mockReset();
  mocks.isCurrentDocumentStandaloneLaunchAt.mockReturnValue(false);
});

describe("HomePage", () => {
  it("ホーム画面からの起動でなければ公開トップを表示する", () => {
    render(<HomePage replaceLocation={mocks.replaceLocation} />);

    expect(screen.getByRole("main").textContent).toBe("公開トップ");
    expect(mocks.replaceLocation).not.toHaveBeenCalled();
    expect(mocks.isCurrentDocumentStandaloneLaunchAt).toHaveBeenCalledWith("/");
  });

  it("ホーム画面から旧開始先を開いた起動ではDashboardへdocument navigationする", async () => {
    mocks.isCurrentDocumentStandaloneLaunchAt.mockReturnValue(true);

    render(<HomePage replaceLocation={mocks.replaceLocation} />);

    await waitFor(() => expect(mocks.replaceLocation).toHaveBeenCalledExactlyOnceWith("/dashboard"));
  });
});
