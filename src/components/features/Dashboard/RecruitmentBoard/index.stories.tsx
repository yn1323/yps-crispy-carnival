import { Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockCurrentRecruitments, mockRecruitments } from "@/src/components/features/Dashboard/storyMocks";
import { buildDashboardRecruitmentList } from "@/src/components/features/Dashboard/types";
import { RecruitmentBoard, RecruitmentBoardSkeleton } from ".";

const noop = () => {};
const dashboardRecruitments = buildDashboardRecruitmentList({
  currentRecruitments: mockCurrentRecruitments,
  recruitments: mockRecruitments,
});

const meta = {
  title: "Features/Dashboard/RecruitmentBoard",
  component: RecruitmentBoard,
  parameters: {
    layout: "padded",
  },
  args: {
    recruitments: dashboardRecruitments.slice(0, 3),
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

export const WithoutCurrentShift: Story = {
  args: {
    recruitments: mockRecruitments.slice(0, 3),
  },
};

export const CanLoadMore: Story = {
  args: {
    recruitments: dashboardRecruitments.slice(0, 3),
    status: "CanLoadMore",
    canLoadMore: true,
  },
};

export const Empty: Story = {
  args: {
    recruitments: [],
  },
};

export const OnlyCurrentShift: Story = {
  args: {
    recruitments: mockCurrentRecruitments,
  },
};

export const Loading: Story = {
  render: () => <RecruitmentBoardSkeleton />,
};
