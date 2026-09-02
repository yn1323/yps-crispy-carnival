import { Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import type { ShopContextOption } from "@/src/domains/shop/context";
import { buildOperationContextModel } from "./script";
import { OperationContextView } from "./View";

const shop = (overrides: Partial<ShopContextOption>): ShopContextOption => ({
  shopId: "shop-a-1",
  shopName: "A店舗",
  organizationId: "org-a",
  organizationName: "東日本事業部",
  organizationPlan: "standard",
  ...overrides,
});

const multipleShops = [shop({}), shop({ shopId: "shop-a-2", shopName: "B店舗" })];
const longShopName = "駅前商業施設内レストランとても長い店舗名";

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

export const LongShopName: Story = {
  args: {
    model: createModel([shop({ shopName: longShopName })], "shop-a-1"),
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: {
    model: createModel([shop({ shopName: longShopName }), shop({ shopId: "shop-a-2", shopName: "B店舗" })], "shop-a-1"),
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
    await userEvent.click(await body.findByRole("menuitem", { name: /B店舗/ }));
    await expect(await canvas.findByRole("button", { name: "店舗を切り替える（現在：B店舗）" })).toBeVisible();
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
    />
  );
};
