import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { UnsubmittedStrip } from "./components";

const meta = {
  title: "Features/Shift/ShiftForm/Parts/Unsubmitted Footer",
  component: UnsubmittedStrip,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <Box w="100%" maxW="1200px" mx="auto" mt={8}>
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof UnsubmittedStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleNames = ["田中次郎", "小林大輔", "佐藤花子"];
const scheduledStatus = {
  kind: "scheduled" as const,
  label: "提出締切の前日17:00に未提出者へ自動で催促します",
};
const sentStatus = {
  kind: "sent" as const,
  label: "5/5(月) 14:30 催促通知済み",
};
const noneStatus = {
  kind: "none" as const,
  label: "自動催促の送信予定はありません",
};

export const Variants: Story = {
  name: "Variants",
  args: { names: sampleNames, reminderStatus: scheduledStatus },
  render: () => (
    <Box display="flex" flexDirection="column" gap={6}>
      <Box>
        <Box fontSize="xs" color="gray.500" mb={1} px={5}>
          送信予定あり
        </Box>
        <UnsubmittedStrip names={sampleNames} reminderStatus={scheduledStatus} onOpenDetails={() => {}} />
      </Box>
      <Box>
        <Box fontSize="xs" color="gray.500" mb={1} px={5}>
          送信済み
        </Box>
        <UnsubmittedStrip names={sampleNames} reminderStatus={sentStatus} onOpenDetails={() => {}} />
      </Box>
      <Box>
        <Box fontSize="xs" color="gray.500" mb={1} px={5}>
          送信予定なし
        </Box>
        <UnsubmittedStrip names={sampleNames} reminderStatus={noneStatus} onOpenDetails={() => {}} />
      </Box>
      <Box>
        <Box fontSize="xs" color="gray.500" mb={1} px={5}>
          1名のみ
        </Box>
        <UnsubmittedStrip names={["田中次郎"]} reminderStatus={scheduledStatus} onOpenDetails={() => {}} />
      </Box>
      <Box>
        <Box fontSize="xs" color="gray.500" mb={1} px={5}>
          多数（横スクロール）
        </Box>
        <UnsubmittedStrip
          names={[
            "田中次郎",
            "小林大輔",
            "佐藤花子",
            "山田太郎",
            "鈴木一郎",
            "高橋健太",
            "中村真理",
            "渡辺優子",
            "伊藤健一",
            "加藤美穂",
          ]}
          reminderStatus={scheduledStatus}
          onOpenDetails={() => {}}
        />
      </Box>
    </Box>
  ),
};
