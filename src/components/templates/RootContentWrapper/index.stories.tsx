import { Box, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { RootContentWrapper } from "./index";

const meta = {
  title: "Templates/RootContentWrapper",
  component: RootContentWrapper,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof RootContentWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    children: (
      <>
        <Box bg="gray.100" p={4} borderRadius="md">
          <Text>セクション1</Text>
        </Box>
        <Box bg="gray.100" p={4} borderRadius="md">
          <Text>セクション2</Text>
        </Box>
      </>
    ),
  },
};
