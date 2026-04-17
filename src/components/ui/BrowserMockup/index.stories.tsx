import { Flex, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrowserMockup } from ".";

const meta = {
  title: "UI/BrowserMockup",
  component: BrowserMockup,
  parameters: {
    layout: "padded",
  },
  args: {
    src: "/lp/shiftForm.webp",
    alt: "シフトリの画面サンプル",
  },
} satisfies Meta<typeof BrowserMockup>;
export default meta;

const AllVariants = () => (
  <Flex direction="column" gap={8} p={4}>
    <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
      デフォルト
    </Text>
    <BrowserMockup src="/lp/shiftForm.webp" alt="シフトリの画面サンプル" />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      URL カスタム
    </Text>
    <BrowserMockup src="/lp/shiftForm.webp" alt="シフトリの画面サンプル" url="example.com/shift" />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      最大幅指定（PC想定・1000px）
    </Text>
    <BrowserMockup src="/lp/shiftForm.webp" alt="シフトリの画面サンプル" maxW="1000px" />
  </Flex>
);

export const Variants: StoryObj<typeof meta> = {
  render: () => <AllVariants />,
};
