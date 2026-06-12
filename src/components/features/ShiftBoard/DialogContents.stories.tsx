import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConfirmShiftContent } from "./ConfirmShiftContent";
import { RemindUnsubmittedContent } from "./RemindUnsubmittedContent";
import { UnsavedChangesContent } from "./UnsavedChangesContent";

const meta = {
  title: "Features/ShiftBoard/DialogContents",
  component: ConfirmShiftContent,
  parameters: {
    layout: "padded",
  },
  args: {
    staffCount: 10,
    periodLabel: "1/20(月)〜1/26(日)",
  },
  decorators: [
    (Story) => (
      <Box bg="white" borderWidth="1px" borderColor="border.muted" borderRadius="lg" p={4} maxW="480px">
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof ConfirmShiftContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConfirmShift: Story = {};

export const RemindUnsubmittedSingle: Story = {
  render: () => <RemindUnsubmittedContent deadline="5/10(土) 23:59" unsubmittedNames={["田中次郎"]} />,
};

export const RemindUnsubmittedStandard: Story = {
  render: () => (
    <RemindUnsubmittedContent deadline="5/10(土) 23:59" unsubmittedNames={["田中次郎", "小林大輔", "佐藤花子"]} />
  ),
};

export const UnsavedChanges: Story = {
  render: () => <UnsavedChangesContent />,
};

export const RemindUnsubmittedMany: Story = {
  render: () => (
    <RemindUnsubmittedContent
      deadline="5/10(土) 23:59"
      unsubmittedNames={[
        "田中次郎",
        "小林大輔",
        "佐藤花子",
        "山田太郎",
        "鈴木一郎",
        "高橋健太",
        "中村真理",
        "渡辺優子",
      ]}
    />
  ),
};
