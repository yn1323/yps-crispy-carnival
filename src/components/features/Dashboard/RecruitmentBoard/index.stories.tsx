import { Stack, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockRecruitments } from "@/src/components/features/Dashboard/storyMocks";
import { RecruitmentBoard } from ".";

const meta = {
  title: "Features/Dashboard/RecruitmentBoard",
  component: RecruitmentBoard,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof RecruitmentBoard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  args: {
    recruitments: mockRecruitments,
    status: "Exhausted",
    onCreateClick: () => {},
    onOpenShiftBoard: () => {},
    onLoadMore: () => {},
  },
  render: () => (
    <Stack gap={10} maxW="720px" mx="auto" w="full">
      <Stack gap={3}>
        <Text fontSize="xs" fontWeight="semibold" color="fg.muted" letterSpacing="0.08em" textTransform="uppercase">
          データあり
        </Text>
        <RecruitmentBoard
          recruitments={mockRecruitments}
          status="Exhausted"
          onCreateClick={() => {}}
          onOpenShiftBoard={() => {}}
          onLoadMore={() => {}}
        />
      </Stack>
      <Stack gap={3}>
        <Text fontSize="xs" fontWeight="semibold" color="fg.muted" letterSpacing="0.08em" textTransform="uppercase">
          もっと見るありの状態
        </Text>
        <RecruitmentBoard
          recruitments={mockRecruitments.slice(0, 2)}
          status="CanLoadMore"
          onCreateClick={() => {}}
          onOpenShiftBoard={() => {}}
          onLoadMore={() => {}}
        />
      </Stack>
      <Stack gap={3}>
        <Text fontSize="xs" fontWeight="semibold" color="fg.muted" letterSpacing="0.08em" textTransform="uppercase">
          空の状態
        </Text>
        <RecruitmentBoard
          recruitments={[]}
          status="Exhausted"
          onCreateClick={() => {}}
          onOpenShiftBoard={() => {}}
          onLoadMore={() => {}}
        />
      </Stack>
    </Stack>
  ),
};
