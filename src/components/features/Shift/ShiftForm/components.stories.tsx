import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { UnsubmittedStrip } from "./components";

const meta = {
  title: "Features/Shift/ShiftForm/UnsubmittedStrip",
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

export const Variants: Story = {
  args: { names: sampleNames },
  render: () => (
    <Box display="flex" flexDirection="column" gap={6}>
      <Box>
        <Box fontSize="xs" color="gray.500" mb={1} px={5}>
          通常（未送信）
        </Box>
        <UnsubmittedStrip names={sampleNames} onRemind={() => {}} />
      </Box>
      <Box>
        <Box fontSize="xs" color="gray.500" mb={1} px={5}>
          前回送信あり
        </Box>
        <UnsubmittedStrip names={sampleNames} onRemind={() => {}} lastSentAtLabel="5/5(月) 14:30" />
      </Box>
      <Box>
        <Box fontSize="xs" color="gray.500" mb={1} px={5}>
          送信ハンドラ未提供（disabled）
        </Box>
        <UnsubmittedStrip names={sampleNames} />
      </Box>
      <Box>
        <Box fontSize="xs" color="gray.500" mb={1} px={5}>
          1名のみ
        </Box>
        <UnsubmittedStrip names={["田中次郎"]} onRemind={() => {}} />
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
          onRemind={() => {}}
        />
      </Box>
    </Box>
  ),
};
