import { Box, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SubmitPageLayout } from "./index";

const meta = {
  title: "features/StaffSubmit/SubmitPageLayout",
  component: SubmitPageLayout,
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof SubmitPageLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    children: (
      <Box bg="teal.600" px={4} py={4}>
        <Text color="white" fontWeight="bold">
          SubmitPageLayout
        </Text>
      </Box>
    ),
  },
};
