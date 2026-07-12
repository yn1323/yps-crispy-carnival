import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { DemoLauncherFab } from "./DemoLauncherFab";

const meta = {
  title: "Features/Demo/DemoShiftBoardPage/DemoLauncherFab",
  component: DemoLauncherFab,
  parameters: { layout: "fullscreen" },
  args: {
    onStart: () => {},
    onDismiss: () => {},
  },
  decorators: [
    (Story) => (
      <Box position="relative" w="100vw" h="100dvh" bg="gray.50">
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof DemoLauncherFab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole("button", { name: "操作デモを開始" })).toBeInTheDocument();
    await expect(canvas.queryByText("はじめての方はこちら")).not.toBeInTheDocument();
  },
};
