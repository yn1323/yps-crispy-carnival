// @vitest-environment jsdom

import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const failures = vi.hoisted(() => ({
  provider: null as Error | null,
  document: null as Error | null,
  loader: null as Error | null,
  rootLoader: null as Error | null,
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    HeadContent: () => {
      if (failures.document) throw failures.document;
      return <actual.HeadContent />;
    },
  };
});

vi.mock("@/src/providers/ChakraProvider", () => ({
  ChakraProvider: ({ children }: { children: ReactNode }) => {
    if (failures.provider) throw failures.provider;
    return children;
  },
}));

vi.mock("@/src/components/ui/toaster", () => ({ Toaster: () => null }));
vi.mock("@/src/lib/webMeasurement", () => ({ trackPageView: () => {} }));
vi.mock("@/src/hooks/useCloseDialogOnBrowserBack", () => ({ registerDialogBackNavigation: () => {} }));

vi.mock("./routeTree.gen.ts", async () => {
  const { createRoute } = await import("@tanstack/react-router");
  const { Route } = await import("./routes/__root");
  Route.options.loader = () => {
    if (failures.rootLoader) throw failures.rootLoader;
  };
  const indexRoute = createRoute({
    getParentRoute: () => Route,
    path: "/",
    loader: () => {
      if (failures.loader) throw failures.loader;
    },
    component: () => <main>ページの内容</main>,
  });
  return { routeTree: Route.addChildren([indexRoute]) };
});

import { getRouter } from "./router";

beforeEach(() => {
  failures.provider = null;
  failures.document = null;
  failures.loader = null;
  failures.rootLoader = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderRouter(router = getRouter()) {
  router.update({ history: createMemoryHistory({ initialEntries: ["/"] }) });
  await router.load();
  render(<RouterProvider router={router} />, { container: document });
}

describe("ルートと最上位のエラー復旧画面", () => {
  it("正常時はdocument内にページを表示する", async () => {
    await renderRouter();

    expect(await screen.findByText("ページの内容")).not.toBeNull();
    expect(document.querySelectorAll("html")).toHaveLength(1);
    expect(document.querySelectorAll("body")).toHaveLength(1);
  });

  it("Providerの初期化失敗でもエラー画面を再度失敗させず、documentを保つ", async () => {
    failures.provider = new Error("Provider initialization failed");

    await renderRouter();

    expect(await screen.findByRole("heading", { name: "ページを表示できませんでした", level: 1 })).not.toBeNull();
    expect(screen.queryByText("Something went wrong!")).toBeNull();
    expect(document.body.textContent).toContain(failures.provider.message);
    expect(document.querySelectorAll("html")).toHaveLength(1);
    expect(document.querySelectorAll('meta[name="viewport"]')).toHaveLength(1);
  });

  it("route loaderの失敗にも共通の復旧画面を表示する", async () => {
    failures.loader = new Error("Failed to fetch dynamically imported module");

    await renderRouter();

    expect(await screen.findByRole("heading", { name: "ページを表示できませんでした", level: 1 })).not.toBeNull();
    expect(document.body.textContent).toContain(failures.loader.message);
  });

  it("documentの描画が失敗しても、Router既定の英語画面へ落ちない", async () => {
    failures.document = new Error("Document rendering failed");

    await renderRouter();

    expect(await screen.findByRole("heading", { name: "ページを表示できませんでした", level: 1 })).not.toBeNull();
    expect(screen.queryByText("Something went wrong!")).toBeNull();
    expect(document.body.textContent).toContain(failures.document.message);
    expect(document.querySelectorAll("html")).toHaveLength(1);
    expect(document.querySelectorAll('meta[name="viewport"]')).toHaveLength(1);
  });

  it("rootのエラー画面自体の失敗も最上位で捕捉する", async () => {
    failures.provider = new Error("Provider initialization failed");
    const fallbackError = new Error("Root error fallback failed");
    const router = getRouter();
    const originalErrorComponent = router.routeTree.options.errorComponent;
    router.routeTree.update({
      errorComponent: () => {
        throw fallbackError;
      },
    });

    try {
      await renderRouter(router);

      expect(await screen.findByRole("heading", { name: "ページを表示できませんでした", level: 1 })).not.toBeNull();
      expect(screen.queryByText("Something went wrong!")).toBeNull();
      expect(document.body.textContent).toContain(fallbackError.message);
      expect(document.querySelectorAll("html")).toHaveLength(1);
    } finally {
      router.routeTree.update({ errorComponent: originalErrorComponent });
    }
  });

  it("rootの一次例外とエラー画面の二次例外を同じ詳細欄へ残す", async () => {
    const originalError = new Error("Too many redirects");
    const fallbackError = new Error("Root error fallback failed");
    const router = getRouter();
    failures.rootLoader = originalError;
    const originalErrorComponent = router.routeTree.options.errorComponent;
    router.routeTree.update({
      errorComponent: () => {
        throw fallbackError;
      },
    });

    try {
      await renderRouter(router);

      expect(await screen.findByRole("heading", { name: "ページを表示できませんでした", level: 1 })).not.toBeNull();
      await waitFor(() => {
        const details = document.querySelector('pre[data-clarity-mask="true"]');
        expect(details?.textContent).toContain(fallbackError.message);
        expect(details?.textContent).toContain(originalError.message);
        expect(details?.textContent).toContain('"route": "__root__"');
      });
      expect(document.querySelectorAll("html")).toHaveLength(1);
    } finally {
      router.routeTree.update({ errorComponent: originalErrorComponent });
    }
  });
});
