// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChakraProvider } from "@/src/providers/ChakraProvider";

const mocks = vi.hoisted(() => ({
  listOrganizationPeopleAvailableForShop: Symbol("listOrganizationPeopleAvailableForShop"),
  useShopQuery: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    staff: {
      queries: {
        listOrganizationPeopleAvailableForShop: mocks.listOrganizationPeopleAvailableForShop,
      },
    },
  },
}));

vi.mock("@/src/hooks/useShopQuery", () => ({
  useShopQuery: mocks.useShopQuery,
}));

import { OrganizationPeopleCandidateList } from "./OrganizationPeopleCandidateList";

beforeEach(() => {
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
  mocks.useShopQuery.mockReset();
  mocks.useShopQuery.mockReturnValue([]);
});

describe("OrganizationPeopleCandidateList", () => {
  it("選択中だけ候補queryを開始し、追加方法へ戻るとquery subtreeを外す", () => {
    const props = {
      addingPersonId: null,
      isAdding: false,
      onAdd: vi.fn(),
    };
    const { rerender } = render(
      <ChakraProvider>
        <OrganizationPeopleCandidateList enabled={false} {...props} />
      </ChakraProvider>,
    );

    expect(mocks.useShopQuery).not.toHaveBeenCalled();
    expect(screen.queryByText("追加できるスタッフはいません")).toBeNull();

    rerender(
      <ChakraProvider>
        <OrganizationPeopleCandidateList enabled {...props} />
      </ChakraProvider>,
    );

    expect(mocks.useShopQuery).toHaveBeenCalledOnce();
    expect(mocks.useShopQuery).toHaveBeenCalledWith(mocks.listOrganizationPeopleAvailableForShop, {});
    expect(screen.getByText("追加できるスタッフはいません")).not.toBeNull();

    rerender(
      <ChakraProvider>
        <OrganizationPeopleCandidateList enabled={false} {...props} />
      </ChakraProvider>,
    );

    expect(mocks.useShopQuery).toHaveBeenCalledOnce();
    expect(screen.queryByText("追加できるスタッフはいません")).toBeNull();
  });
});
