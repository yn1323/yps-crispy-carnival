import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import type { ShopContextOption } from "@/src/stores/shop";
import { ShopSelectionView } from ".";

const shops: ShopContextOption[] = [
  {
    shopId: "shibuya",
    shopName: "渋谷店",
    shopStatus: "active",
    organizationId: "org-sakura",
    organizationName: "株式会社さくらダイニング",
    organizationPlan: "business",
    memberStatus: "active",
  },
  {
    shopId: "shinjuku",
    shopName: "新宿店",
    shopStatus: "planSuspended",
    organizationId: "org-sakura",
    organizationName: "株式会社さくらダイニング",
    organizationPlan: "business",
    memberStatus: "readOnly",
  },
  {
    shopId: "yokohama",
    shopName: "横浜店",
    shopStatus: "active",
    organizationId: "org-minato",
    organizationName: "合同会社みなと食堂",
    organizationPlan: "pro",
    memberStatus: "active",
  },
  {
    shopId: "kawasaki",
    shopName: "川崎店",
    shopStatus: "archived",
    organizationId: "org-minato",
    organizationName: "合同会社みなと食堂",
    organizationPlan: "pro",
    memberStatus: "active",
  },
];

const meta = {
  title: "Features/ShopSelection",
  component: ShopSelectionView,
  parameters: { layout: "padded" },
  args: { shops, onSelect: () => {} },
} satisfies Meta<typeof ShopSelectionView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MultipleOrganizations: Story = {};

export const WithSelectedShop: Story = { args: { selectedShopId: "shinjuku" } };

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

const SelectionBehaviorHarness = () => {
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  return (
    <ShopSelectionView
      shops={shops}
      selectedShopId={selectedShopId}
      onSelect={(shop) => setSelectedShopId(shop.shopId)}
    />
  );
};

export const SelectionBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <SelectionBehaviorHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "横浜店を選択" }));
    await expect(canvas.getByText("選択中")).toBeInTheDocument();
  },
};
