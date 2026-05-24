import type { Decorator } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import type { ShiftForm } from "..";
import {
  mockDateOnlyDates,
  mockDateOnlyShifts,
  mockDateOnlyStaffs,
  mockDates,
  mockDatesMidWeekStart,
  mockHalfHourTimeRange,
  mockHolidays,
  mockPositions,
  mockShifts,
  mockShiftsAllPatterns,
  mockShiftsHalfHourBusinessHours,
  mockShiftTypeDates,
  mockShiftTypePattern,
  mockShiftTypeShifts,
  mockShiftTypeStaffs,
  mockStaffs,
  mockTimeRange,
} from "../__mocks__/storyData";

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

export const fullscreenParameters = {
  layout: "fullscreen",
};

export const shiftFormDecorators = [
  (Story) => (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
      <Story />
    </div>
  ),
] satisfies Decorator[];

export const mobileGlobals = {
  viewport: { value: "mobile2", isRotated: false },
};

export const desktopGlobals = {
  viewport: { value: "desktop", isRotated: false },
};

const baseArgs = {
  shopId: "shop1",
  staffs: mockStaffs,
  positions: mockPositions,
  initialShifts: mockShifts,
  dates: mockDates,
  timeRange: mockTimeRange,
  holidays: [],
} satisfies ShiftFormArgs;

export const allPatternsArgs = {
  ...baseArgs,
  dates: ["2026-01-23"],
  initialShifts: mockShiftsAllPatterns,
} satisfies ShiftFormArgs;

export const halfHourBusinessHoursArgs = {
  ...baseArgs,
  dates: ["2026-01-28"],
  initialShifts: mockShiftsHalfHourBusinessHours,
  timeRange: mockHalfHourTimeRange,
} satisfies ShiftFormArgs;

export const emptyOrAllUnsubmittedArgs = {
  ...baseArgs,
  dates: ["2026-02-01"],
  staffs: mockStaffs.map((staff) => ({ ...staff, isSubmitted: false })),
  initialShifts: [],
} satisfies ShiftFormArgs;

export const overviewCalendarRangeArgs = {
  ...baseArgs,
  dates: mockDatesMidWeekStart,
  holidays: mockHolidays,
  initialViewMode: "overview" as const,
} satisfies ShiftFormArgs;

export const shiftTypeArgs = {
  ...baseArgs,
  staffs: mockShiftTypeStaffs,
  dates: mockShiftTypeDates,
  initialShifts: mockShiftTypeShifts,
  submissionPattern: mockShiftTypePattern,
} satisfies ShiftFormArgs;

export const dateOnlyArgs = {
  ...baseArgs,
  staffs: mockDateOnlyStaffs,
  dates: mockDateOnlyDates,
  initialShifts: mockDateOnlyShifts,
  holidays: ["2026-06-07"],
  submissionPattern: { kind: "dateOnly" },
} satisfies ShiftFormArgs;
