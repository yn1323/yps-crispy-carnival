import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockShifts, mockShiftsAllPatterns, mockStaffs } from "../../__mocks__/storyData";
import { ShiftDetailSheet } from "./ShiftDetailSheet";

const meta = {
  title: "Features/Shift/ShiftForm/Time/SP/Sheets/Shift Detail Sheet",
  component: ShiftDetailSheet,
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof ShiftDetailSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

const staffWithBreak = mockStaffs.find((staff) => staff.id === "staff4") ?? mockStaffs[0];
const shiftWithBreak = mockShiftsAllPatterns.find((shift) => shift.staffId === staffWithBreak.id) ?? mockShifts[0];
const unsubmittedStaff = mockStaffs.find((staff) => !staff.isSubmitted) ?? mockStaffs[0];
const emptyUnsubmittedShift = {
  ...mockShifts[0],
  id: "detail-sheet-empty-unsubmitted-shift",
  staffId: unsubmittedStaff.id,
  staffName: unsubmittedStaff.name,
  requestedTime: null,
  positions: [],
};

const baseArgs = {
  staff: staffWithBreak,
  shift: shiftWithBreak,
  selectedDate: "2026-01-23",
  isOpen: true,
  onOpenChange: () => {},
};

export const WithBreak: Story = {
  args: baseArgs,
};

export const UnsubmittedStaffNoPositions: Story = {
  args: {
    ...baseArgs,
    staff: unsubmittedStaff,
    shift: emptyUnsubmittedShift,
  },
};
