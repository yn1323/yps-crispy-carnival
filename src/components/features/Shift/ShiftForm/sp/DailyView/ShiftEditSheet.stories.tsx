import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { mockPositions, mockShifts, mockShiftsAllPatterns, mockStaffs, mockTimeRange } from "../../stories/fixtures";
import { ShiftEditSheet } from "./ShiftEditSheet";

const meta = {
  title: "Features/Shift/ShiftForm/Time/SP/Sheets/Shift Edit Sheet",
  component: ShiftEditSheet,
  tags: ["vrt-mobile2"],
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
const shiftWithSingleRange = mockShiftsAllPatterns.find((shift) => shift.staffId === "staff1") ?? mockShifts[0];
const unsubmittedStaff = mockStaffs.find((staff) => !staff.isSubmitted) ?? mockStaffs[0];
const unsubmittedShift = {
  ...shiftWithSingleRange,
  id: "edit-sheet-unsubmitted-shift",
  staffId: unsubmittedStaff.id,
  staffName: unsubmittedStaff.name,
  requestedTime: null,
};

type ShiftEditSheetStoryProps = ComponentProps<typeof ShiftEditSheet>;

const ShiftEditSheetBehaviorHarness = (args: ShiftEditSheetStoryProps) => {
  const [result, setResult] = useState("未更新");

  return (
    <>
      <ShiftEditSheet
        {...args}
        onShiftUpdate={(updatedShift) => {
          args.onShiftUpdate(updatedShift);
          const ranges = updatedShift.positions.map((position) => `${position.id} ${position.start}〜${position.end}`);
          setResult(`更新結果：${updatedShift.positions.length}件 ${ranges.join(" / ")}`);
        }}
        onShiftDelete={(staffId) => {
          args.onShiftDelete(staffId);
          setResult(`削除結果：${staffId}`);
        }}
      />
      <output>{result}</output>
    </>
  );
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

export const UnsubmittedStaff: Story = {
  args: baseArgs,
};

export const NewShift: Story = {
  args: {
    ...baseArgs,
    shift: undefined,
  },
};

export const WithBreak: Story = {
  args: {
    ...baseArgs,
    staff: staffWithBreak,
    shift: shiftWithBreak,
  },
};

export const ShortenSingleRange: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  args: {
    ...baseArgs,
    staff: { id: "shortening-staff", name: "短縮テスト", isSubmitted: true },
    shift: {
      id: "shortening-shift",
      staffId: "shortening-staff",
      staffName: "短縮テスト",
      date: "2026-01-23",
      requestedTime: { start: "12:00", end: "14:00" },
      positions: [
        {
          id: "single-work",
          positionId: "position-default",
          positionName: "ホール",
          color: "#3b82f6",
          start: "12:00",
          end: "14:00",
        },
      ],
    },
  },
  render: (args) => <ShiftEditSheetBehaviorHarness {...args} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog", { name: /短縮テストのシフト/ });
    const sheet = within(dialog);

    await userEvent.click(sheet.getByRole("combobox", { name: "終了時間" }));
    await userEvent.click(await sheet.findByRole("option", { name: "13:00" }));
    await userEvent.click(sheet.getByRole("button", { name: "確定" }));

    await expect(await within(canvasElement).findByText("更新結果：1件 single-work 12:00〜13:00")).toBeInTheDocument();
  },
};

export const DeleteAllMultipleRanges: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  args: {
    ...baseArgs,
    staff: { id: "delete-multiple", name: "複数削除テスト", isSubmitted: true },
    shift: {
      ...shiftWithBreak,
      id: "delete-multiple-shift",
      staffId: "delete-multiple",
      staffName: "複数削除テスト",
    },
  },
  render: (args) => <ShiftEditSheetBehaviorHarness {...args} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog", { name: /複数削除テストのシフト/ });
    const sheet = within(dialog);

    await expect(sheet.getByRole("button", { name: "確定" })).toBeDisabled();
    await userEvent.click(sheet.getByRole("button", { name: "勤務時間を削除" }));

    await expect(await within(canvasElement).findByText("削除結果：delete-multiple")).toBeInTheDocument();
  },
};
