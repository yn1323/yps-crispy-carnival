import { Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockRecruitments } from "@/src/components/features/Dashboard/storyMocks";
import { RecruitmentBoard, RecruitmentBoardSkeleton } from ".";

const noop = () => {};

const meta = {
  title: "Features/Dashboard/RecruitmentBoard",
  component: RecruitmentBoard,
  parameters: {
    layout: "padded",
  },
  args: {
    recruitments: mockRecruitments,
    status: "Exhausted",
    canLoadMore: false,
    onCreateClick: noop,
    onOpenShiftBoard: noop,
    onDeleteRecruitment: noop,
    onLoadMore: noop,
  },
  decorators: [
    (Story) => (
      <Stack maxW="720px" mx="auto" w="full">
        <Story />
      </Stack>
    ),
  ],
} satisfies Meta<typeof RecruitmentBoard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CanLoadMore: Story = {
  args: {
    recruitments: mockRecruitments.slice(0, 2),
    status: "CanLoadMore",
    canLoadMore: true,
  },
};

export const Empty: Story = {
  args: {
    recruitments: [],
  },
};

export const Loading: Story = {
  render: () => <RecruitmentBoardSkeleton />,
};
