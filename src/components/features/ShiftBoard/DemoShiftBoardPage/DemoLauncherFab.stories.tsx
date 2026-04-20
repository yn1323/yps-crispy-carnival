import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DemoLauncherFab } from "./DemoLauncherFab";

const meta = {
  title: "Features/ShiftBoard/DemoShiftBoardPage/DemoLauncherFab",
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

export const Default: Story = {};
