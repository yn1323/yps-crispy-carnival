import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockStaffs } from "../storyMocks";
import { StaffListItem } from "./index";

const meta = {
  title: "Features/Dashboard/StaffListItem",
  component: StaffListItem,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <Box border="1px solid" borderColor="gray.200" borderRadius="lg" overflow="hidden">
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof StaffListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Admin: Story = {
  args: {
    staff: mockStaffs[0],
  },
};

export const Staff: Story = {
  args: {
    staff: mockStaffs[1],
  },
};
