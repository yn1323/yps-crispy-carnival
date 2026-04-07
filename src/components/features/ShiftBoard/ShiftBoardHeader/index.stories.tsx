import { Flex, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftBoardHeader } from "./index";

const meta = {
  title: "Features/ShiftBoard/ShiftBoardHeader",
  component: ShiftBoardHeader,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ShiftBoardHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

const AllVariants = () => (
  <Flex direction="column" gap={4}>
    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" px={4} pt={4}>
      未確定
    </Text>
    <ShiftBoardHeader
      periodLabel="1/20(月)〜1/26(日) のシフト"
      confirmedAt={null}
      onConfirm={() => {}}
      viewMode="daily"
      onViewModeChange={() => {}}
    />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" px={4} mt={2}>
      確定済み
    </Text>
    <ShiftBoardHeader
      periodLabel="1/20(月)〜1/26(日) のシフト"
      confirmedAt={new Date("2026-03-28T23:15:00")}
      onConfirm={() => {}}
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
    viewMode: "daily",
    onViewModeChange: () => {},
  },
};
