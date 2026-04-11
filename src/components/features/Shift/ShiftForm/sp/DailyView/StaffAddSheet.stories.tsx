import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockShifts, mockStaffs } from "../../__mocks__/storyData";
import { StaffAddSheet } from "./StaffAddSheet";

const meta = {
  title: "Features/Shift/ShiftForm/SP/StaffAddSheet",
  component: StaffAddSheet,
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof StaffAddSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    staffs: mockStaffs,
    shifts: mockShifts,
    selectedDate: "2026-01-21",
    isOpen: true,
    onOpenChange: () => {},
    onSelectStaff: () => {},
  },
};

export const Empty: Story = {
  args: {
    ...Basic.args,
    staffs: [],
  },
};
