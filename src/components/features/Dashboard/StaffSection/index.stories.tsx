import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockStaffs, mockStaffsMany } from "../storyMocks";
import { StaffSection } from "./index";

const meta = {
  title: "Features/Dashboard/StaffSection",
  component: StaffSection,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof StaffSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = {
  args: {
    staffs: mockStaffs,
    onAddClick: () => {},
    onEdit: () => {},
    onDelete: () => {},
    status: "Exhausted",
    onLoadMore: () => {},
  },
};

export const CanLoadMore: Story = {
  args: {
    staffs: mockStaffsMany,
    onAddClick: () => {},
    onEdit: () => {},
    onDelete: () => {},
    status: "CanLoadMore",
    onLoadMore: () => {},
  },
};

export const EmptyState: Story = {
  args: {
    staffs: [],
    onAddClick: () => {},
    onEdit: () => {},
    onDelete: () => {},
    status: "Exhausted",
    onLoadMore: () => {},
  },
};
