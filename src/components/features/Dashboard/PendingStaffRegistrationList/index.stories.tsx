import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PendingStaffRegistrationList } from "./index";

const meta = {
  title: "Features/Dashboard/PendingStaffRegistrationList",
  component: PendingStaffRegistrationList,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <Box w="720px" maxW="calc(100vw - 32px)">
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof PendingStaffRegistrationList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwoRequests: Story = {
  args: {
    requests: [
      {
        _id: "req-1",
        name: "田中 花子",
        email: "hanako@example.com",
        createdAt: Date.now(),
      },
      {
        _id: "req-2",
        name: "佐藤 太郎",
        email: "sato.long-address@example.com",
        createdAt: Date.now(),
      },
    ] as never,
    onApprove: () => {},
    onReject: () => {},
  },
};
