import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockShifts, mockStaffs } from "../../__mocks__/storyData";
import { ShiftDetailSheet } from "./ShiftDetailSheet";

const meta = {
  title: "Features/Shift/ShiftForm/SP/ShiftDetailSheet",
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

export const Basic: Story = {
  args: {
    staff: mockStaffs[0],
    shift: mockShifts[0],
    selectedDate: "2026-01-21",
    isOpen: true,
    onOpenChange: () => {},
  },
};

export const NoPositions: Story = {
  args: {
    ...Basic.args,
    shift: {
      ...mockShifts[0],
      positions: [],
    },
  },
};

export const UnsubmittedStaff: Story = {
  args: {
    ...Basic.args,
    staff: mockStaffs[2],
    shift: mockShifts[5],
  },
};
