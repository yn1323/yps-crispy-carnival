import { Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { ShopContextOption } from "@/src/domains/shop/context";
import type { PlanStatusCardProps } from "../PlanStatusCard";
import { buildOperationContextModel } from "./script";
import { OperationContextView } from "./View";

const shop = (overrides: Partial<ShopContextOption>): ShopContextOption => ({
  shopId: "shop-a-1",
  shopName: "A店舗",
  shopStatus: "active",
  organizationId: "org-a",
  organizationName: "東日本事業部",
  organizationPlan: "pro",
  memberStatus: "active",
  ...overrides,
});

const multipleShops = [
  shop({}),
  shop({ shopId: "shop-a-2", shopName: "B店舗" }),
  shop({ shopId: "shop-b-1", shopName: "C店舗", organizationId: "org-b", organizationName: "関西事業部" }),
  shop({ shopId: "shop-b-2", shopName: "D店舗", organizationId: "org-b", organizationName: "関西事業部" }),
];
const multipleOrganizations = [
  ...multipleShops,
  shop({ shopId: "shop-c-1", shopName: "E店舗", organizationId: "org-c", organizationName: "中部事業部" }),
];
const longOrganizationName = "株式会社とても長い名前のフードサービスグループ";
const mobileShops = multipleOrganizations.map((option) =>
  option.organizationId === "org-a" ? { ...option, organizationName: longOrganizationName } : option,
);
const canonicalOrganizationOptions = [
  { key: "org-b", organizationName: "関西事業部", targetId: "org-b" },
  {
    key: "org-c",
    organizationName: "株式会社とても長い名前の中部フードサービス事業部",
    targetId: "org-c",
  },
];
const paidPlanStatusCard = {
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
  defaultExpanded: true,
  onAction: () => {},
} satisfies PlanStatusCardProps;

const createModel = (shops: readonly ShopContextOption[], selectedShopId: string) => {
  const model = buildOperationContextModel(shops, selectedShopId);
  if (!model) throw new Error("Storyの操作先データが不正です");
  return model;
};

const meta = {
  title: "Features/Dashboard/OperationContext",
  component: OperationContextView,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <Stack maxW="1024px" mx="auto" w="full">
        <Story />
      </Stack>
    ),
  ],
  args: {
    onShopSelect: () => {},
    onOpenShopDetail: () => {},
    onOpenOrganizationSettings: () => {},
  },
} satisfies Meta<typeof OperationContextView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleGroupSingleShop: Story = {
  args: {
    model: createModel([shop({})], "shop-a-1"),
  },
};

export const SingleGroupMultipleShops: Story = {
  args: {
    model: createModel(multipleShops.slice(0, 2), "shop-a-1"),
  },
};

export const MultipleGroupsMultipleShops: Story = {
  args: {
    model: createModel(multipleShops, "shop-a-1"),
  },
};

export const LongNamesReadOnly: Story = {
  args: {
    model: createModel(
      [
        shop({
          shopName: "駅前商業施設内レストランとても長い店舗名",
          organizationName: longOrganizationName,
          memberStatus: "readOnly",
        }),
      ],
      "shop-a-1",
    ),
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: {
    model: createModel(mobileShops, "shop-a-1"),
  },
};

export const ExpandedWithPaidPlan: Story = {
  args: {
    model: createModel([shop({})], "shop-a-1"),
    planStatusCard: paidPlanStatusCard,
    billingSettingsShopId: "shop-a-1",
  },
};

export const ExpandedWithPaidPlanMobile: Story = {
  ...ExpandedWithPaidPlan,
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const ExpandedWithPaidPlanAndMultipleOrganizations: Story = {
  args: {
    model: createModel(multipleOrganizations, "shop-a-1"),
    planStatusCard: paidPlanStatusCard,
    billingSettingsShopId: "shop-a-1",
  },
};

export const ExpandedWithPaidPlanAndMultipleOrganizationsMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: {
    model: createModel(mobileShops, "shop-b-1"),
    planStatusCard: paidPlanStatusCard,
    billingSettingsShopId: "shop-b-1",
  },
};

export const CanonicalOrganizationOptionsMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: {
    model: createModel(
      mobileShops.filter((option) => option.organizationId === "org-a"),
      "shop-a-1",
    ),
    organizationChangeOptions: canonicalOrganizationOptions,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: new RegExp(longOrganizationName) }));
    await waitFor(() => expect(canvas.getByRole("button", { name: "組織を変更：関西事業部" })).toBeVisible());
  },
};

export const SelectionBehavior: Story = {
  args: {
    model: createModel(multipleShops, "shop-a-1"),
  },
  parameters: {
    screenshot: { skip: true },
  },
  render: () => <SelectionBehaviorStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "店舗を切り替える（現在：A店舗）" }));
    await userEvent.click(await body.findByRole("menuitem", { name: /C店舗/ }));
    await expect(await canvas.findByRole("button", { name: "店舗を切り替える（現在：C店舗）" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: /関西事業部/ }));
    await expect(canvas.getByRole("button", { name: "関西事業部の組織設定を開く" })).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "店舗を切り替える（現在：C店舗）" }));
    await userEvent.click(await body.findByRole("menuitem", { name: /D店舗/ }));
    await expect(await canvas.findByRole("button", { name: "店舗を切り替える（現在：D店舗）" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: /関西事業部/ }));
    await expect(canvas.getByRole("button", { name: "関西事業部の組織設定を開く" })).toBeVisible();
  },
};

export const CanonicalOrganizationSelectionBehavior: Story = {
  args: {
    model: createModel(multipleShops.slice(0, 2), "shop-a-1"),
  },
  parameters: { screenshot: { skip: true } },
  render: () => <CanonicalOrganizationSelectionBehaviorStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: /東日本事業部/ }));
    await userEvent.click(await canvas.findByRole("button", { name: "組織を変更：関西事業部" }));

    await expect(await canvas.findByRole("status")).toHaveTextContent("org-bへ切り替えました");
  },
};

const SelectionBehaviorStory = () => {
  const [selectedShopId, setSelectedShopId] = useState("shop-a-1");
  const model = createModel(multipleShops, selectedShopId);

  return (
    <OperationContextView
      key={model.selectedShop.shopId}
      model={model}
      onShopSelect={setSelectedShopId}
      onOpenShopDetail={() => {}}
      onOpenOrganizationSettings={() => {}}
    />
  );
};

const CanonicalOrganizationSelectionBehaviorStory = () => {
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const model = createModel(multipleShops.slice(0, 2), "shop-a-1");

  return (
    <Stack gap={3}>
      <OperationContextView
        model={model}
        onShopSelect={() => {}}
        onOpenShopDetail={() => {}}
        onOpenOrganizationSettings={() => {}}
        organizationChangeOptions={canonicalOrganizationOptions}
        onOrganizationChange={setSelectedOrganizationId}
      />
      {selectedOrganizationId && <output>{selectedOrganizationId}へ切り替えました</output>}
    </Stack>
  );
};
