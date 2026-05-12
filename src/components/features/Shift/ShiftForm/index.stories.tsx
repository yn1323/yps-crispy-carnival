import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm } from ".";
import {
  mockDates,
  mockDatesMidWeekStart,
  mockHalfHourTimeRange,
  mockHolidays,
  mockPositions,
  mockShifts,
  mockShiftsAllPatterns,
  mockShiftsHalfHourBusinessHours,
  mockStaffs,
  mockTimeRange,
} from "./__mocks__/storyData";

const baseArgs = {
  shopId: "shop1",
  staffs: mockStaffs,
  positions: mockPositions,
  initialShifts: mockShifts,
  dates: mockDates,
  timeRange: mockTimeRange,
  holidays: [],
};

const allPatternsArgs = {
  ...baseArgs,
  dates: ["2026-01-23"],
  initialShifts: mockShiftsAllPatterns,
};

const halfHourBusinessHoursArgs = {
  ...baseArgs,
  dates: ["2026-01-28"],
  initialShifts: mockShiftsHalfHourBusinessHours,
  timeRange: mockHalfHourTimeRange,
};

const emptyOrAllUnsubmittedArgs = {
  ...baseArgs,
  dates: ["2026-02-01"],
  staffs: mockStaffs.map((staff) => ({ ...staff, isSubmitted: false })),
  initialShifts: [],
};

const overviewCalendarRangeArgs = {
  ...baseArgs,
  dates: mockDatesMidWeekStart,
  holidays: mockHolidays,
  initialViewMode: "overview" as const,
};

const mobileGlobals = {
  viewport: { value: "mobile2", isRotated: false },
};

const meta = {
  title: "Features/Shift/ShiftForm",
  component: ShiftForm,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PCDaily_AllPatterns: Story = {
  args: allPatternsArgs,
};

export const PCDaily_HalfHourBusinessHours: Story = {
  args: halfHourBusinessHoursArgs,
};

export const PCDaily_EmptyOrAllUnsubmitted: Story = {
  args: emptyOrAllUnsubmittedArgs,
};

export const PCDaily_ReadOnly: Story = {
  args: { ...allPatternsArgs, isReadOnly: true, currentStaffId: "staff1" },
};

export const PCDaily_Confirmed: Story = {
  args: { ...allPatternsArgs, isConfirmed: true },
};

export const PCOverview_CalendarRange: Story = {
  args: overviewCalendarRangeArgs,
};

export const PCOverview_ReadOnly: Story = {
  args: { ...overviewCalendarRangeArgs, isReadOnly: true, currentStaffId: "staff1" },
};

export const SPDaily_AllPatterns: Story = {
  args: allPatternsArgs,
  globals: mobileGlobals,
};

export const SPDaily_HalfHourBusinessHours: Story = {
  args: halfHourBusinessHoursArgs,
  globals: mobileGlobals,
};

export const SPDaily_EmptyOrAllUnsubmitted: Story = {
  args: emptyOrAllUnsubmittedArgs,
  globals: mobileGlobals,
};

export const SPDaily_ReadOnly: Story = {
  args: { ...allPatternsArgs, isReadOnly: true, currentStaffId: "staff1" },
  globals: mobileGlobals,
};

export const SPDaily_Confirmed: Story = {
  args: { ...allPatternsArgs, isConfirmed: true },
  globals: mobileGlobals,
};

export const SPOverview_CalendarRange: Story = {
  args: overviewCalendarRangeArgs,
  globals: mobileGlobals,
};

export const SPOverview_ReadOnly: Story = {
  args: { ...overviewCalendarRangeArgs, isReadOnly: true, currentStaffId: "staff1" },
  globals: mobileGlobals,
};
