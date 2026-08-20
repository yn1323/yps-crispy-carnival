// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  editorQueryRef: Symbol("getOrganizationStaffOrderEditor"),
}));

vi.mock("convex/react", () => ({ useQuery: mocks.useQuery }));
vi.mock("@/convex/_generated/api", () => ({
  api: {
    appOrganization: {
      staffOrderQueries: { getOrganizationStaffOrderEditor: mocks.editorQueryRef },
    },
  },
}));
vi.mock("@/src/components/features/StaffOrderEditor", () => ({
  StaffOrderEditor: ({
    organizationId,
    editor,
    filteredShopName,
    returnShopFilter,
  }: {
    organizationId: string;
    editor: { availability: string };
    filteredShopName?: string;
    returnShopFilter?: string;
  }) => (
    <section aria-label="スタッフ並び順feature">
      <output data-testid="organization-id">{organizationId}</output>
      <output data-testid="availability">{editor.availability}</output>
      {filteredShopName && <output data-testid="filtered-shop-name">{filteredShopName}</output>}
      {returnShopFilter && <output data-testid="return-shop-filter">{returnShopFilter}</output>}
    </section>
  ),
}));
vi.mock("@/src/components/templates/AuthenticatedPageContent", () => ({
  AuthenticatedPageContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/src/components/ui/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { ChakraProvider } from "@/src/providers/ChakraProvider";
import { AppStaffOrderRoutePage } from ".";

const readyEditor = {
  people: [
    { personId: "person-a", name: "山田 花子", email: "a@example.com", shopNames: ["本店"] },
    { personId: "person-b", name: "佐藤 太郎", email: "b@example.com", shopNames: ["本店"] },
  ],
  orderFingerprint: "a".repeat(64),
  canWrite: true,
  availability: "ready" as const,
};

const renderPage = ({
  requestedShopFilter = "shop-1",
  activeShops = [{ id: "shop-1" as never, name: "本店" }],
}: {
  requestedShopFilter?: string;
  activeShops?: Array<{ id: never; name: string }> | null;
} = {}) =>
  render(
    <ChakraProvider>
      <AppStaffOrderRoutePage
        organizationId={"organization-1" as never}
        requestedShopFilter={requestedShopFilter}
        activeShops={activeShops}
      />
    </ChakraProvider>,
  );

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  mocks.useQuery.mockReset();
  mocks.useQuery.mockReturnValue(readyEditor);
});

describe("AppStaffOrderRoutePage", () => {
  it("有効店舗scopeの全pageが揃うまでeditor queryを開始しない", () => {
    renderPage({ activeShops: null });

    expect(mocks.useQuery).not.toHaveBeenCalled();
    expect(screen.getByLabelText("スタッフの並び順を読み込み中")).not.toBeNull();
  });

  it("editor queryの初回結果を待ってからfeatureを構成する", () => {
    mocks.useQuery.mockReturnValue(undefined);
    renderPage();

    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.editorQueryRef, { organizationId: "organization-1" });
    expect(screen.queryByLabelText("スタッフ並び順feature")).toBeNull();
    expect(screen.getByLabelText("スタッフの並び順を読み込み中")).not.toBeNull();
  });

  it("有効な元店舗filterをfeatureの説明と保存後の戻り先へ渡す", () => {
    renderPage();

    expect(screen.getByTestId("filtered-shop-name").textContent).toBe("本店");
    expect(screen.getByTestId("return-shop-filter").textContent).toBe("shop-1");
    expect(screen.getByTestId("organization-id").textContent).toBe("organization-1");
  });

  it("無効な元店舗filterをfeatureへ渡さない", () => {
    renderPage({ requestedShopFilter: "outside-shop" });

    expect(screen.queryByTestId("filtered-shop-name")).toBeNull();
    expect(screen.queryByTestId("return-shop-filter")).toBeNull();
  });

  it("解決済みの利用不可stateも同じfeature instanceへ渡す", () => {
    mocks.useQuery.mockReturnValue({
      ...readyEditor,
      people: [],
      canWrite: false,
      availability: "legacyDataIncomplete",
    });
    renderPage();

    expect(screen.getByTestId("availability").textContent).toBe("legacyDataIncomplete");
  });
});
