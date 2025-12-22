import { Box, Text, VStack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { withDummyRouter } from "../../../../.storybook/withDummyRouter";
import { BottomMenu } from "./index";

const mockShops = [
  { _id: "shop1", shopName: "本店" },
  { _id: "shop2", shopName: "駅前店" },
  { _id: "shop3", shopName: "ショッピングモール店" },
];

const meta = {
  title: "templates/BottomMenu",
  component: BottomMenu,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [withDummyRouter("/")],
  args: {
    shops: mockShops,
    selectedShopId: "shop1",
    onShopChange: (shop) => console.log("Selected:", shop),
  },
} satisfies Meta<typeof BottomMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

export const NoShopSelected: Story = {
  args: {
    selectedShopId: null,
  },
};

export const WithLongContent: Story = {
  decorators: [
    (Story) => (
      <Box>
        <Box pb="80px">
          <VStack gap={4} p={4} align="stretch">
            <Text fontSize="2xl" fontWeight="bold">
              縦長コンテンツのテスト
            </Text>
            {Array.from({ length: 50 }, (_, i) => (
              <Box key={i} p={4} bg="gray.100" borderRadius="md">
                <Text fontWeight="semibold">コンテンツ {i + 1}</Text>
                <Text fontSize="sm" color="gray.600">
                  これはテスト用の縦長コンテンツです。一番下までスクロールして、BottomMenuの背後にコンテンツが隠れないか確認してください。
                </Text>
              </Box>
            ))}
          </VStack>
        </Box>
        <Story />
      </Box>
    ),
  ],
};
