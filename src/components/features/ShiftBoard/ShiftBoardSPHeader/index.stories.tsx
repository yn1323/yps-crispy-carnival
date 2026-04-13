import { Flex, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftBoardSPHeader } from "./index";

const meta = {
  title: "Features/ShiftBoard/ShiftBoardSPHeader",
  component: ShiftBoardSPHeader,
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof ShiftBoardSPHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

const AllVariants = () => (
  <Flex direction="column" gap={4}>
    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" px={4} pt={4}>
      未確定
    </Text>
    <ShiftBoardSPHeader
      periodLabel="1/20(月)〜1/26(日) のシフト"
      confirmedAt={null}
      onConfirm={() => {}}
      onSaveDraft={() => {}}
      viewMode="daily"
      onViewModeChange={() => {}}
    />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" px={4} mt={2}>
      確定済み
    </Text>
    <ShiftBoardSPHeader
      periodLabel="1/20(月)〜1/26(日) のシフト"
      confirmedAt={new Date("2026-03-28T23:15:00")}
      onConfirm={() => {}}
      onSaveDraft={() => {}}
      viewMode="overview"
      onViewModeChange={() => {}}
    />
  </Flex>
);

export const Variants: Story = {
  render: () => <AllVariants />,
  args: {
    periodLabel: "1/20(月)〜1/26(日) のシフト",
    confirmedAt: null,
    onConfirm: () => {},
    onSaveDraft: () => {},
    viewMode: "daily",
    onViewModeChange: () => {},
  },
};
