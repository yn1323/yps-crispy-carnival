import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockPositions, mockShifts, mockShiftsAllPatterns, mockStaffs, mockTimeRange } from "../../__mocks__/storyData";
import { ShiftEditSheet } from "./ShiftEditSheet";

const meta = {
  title: "Features/Shift/ShiftForm/SP/ShiftEditSheet",
  component: ShiftEditSheet,
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof ShiftEditSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

const staffWithBreak = mockStaffs.find((staff) => staff.id === "staff4") ?? mockStaffs[0];
const shiftWithBreak = mockShiftsAllPatterns.find((shift) => shift.staffId === staffWithBreak.id) ?? mockShifts[0];
const unsubmittedStaff = mockStaffs.find((staff) => !staff.isSubmitted) ?? mockStaffs[0];
const unsubmittedShift = {
  ...shiftWithBreak,
  id: "edit-sheet-unsubmitted-shift",
  staffId: unsubmittedStaff.id,
  staffName: unsubmittedStaff.name,
  requestedTime: null,
};

const baseArgs = {
  staff: unsubmittedStaff,
  shift: unsubmittedShift,
  positions: mockPositions,
  timeRange: mockTimeRange,
  selectedDate: "2026-01-23",
  isOpen: true,
  onOpenChange: () => {},
  onShiftUpdate: () => {},
  onShiftDelete: () => {},
};

export const Variants: Story = {
  args: {
    ...baseArgs,
  },
};

export const NewShift: Story = {
  args: {
    ...baseArgs,
    shift: undefined,
  },
  parameters: {
    chromatic: { disableSnapshot: true },
  },
};

export const UnsubmittedStaff: Story = {
  args: {
    ...baseArgs,
  },
  parameters: {
    chromatic: { disableSnapshot: true },
  },
};

export const WithBreak: Story = {
  args: {
    ...baseArgs,
    staff: staffWithBreak,
    shift: shiftWithBreak,
  },
  parameters: {
    chromatic: { disableSnapshot: true },
  },
};
