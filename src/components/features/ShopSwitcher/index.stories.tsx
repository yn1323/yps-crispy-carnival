import { Flex, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import type { ShopContextOption } from "@/src/stores/shop";
import { ShopSwitcherView } from ".";

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
];

const meta = {
  title: "Features/ShopSwitcher",
  component: ShopSwitcherView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <Flex justify="flex-end" p={4} bg="gray.50">
        <Story />
      </Flex>
    ),
  ],
  args: {
    shops,
    selectedShopId: "shibuya",
    onSelect: () => {},
  },
} satisfies Meta<typeof ShopSwitcherView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MultipleOrganizations: Story = {};

export const OpenMenu: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /店舗を切り替える/ }));
    const screen = within(document.body);
    const menu = await screen.findByRole("menu");
    await expect(within(menu).getByText("株式会社さくらダイニング")).toBeInTheDocument();
    await expect(within(menu).getByText("合同会社みなと食堂")).toBeInTheDocument();
  },
};

export const PlanSuspendedAndReadOnly: Story = {
  args: { selectedShopId: "shinjuku" },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  play: OpenMenu.play,
};

const SelectionBehaviorHarness = () => {
  const [selectedShopId, setSelectedShopId] = useState("shibuya");
  const [pathname, setPathname] = useState("/shiftboard/old-recruitment");
  return (
    <Flex direction="column" align="flex-end" gap={2}>
      <Text aria-label="現在のパス" fontSize="xs">
        {pathname}
      </Text>
      <ShopSwitcherView
        shops={shops}
        selectedShopId={selectedShopId}
        onSelect={(shop) => {
          setSelectedShopId(shop.shopId);
          setPathname("/dashboard");
        }}
      />
    </Flex>
  );
};

export const SelectionBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <SelectionBehaviorHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /店舗を切り替える/ }));
    const screen = within(document.body);
    await userEvent.click(await screen.findByRole("menuitem", { name: /横浜店/ }));
    await expect(canvas.getByRole("button", { name: /合同会社みなと食堂、横浜店/ })).toBeInTheDocument();
    await expect(canvas.getByLabelText("現在のパス")).toHaveTextContent("/dashboard");
  },
};
