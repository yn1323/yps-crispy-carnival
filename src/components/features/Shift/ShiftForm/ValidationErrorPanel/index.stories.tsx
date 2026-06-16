import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { DisplayIssue } from "@/src/domains/shift/assignmentIssues";
import { ValidationErrorPanel } from ".";

const meta = {
  title: "Features/Shift/ShiftForm/Parts/Validation Error Panel",
  component: ValidationErrorPanel,
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
} satisfies Meta<typeof ValidationErrorPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const issue = (key: string, date: string, staffId: string, label: string): DisplayIssue => ({
  key,
  code: key.split("-").at(-1) ?? "UNKNOWN",
  date,
  staffId,
  label,
});

const sampleIssues = [
  issue("staff1-2026-01-21-CLOSED_DAY", "2026-01-21", "staff1", "1/21(水) 鈴木太郎：定休日にはシフトを登録できません"),
  issue(
    "staff2-2026-01-22-OVERLAP",
    "2026-01-22",
    "staff2",
    "1/22(木) 佐藤花子：同じスタッフの同じ日に、シフト時間が重なっています",
  ),
  issue(
    "staff1-2026-01-23-OUT_OF_BOARD_RANGE",
    "2026-01-23",
    "staff1",
    "1/23(金) 鈴木太郎：設定したシフト時間内にしてください",
  ),
];

const manyIssues = Array.from({ length: 12 }, (_, i) =>
  issue(
    `staff${i}-2026-01-2${i % 7}-OVERLAP`,
    `2026-01-2${i % 7}`,
    `staff${i}`,
    `1/2${i % 7}(月) スタッフ${i + 1}：同じスタッフの同じ日に、シフト時間が重なっています`,
  ),
);

const baseArgs = {
  issues: sampleIssues,
  onSelectIssue: () => {},
  onDismiss: () => {},
};

export const SingleIssue: Story = {
  args: {
    ...baseArgs,
    issues: sampleIssues.slice(0, 1),
  },
};

export const MultipleIssues: Story = {
  args: baseArgs,
};

export const ManyIssuesScrollable: Story = {
  args: {
    ...baseArgs,
    issues: manyIssues,
  },
};

export const LongMessage: Story = {
  args: {
    ...baseArgs,
    issues: [
      issue(
        "staff1-2026-01-21-LONG",
        "2026-01-21",
        "staff1",
        "1/21(水) とてもとても長い名前のスタッフさんの場合の表示確認：同じスタッフの同じ日に、シフト時間が重なっています",
      ),
    ],
  },
};

export const WithoutDismiss: Story = {
  args: {
    issues: sampleIssues,
    onSelectIssue: () => {},
  },
};

export const SPCompact: Story = {
  tags: ["vrt-mobile1"],
  args: {
    ...baseArgs,
    compact: true,
  },
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
};

export const SPCompactExpanded: Story = {
  tags: ["vrt-mobile1"],
  args: {
    ...baseArgs,
    compact: true,
  },
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  play: async ({ canvasElement }) => {
    const toggle = canvasElement.querySelector<HTMLButtonElement>("button[aria-expanded]");
    toggle?.click();
  },
};
