import { Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockStaffs, mockStaffsMany } from "@/src/components/features/Dashboard/storyMocks";
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
    onEdit: noop,
    onDelete: noop,
    onShowLineQr: noop,
    onSendLineInvite: noop,
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

export const Empty: Story = {
  args: {
    staffs: [],
  },
};

export const Loading: Story = {
  render: () => <StaffRosterSkeleton />,
};
