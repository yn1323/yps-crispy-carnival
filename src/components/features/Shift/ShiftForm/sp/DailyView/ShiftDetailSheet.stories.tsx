import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { mockShifts, mockShiftsAllPatterns, mockStaffs } from "../../stories/fixtures";
import { ShiftDetailSheet } from "./ShiftDetailSheet";

const meta = {
  title: "Features/Shift/ShiftForm/Time/SP/Sheets/Shift Detail Sheet",
  component: ShiftDetailSheet,
  tags: ["vrt-mobile2"],
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

export const FooterCloseBehavior: Story = {
  args: baseArgs,
  tags: [],
  parameters: { screenshot: { skip: true } },
  render: () => <FooterCloseHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "シフト詳細を開く" });
    await userEvent.click(trigger);

    const dialog = await body.findByRole("dialog", { name: /のシフト/ });
    const closeButtons = within(dialog).getAllByRole("button", { name: "閉じる" });
    await expect(closeButtons).toHaveLength(2);
    await userEvent.click(closeButtons[closeButtons.length - 1]);

    await waitFor(() => expect(body.queryByRole("dialog", { name: /のシフト/ })).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
  },
};

const FooterCloseHarness = () => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        シフト詳細を開く
      </button>
      <ShiftDetailSheet {...baseArgs} isOpen={isOpen} onOpenChange={({ open }) => setIsOpen(open)} />
    </>
  );
};
