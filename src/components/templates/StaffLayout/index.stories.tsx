import { Box, Text, VStack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/src/components/ui/Button";
import { StaffCenteredContent, StaffLayout, StaffNarrowContent, StaffPageContent } from "./index";

const meta = {
  title: "templates/StaffLayout",
  component: StaffLayout,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof StaffLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StandardWidth: Story = {
  args: {
    shopName: "居酒屋もりもり",
    children: null,
  },
  render: () => (
    <StaffLayout shopName="居酒屋もりもり">
      <StaffPageContent py={4}>
        <Box bg="gray.100" borderRadius="md" px={4} py={3}>
          <Text fontSize="sm" fontWeight="semibold">
            標準コンテンツ幅
          </Text>
        </Box>
      </StaffPageContent>
    </StaffLayout>
  ),
};

export const NarrowWidth: Story = {
  args: {
    shopName: "居酒屋もりもり",
    children: null,
  },
  render: () => (
    <StaffLayout shopName="居酒屋もりもり">
      <StaffNarrowContent py={4}>
        <VStack align="stretch" gap={4}>
          <Text fontSize="md" fontWeight="semibold">
            シフト閲覧リンクの再発行
          </Text>
          <Button colorPalette="teal">リンクを送信する</Button>
        </VStack>
      </StaffNarrowContent>
    </StaffLayout>
  ),
};

export const CenteredState: Story = {
  args: {
    shopName: "シフト閲覧",
    children: null,
  },
  render: () => (
    <StaffLayout shopName="シフト閲覧">
      <StaffCenteredContent>
        <VStack gap={3}>
          <Text fontSize="lg" fontWeight="semibold">
            リンクを再発行しました
          </Text>
          <Text fontSize="sm" color="fg.muted" textAlign="center">
            このページは閉じて大丈夫です。
          </Text>
        </VStack>
      </StaffCenteredContent>
    </StaffLayout>
  ),
};
