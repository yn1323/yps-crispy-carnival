import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConfirmShiftContent } from ".";

const meta = {
  title: "Features/ShiftBoard/Confirm Shift Content",
  component: ConfirmShiftContent,
  decorators: [
    (Story) => (
      <Box maxW="480px" mx="auto" mt={8} p={6} borderWidth="1px" borderColor="gray.200" borderRadius="lg">
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof ConfirmShiftContent>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseArgs = {
  staffCount: 8,
  periodLabel: "1/21(水)〜1/27(火)",
};

export const Default: Story = {
  args: baseArgs,
};

export const WithWarnings: Story = {
  args: {
    ...baseArgs,
    warnings: [
      {
        key: "staff1-2026-01-21-OFF_REQUEST",
        date: "2026-01-21",
        staffId: "staff1",
        label: "1/21(水) 鈴木太郎：休み希望の日に勤務が入っています",
      },
      {
        key: "staff2-2026-01-22-NOT_SUBMITTED",
        date: "2026-01-22",
        staffId: "staff2",
        label: "1/22(木) 佐藤花子：未提出のまま勤務に入っています",
      },
      {
        key: "staff3-2026-01-23-OUTSIDE_REQUESTED_TIME",
        date: "2026-01-23",
        staffId: "staff3",
        label: "1/23(金) 田中一郎：希望時間（10:00-18:00）の外に勤務があります",
      },
    ],
  },
};
