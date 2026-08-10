import { Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
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

export const DialogIntentBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    onAddIntent: fn(),
    onOpenDetailIntent: fn(),
    onOpenDetail: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const invitationButton = canvas.getByRole("button", { name: "スタッフを招待する" });
    const detailButton = canvas.getAllByRole("button", { name: /スタッフ詳細を開く/ })[0];

    await userEvent.hover(invitationButton);
    await expect(args.onAddIntent).toHaveBeenCalled();

    detailButton.focus();
    await expect(args.onOpenDetailIntent).toHaveBeenCalled();
    await userEvent.click(detailButton);
    await expect(args.onOpenDetail).toHaveBeenCalledTimes(1);
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
    onAddClick: fn(),
    onAddIntent: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const invitationButton = canvas.getAllByRole("button", { name: "スタッフを招待する" })[1];

    await userEvent.hover(invitationButton);
    await expect(args.onAddIntent).toHaveBeenCalled();
    await userEvent.click(invitationButton);
    await expect(args.onAddClick).toHaveBeenCalledTimes(1);
  },
};

export const Loading: Story = {
  render: () => <StaffRosterSkeleton />,
};
