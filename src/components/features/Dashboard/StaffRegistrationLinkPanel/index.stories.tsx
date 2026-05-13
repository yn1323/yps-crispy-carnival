import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { StaffRegistrationLinkPanel } from "./index";

const meta = {
  title: "Features/Dashboard/StaffRegistrationLinkPanel",
  component: StaffRegistrationLinkPanel,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <Box w="520px" maxW="calc(100vw - 32px)">
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof StaffRegistrationLinkPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    registrationUrl: "https://shiftori.app/staff/register?token=preview-token",
  },
};

export const Loading: Story = {
  args: {
    registrationUrl: null,
    isLoading: true,
  },
};
