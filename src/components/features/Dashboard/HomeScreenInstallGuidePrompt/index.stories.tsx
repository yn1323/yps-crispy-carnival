import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { HomeScreenInstallGuidePromptView } from ".";

const meta = {
  title: "Features/Dashboard/HomeScreenInstallGuidePrompt",
  component: HomeScreenInstallGuidePromptView,
  args: { onDismiss: fn() },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <Box minH="100vh" bg="white" p={4}>
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof HomeScreenInstallGuidePromptView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MobileBrowser: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};
