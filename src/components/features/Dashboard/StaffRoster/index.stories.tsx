import { Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  mockStaffs,
  mockStaffsMany,
  mockStaffsWithExcluded,
} from "@/src/components/features/Dashboard/stories/fixtures";
import { StaffRoster, StaffRosterSkeleton } from ".";

const noop = () => {};

const meta = {
  title: "Features/Dashboard/StaffRoster",
  component: StaffRoster,
  parameters: {
    layout: "padded",
  },
  args: {
    staffs: mockStaffs,
    status: "Exhausted",
    canLoadMore: false,
    onAddClick: noop,
    onOpenDetail: noop,
    onLoadMore: noop,
  },
  decorators: [
    (Story) => (
      <Stack maxW="720px" mx="auto" w="full">
        <Story />
      </Stack>
    ),
  ],
} satisfies Meta<typeof StaffRoster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CanLoadMore: Story = {
  args: {
    staffs: mockStaffsMany,
    status: "CanLoadMore",
    canLoadMore: true,
  },
};

export const WithExcluded: Story = {
  args: {
    staffs: mockStaffsWithExcluded,
  },
};

export const LongNameWithAllBadgesMobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: {
    staffs: [
      {
        ...mockStaffs[0],
        name: "東日本エリア統括マネージャー 田中花子",
        isManager: true,
        isLineLinked: true,
        isLineFollowing: true,
        excludedFromShift: true,
      },
    ],
  },
};

export const Empty: Story = {
  args: {
    staffs: [],
  },
};

export const Loading: Story = {
  render: () => <StaffRosterSkeleton />,
};
