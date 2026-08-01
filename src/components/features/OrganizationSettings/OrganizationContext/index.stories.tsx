import { Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import type { ShopContextOption } from "@/src/domains/shop/context";
import { OrganizationContext } from ".";
import { buildOrganizationContextModel } from "./script";

const shop = (overrides: Partial<ShopContextOption>): ShopContextOption => ({
  shopId: "shop-a-1",
  shopName: "渋谷店",
  shopStatus: "active",
  organizationId: "organization-a",
  organizationName: "株式会社さくらダイニング",
  organizationPlan: "pro",
  memberStatus: "active",
  ...overrides,
});

const shops = [
  shop({}),
  shop({ shopId: "shop-a-2", shopName: "新宿店" }),
  shop({
    shopId: "shop-b-1",
    shopName: "梅田店",
    organizationId: "organization-b",
    organizationName: "株式会社みどりフーズ",
  }),
];

const createModel = (contextShops: readonly ShopContextOption[], selectedShopId: string) => {
  const model = buildOrganizationContextModel(contextShops, selectedShopId);
  if (!model) throw new Error("Storyのグループ選択データが不正です");
  return model;
};

const meta = {
  id: "features-organizationsettings-organizationcontext",
  title: "Features/OrganizationSettings/2. セクション/グループ切り替え",
  component: OrganizationContext,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <Stack maxW="1024px" mx="auto" w="full">
        <Story />
      </Stack>
    ),
  ],
  args: {
    model: createModel([shop({})], "shop-a-1"),
    canUpdateOrganizationName: true,
    onSelectOrganization: () => {},
    onUpdateOrganizationName: () => {},
  },
} satisfies Meta<typeof OrganizationContext>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleOrganization: Story = { name: "1グループ" };

export const MultipleOrganizations: Story = {
  name: "複数グループ",
  args: { model: createModel(shops, "shop-a-1") },
};

export const LongName: Story = {
  name: "長いグループ名",
  args: {
    model: createModel(
      [
        shop({
          organizationName: "株式会社とても長い名前のフードサービスグループ東日本事業本部",
        }),
      ],
      "shop-a-1",
    ),
  },
};

export const MobileMultipleOrganizations: Story = {
  name: "複数グループ・モバイル",
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: { model: createModel(shops, "shop-a-1") },
};

export const SelectionBehavior: Story = {
  name: "グループを切り替える（操作確認）",
  parameters: { screenshot: { skip: true } },
  render: () => <SelectionBehaviorStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      canvas.getByRole("button", { name: "グループを切り替える（現在：株式会社さくらダイニング）" }),
    );
    await userEvent.click(await body.findByRole("menuitem", { name: "株式会社みどりフーズ" }));

    await expect(
      canvas.getByRole("button", { name: "グループを切り替える（現在：株式会社みどりフーズ）" }),
    ).toBeVisible();
  },
};

function SelectionBehaviorStory() {
  const [selectedShopId, setSelectedShopId] = useState("shop-a-1");

  return (
    <OrganizationContext
      model={createModel(shops, selectedShopId)}
      canUpdateOrganizationName
      onSelectOrganization={setSelectedShopId}
      onUpdateOrganizationName={() => {}}
    />
  );
}
