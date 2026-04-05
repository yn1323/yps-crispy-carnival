import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockPositions, mockShifts, mockStaffs, mockTimeRange } from "../../__mocks__/storyData";
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

export const Basic: Story = {
  args: {
    staff: mockStaffs[0],
    shift: mockShifts[0],
    positions: mockPositions,
    timeRange: mockTimeRange,
    selectedDate: "2026-01-21",
    isOpen: true,
    onOpenChange: () => {},
    onShiftUpdate: () => {},
    onShiftDelete: () => {},
  },
};

export const NewShift: Story = {
  args: {
    ...Basic.args,
    shift: undefined,
  },
};

export const UnsubmittedStaff: Story = {
  args: {
    ...Basic.args,
    staff: mockStaffs[2],
    shift: mockShifts[5],
  },
};

export const WithBreak: Story = {
  args: {
    ...Basic.args,
    shift: mockShifts[3],
    selectedDate: "2026-01-22",
  },
};
