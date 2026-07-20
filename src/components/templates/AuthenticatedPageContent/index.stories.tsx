import { Box, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AuthenticatedPageContent } from ".";

const meta = {
  title: "templates/AuthenticatedPageContent",
  component: AuthenticatedPageContent,
  parameters: { layout: "fullscreen" },
  args: {
    children: (
      <Box borderWidth="1px" borderRadius="xl" bg="white" p={5}>
        <Text>認証済み画面のコンテンツ</Text>
      </Box>
    ),
  },
} satisfies Meta<typeof AuthenticatedPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
