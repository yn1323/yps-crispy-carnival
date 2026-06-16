import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Dialog } from "@/src/components/ui/Dialog";
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

const warnings = [
  {
    key: "staff1-2026-01-21-OFF_REQUEST",
    code: "OFF_REQUEST",
    date: "2026-01-21",
    staffId: "staff1",
    label: "1/21(水) 鈴木太郎：休み希望の日に勤務が入っています",
  },
  {
    key: "staff2-2026-01-22-NOT_SUBMITTED",
    code: "NOT_SUBMITTED",
    date: "2026-01-22",
    staffId: "staff2",
    label: "1/22(木) 佐藤花子：未提出のまま勤務に入っています",
  },
  {
    key: "staff3-2026-01-23-OUTSIDE_REQUESTED_TIME",
    code: "OUTSIDE_REQUESTED_TIME",
    date: "2026-01-23",
    staffId: "staff3",
    label: "1/23(金) 田中一郎：希望時間（10:00-18:00）の外に勤務があります",
  },
  {
    key: "staff4-2026-01-24-OUTSIDE_REQUESTED_TIME",
    code: "OUTSIDE_REQUESTED_TIME",
    date: "2026-01-24",
    staffId: "staff4",
    label: "1/24(土) 山田一郎：希望時間（9:00-15:00）の外に勤務があります",
  },
];

export const Default: Story = {
  args: baseArgs,
};

export const WithWarnings: Story = {
  args: {
    ...baseArgs,
    warnings,
  },
};

export const ModalWithWarnings: Story = {
  name: "Modal With Warnings",
  args: {
    ...baseArgs,
    warnings,
  },
  parameters: {
    layout: "fullscreen",
  },
  render: (args) => (
    <Dialog
      title="このシフトをスタッフに通知しますか？"
      isOpen
      onOpenChange={() => {}}
      onClose={() => {}}
      onSubmit={() => {}}
      submitLabel="シフトを確定して通知"
    >
      <ConfirmShiftContent {...args} />
    </Dialog>
  ),
};

export const SPModalWithWarnings: Story = {
  name: "SP Modal With Warnings",
  tags: ["vrt-mobile2"],
  args: {
    ...baseArgs,
    warnings,
  },
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  render: (args) => (
    <Dialog
      title="このシフトをスタッフに通知しますか？"
      isOpen
      onOpenChange={() => {}}
      onClose={() => {}}
      onSubmit={() => {}}
      submitLabel="シフトを確定して通知"
    >
      <ConfirmShiftContent {...args} />
    </Dialog>
  ),
};
