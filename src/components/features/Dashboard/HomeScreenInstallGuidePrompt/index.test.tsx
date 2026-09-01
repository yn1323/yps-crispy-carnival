// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChakraProvider } from "@/src/providers/ChakraProvider";
import { HOME_SCREEN_INSTALL_GUIDE_DISMISSAL_STORAGE_KEY, HomeScreenInstallGuidePrompt } from ".";

const MOBILE_VIEWPORT_QUERY = "(max-width: 1023px)";
const STANDALONE_DISPLAY_QUERY = "(display-mode: standalone)";
const LINK_LABEL = "ホーム画面にシフトリを追加する（別タブで開きます）";

let isMobileViewport = true;
let isStandaloneDisplay = false;

beforeEach(() => {
  isMobileViewport = true;
  isStandaloneDisplay = false;
  window.localStorage.clear();
  Object.defineProperty(window.navigator, "standalone", {
    configurable: true,
    value: false,
  });
  window.matchMedia = vi
    .fn()
    .mockImplementation((query: string) =>
      createMediaQueryList(
        query,
        query === MOBILE_VIEWPORT_QUERY ? isMobileViewport : query === STANDALONE_DISPLAY_QUERY && isStandaloneDisplay,
      ),
    );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HomeScreenInstallGuidePrompt", () => {
  it("モバイルの通常ブラウザでは使い方を別タブで開くリンクを表示する", async () => {
    renderPrompt();

    const link = await screen.findByRole("link", { name: LINK_LABEL });
    expect(link.getAttribute("href")).toBe("/help/open-shiftori-from-home-screen");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("PCでは表示しない", async () => {
    isMobileViewport = false;

    renderPrompt();

    await waitForMediaEvaluation();
    expect(screen.queryByRole("link", { name: LINK_LABEL })).toBeNull();
  });

  it("display-modeがstandaloneなら表示しない", async () => {
    isStandaloneDisplay = true;

    renderPrompt();

    await waitForMediaEvaluation();
    expect(screen.queryByRole("link", { name: LINK_LABEL })).toBeNull();
  });

  it("iOSのstandalone起動なら表示しない", async () => {
    Object.defineProperty(window.navigator, "standalone", {
      configurable: true,
      value: true,
    });

    renderPrompt();

    await waitForMediaEvaluation();
    expect(screen.queryByRole("link", { name: LINK_LABEL })).toBeNull();
  });

  it("閉じると端末内へ保存し、再表示しない", async () => {
    const firstRender = renderPrompt();
    await screen.findByRole("link", { name: LINK_LABEL });

    fireEvent.click(screen.getByRole("button", { name: "ホーム画面への追加案内を閉じる" }));

    expect(screen.queryByRole("link", { name: LINK_LABEL })).toBeNull();
    expect(window.localStorage.getItem(HOME_SCREEN_INSTALL_GUIDE_DISMISSAL_STORAGE_KEY)).toBe("dismissed");

    firstRender.unmount();
    renderPrompt();
    await waitForMediaEvaluation();
    expect(screen.queryByRole("link", { name: LINK_LABEL })).toBeNull();
  });

  it("LocalStorageを読めない環境でも案内を表示する", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    renderPrompt();

    expect(await screen.findByRole("link", { name: LINK_LABEL })).not.toBeNull();
  });

  it("LocalStorageへ保存できなくても現在の画面では閉じる", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    renderPrompt();
    await screen.findByRole("link", { name: LINK_LABEL });

    fireEvent.click(screen.getByRole("button", { name: "ホーム画面への追加案内を閉じる" }));

    expect(screen.queryByRole("link", { name: LINK_LABEL })).toBeNull();
  });
});

function renderPrompt() {
  return render(
    <ChakraProvider>
      <HomeScreenInstallGuidePrompt />
    </ChakraProvider>,
  );
}

async function waitForMediaEvaluation() {
  await waitFor(() => {
    expect(window.matchMedia).toHaveBeenCalledWith(MOBILE_VIEWPORT_QUERY);
    expect(window.matchMedia).toHaveBeenCalledWith(STANDALONE_DISPLAY_QUERY);
  });
}

function createMediaQueryList(media: string, matches: boolean): MediaQueryList {
  return {
    matches,
    media,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}
