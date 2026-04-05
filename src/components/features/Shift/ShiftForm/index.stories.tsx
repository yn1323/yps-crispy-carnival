import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm } from ".";
import {
  mockDates,
  mockHolidays,
  mockPositions,
  mockRequiredStaffing,
  mockShifts,
  mockStaffs,
  mockTimeRange,
} from "./__mocks__/storyData";

const meta = {
  title: "Features/Shift/ShiftForm",
  component: ShiftForm,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    shopId: "shop1",
    staffs: mockStaffs,
    positions: mockPositions,
    initialShifts: mockShifts,
    dates: mockDates,
    timeRange: mockTimeRange,
    holidays: [],
  },
};

export const WithRequiredStaffing: Story = {
  args: {
    ...Basic.args,
    holidays: mockHolidays,
    requiredStaffing: mockRequiredStaffing,
  },
};

export const ReadOnly: Story = {
  args: {
    ...Basic.args,
    isReadOnly: true,
    currentStaffId: "staff1",
  },
};

export const SPDaily: Story = {
  args: Basic.args,
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

export const SPOverview: Story = {
  args: {
    ...Basic.args,
    initialViewMode: "overview",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
