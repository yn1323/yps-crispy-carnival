// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveDashboardAnnouncementsV2: Symbol("getActiveDashboardAnnouncementsV2"),
  useAtomValue: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: mocks.useQuery,
}));

vi.mock("jotai", () => ({
  useAtomValue: mocks.useAtomValue,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    dashboard: {
      queries: {
        getActiveDashboardAnnouncementsV2: mocks.getActiveDashboardAnnouncementsV2,
      },
    },
  },
}));

vi.mock("@/src/stores/shop", () => ({
  selectedShopAtom: Symbol("selectedShopAtom"),
}));

import { DashboardAnnouncement } from ".";

describe("DashboardAnnouncement", () => {
  beforeEach(() => {
    mocks.useAtomValue.mockReturnValue(null);
    mocks.useQuery.mockReturnValue(undefined);
  });

  it("canonical plan ID契約を指定してお知らせを取得する", () => {
    render(<DashboardAnnouncement />);

    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.getActiveDashboardAnnouncementsV2, {});
  });
});
