// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChakraProvider } from "@/src/providers/ChakraProvider";
import type { DashboardAnnouncement as DashboardAnnouncementData } from "../types";

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

const buildAnnouncement = (
  key: string,
  targets: Pick<DashboardAnnouncementData, "organizationId" | "shopId" | "organizationPlan"> = {},
) =>
  ({
    _id: `dashboard-announcement-${key}`,
    ...targets,
    title: `${key}のお知らせ`,
    bodyHtml: `<p>${key}の本文です。</p>`,
    displayDate: "2026-06-17",
  }) as unknown as DashboardAnnouncementData;

const renderAnnouncement = () =>
  render(
    <ChakraProvider>
      <DashboardAnnouncement />
    </ChakraProvider>,
  );

describe("DashboardAnnouncement", () => {
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
    mocks.useAtomValue.mockReturnValue(null);
    mocks.useQuery.mockReturnValue(undefined);
  });

  it("canonical plan ID契約を指定してお知らせを取得する", () => {
    renderAnnouncement();

    expect(mocks.useQuery).toHaveBeenCalledWith(mocks.getActiveDashboardAnnouncementsV2, {});
  });

  it("全体向けと現在の事業者向けを候補順のまま複数表示し、他事業者向けを除外する", () => {
    mocks.useAtomValue.mockReturnValue({
      organizationId: "organization-current",
      shopId: "shop-current",
      organizationPlan: "standard",
    });
    mocks.useQuery.mockReturnValue([
      buildAnnouncement("全体"),
      buildAnnouncement("現在の事業者", { organizationId: "organization-current" }),
      buildAnnouncement("他の事業者", { organizationId: "organization-other" }),
      buildAnnouncement("全体・過去"),
    ]);

    renderAnnouncement();

    const rows = screen.getAllByRole("button", { name: /のお知らせを開く$/ });
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("全体のお知らせ"),
      expect.stringContaining("現在の事業者のお知らせ"),
      expect.stringContaining("全体・過去のお知らせ"),
    ]);
    expect(screen.queryByRole("button", { name: /他の事業者のお知らせを開く$/ })).toBeNull();
  });

  it("表示対象がない場合は空の表示領域を作らない", () => {
    const renderState = vi.fn(() => null);
    mocks.useAtomValue.mockReturnValue({
      organizationId: "organization-current",
      shopId: "shop-current",
      organizationPlan: "standard",
    });
    mocks.useQuery.mockReturnValue([buildAnnouncement("他の事業者", { organizationId: "organization-other" })]);

    render(
      <ChakraProvider>
        <DashboardAnnouncement>{renderState}</DashboardAnnouncement>
      </ChakraProvider>,
    );

    expect(renderState).toHaveBeenLastCalledWith({ announcements: [], content: null });
  });
});
