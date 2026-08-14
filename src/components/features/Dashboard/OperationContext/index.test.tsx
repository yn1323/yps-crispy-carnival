// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopContextOption } from "@/src/domains/shop/context";
import { ChakraProvider } from "@/src/providers/ChakraProvider";
import type { PlanStatusCardProps } from "../PlanStatusCard";

const mocks = vi.hoisted(() => ({
  getMyShops: Symbol("getMyShops"),
  selectedShopAtom: Symbol("selectedShopAtom"),
  featureVisibilityAtom: Symbol("featureVisibilityAtom"),
  featureVisibility: {
    organizationSettingsNavigation: true,
    billing: true,
    shopMembershipAddition: true,
  },
  navigate: vi.fn(),
  useQuery: vi.fn(),
  useAtomValue: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, search, to, ...props }: { children: ReactNode; search?: { shop?: string }; to: string }) => (
    <a href={search?.shop ? `${to}?shop=${search.shop}` : to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => mocks.navigate,
}));

vi.mock("convex/react", () => ({
  useQuery: mocks.useQuery,
}));

vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jotai")>()),
  useAtomValue: mocks.useAtomValue,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: { dashboard: { queries: { getMyShops: mocks.getMyShops } } },
}));

vi.mock("@/src/stores/shop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/stores/shop")>()),
  selectedShopAtom: mocks.selectedShopAtom,
}));

vi.mock("@/src/stores/user", () => ({
  featureVisibilityAtom: mocks.featureVisibilityAtom,
}));

import { OperationContext, type OperationContextOrganizationOption } from ".";

const shops = [
  {
    shopId: "shop-a",
    shopName: "A店",
    shopStatus: "active",
    organizationId: "organization-a",
    organizationName: "Aグループ",
    organizationPlan: "pro",
    memberStatus: "active",
  },
  {
    shopId: "shop-b",
    shopName: "B店",
    shopStatus: "active",
    organizationId: "organization-a",
    organizationName: "Aグループ",
    organizationPlan: "pro",
    memberStatus: "active",
  },
  {
    shopId: "shop-c",
    shopName: "C店",
    shopStatus: "active",
    organizationId: "organization-b",
    organizationName: "Bグループ",
    organizationPlan: "pro",
    memberStatus: "active",
  },
] as const;

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
  mocks.navigate.mockReset();
  mocks.useQuery.mockReturnValue(shops);
  Object.assign(mocks.featureVisibility, {
    organizationSettingsNavigation: true,
    billing: true,
    shopMembershipAddition: true,
  });
  mocks.useAtomValue.mockImplementation((target) =>
    target === mocks.featureVisibilityAtom ? mocks.featureVisibility : shops[0],
  );
});

const renderContext = (
  contextShops: readonly ShopContextOption[] = shops,
  selectedShop: ShopContextOption = contextShops[0] as ShopContextOption,
  props: {
    planStatusCard?: PlanStatusCardProps | null;
    billingSettingsShopId?: string;
    onOpenShopDetail?: (shopId: string) => void;
    onOpenOrganizationSettings?: () => void;
    organizations?: readonly OperationContextOrganizationOption[];
    onOrganizationSelect?: (organization: OperationContextOrganizationOption) => void;
  } = {},
) => {
  const { organizations, onOrganizationSelect, ...contextProps } = props;
  return render(
    <ChakraProvider>
      <OperationContext
        data={{
          shops: contextShops,
          selectedShop,
          ...(organizations ? { organizations } : {}),
          ...(onOrganizationSelect ? { onOrganizationSelect } : {}),
        }}
        {...contextProps}
      />
    </ChakraProvider>,
  );
};

const paidPlanCard = (overrides: Partial<PlanStatusCardProps> = {}): PlanStatusCardProps => ({
  data: {
    kind: "paidPlan",
    planName: "Pro",
    badgeLabel: "利用中",
    nextEventLabel: "次回更新日：2026/9/1",
  },
  usage: {
    peopleUsage: { current: 12, max: 20 },
    shopUsage: { current: 2, max: 5 },
  },
  defaultExpanded: false,
  onAction: vi.fn(),
  onExpandedChange: vi.fn(),
  ...overrides,
});

const openOrganizationAccordion = async () => {
  const trigger = screen.getByRole("button", { name: /Aグループ/ });
  fireEvent.focus(trigger);
  fireEvent.click(trigger);
  await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("true"));
  return trigger;
};

describe("OperationContext", () => {
  it("店舗セレクトで選んだ店舗をshop queryに指定してDashboardへ遷移する", async () => {
    renderContext();

    expect(screen.getByText("店舗", { exact: true })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "店舗を切り替える（現在：A店）" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /B店/ }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard", search: { shop: "shop-b" } });
    });
  });

  it("別組織の店舗も同じ店舗セレクトから選べる", async () => {
    renderContext();

    fireEvent.click(screen.getByRole("button", { name: "店舗を切り替える（現在：A店）" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /C店/ }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard", search: { shop: "shop-c" } });
    });
  });

  it("組織Accordionから別組織の先頭店舗へ直接切り替えられる", async () => {
    renderContext();

    await openOrganizationAccordion();
    expect(screen.queryByRole("button", { name: "組織を変更：Aグループ" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "組織を変更：Bグループ" }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard", search: { shop: "shop-c" } });
    });
  });

  it("app Homeではcanonical組織IDを返し、別組織の代表店舗を推測しない", async () => {
    const onOrganizationSelect = vi.fn();
    const organizations = [
      { id: "organization-a", name: "Aグループ" },
      { id: "organization-b", name: "Bグループ" },
    ];
    renderContext(shops.slice(0, 2), shops[0], { organizations, onOrganizationSelect });

    await openOrganizationAccordion();
    fireEvent.click(await screen.findByRole("button", { name: "組織を変更：Bグループ" }));

    expect(onOrganizationSelect).toHaveBeenCalledWith({ id: "organization-b", name: "Bグループ" });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("現在店舗を表示対象とコンテキストにして店舗詳細へ遷移する", async () => {
    renderContext();

    fireEvent.click(screen.getByRole("button", { name: "店舗詳細を開く" }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/shops/$shopId",
        params: { shopId: "shop-a" },
        search: { shop: "shop-a", returnTo: "dashboard" },
      });
    });
  });

  it("app routeでは既存UIから渡された店舗・組織設定callbackを使う", async () => {
    const onOpenShopDetail = vi.fn();
    const onOpenOrganizationSettings = vi.fn();
    renderContext(shops, shops[0], { onOpenShopDetail, onOpenOrganizationSettings });

    fireEvent.click(screen.getByRole("button", { name: "店舗詳細を開く" }));
    await openOrganizationAccordion();
    fireEvent.click(await screen.findByRole("button", { name: "Aグループの組織設定を開く" }));

    expect(onOpenShopDetail).toHaveBeenCalledWith("shop-a");
    expect(onOpenOrganizationSettings).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("組織Accordion内のリンクへ選択店舗を引き継ぐ", async () => {
    renderContext();

    await openOrganizationAccordion();
    const organizationSettingsLink = await screen.findByRole("link", { name: "Aグループの組織設定を開く" });
    expect(organizationSettingsLink.getAttribute("href")).toBe("/settings?shop=shop-a");
  });

  it("プラン情報がなくても組織情報と組織変更の導線をAccordionに表示する", async () => {
    renderContext();

    await openOrganizationAccordion();

    expect(await screen.findByRole("link", { name: "Aグループの組織設定を開く" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "組織を変更：Bグループ" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "プランと支払いへ" })).toBeNull();
  });

  it("プラン詳細、組織、支払い、組織変更の順に表示する", async () => {
    renderContext(shops, shops[0], {
      planStatusCard: paidPlanCard(),
      billingSettingsShopId: "shop-a",
    });

    await openOrganizationAccordion();
    const planDetails = await screen.findByRole("region", { name: "Proプランの詳細" });
    const organizationSettingsLink = await screen.findByRole("link", { name: "Aグループの組織設定を開く" });
    const planAndPaymentLink = screen.getByRole("button", { name: "プランと支払いへ" });
    const organizationChangeButton = screen.getByRole("button", { name: "組織を変更：Bグループ" });

    expect(screen.getByText("組織・プラン")).not.toBeNull();
    expect(
      planDetails.compareDocumentPosition(organizationSettingsLink) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      organizationSettingsLink.compareDocumentPosition(planAndPaymentLink) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      planAndPaymentLink.compareDocumentPosition(organizationChangeButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("Accordionの開閉をプランcontrollerへ通知する", async () => {
    const onExpandedChange = vi.fn();
    renderContext(shops, shops[0], {
      planStatusCard: paidPlanCard({ onExpandedChange }),
      billingSettingsShopId: "shop-a",
    });
    const trigger = screen.getByRole("button", { name: /Aグループ/ });

    fireEvent.focus(trigger);
    fireEvent.click(trigger);
    await waitFor(() => expect(onExpandedChange).toHaveBeenLastCalledWith(true));
    fireEvent.click(trigger);
    await waitFor(() => expect(onExpandedChange).toHaveBeenLastCalledWith(false));
  });

  it("後で確認する操作ではAccordionを閉じて組織triggerへfocusを戻す", async () => {
    const onAction = vi.fn();
    const onExpandedChange = vi.fn();
    const trialCard: PlanStatusCardProps = {
      data: {
        kind: "trial",
        remainingDays: 3,
        trialEndsOnLabel: "2026/8/15",
        description: "継続するプランを選択してください。",
        primaryAction: { action: "choosePlan", label: "プランを選ぶ" },
        showRemindLater: true,
      },
      usage: null,
      defaultExpanded: true,
      onAction,
      onExpandedChange,
    };
    renderContext(shops, shops[0], { planStatusCard: trialCard, billingSettingsShopId: "shop-a" });
    const trigger = screen.getByRole("button", { name: /Aグループ/ });

    expect(screen.getByText("組織・プラン")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "プランを選ぶ" }));
    expect(onAction).toHaveBeenCalledWith("choosePlan");
    fireEvent.click(screen.getByRole("button", { name: "後で確認する" }));

    expect(onAction).toHaveBeenCalledWith("remindLater");
    await waitFor(() => expect(onExpandedChange).toHaveBeenLastCalledWith(false));
    expect(document.activeElement).toBe(trigger);
  });

  it("1組織1店舗では店舗切替を表示しない", () => {
    renderContext([shops[0]], shops[0]);

    expect(screen.getByText("店舗", { exact: true })).not.toBeNull();
    expect(screen.getAllByText("A店")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /店舗を切り替える/ })).toBeNull();
    expect(screen.getByRole("button", { name: "店舗詳細を開く" })).not.toBeNull();
  });
});
