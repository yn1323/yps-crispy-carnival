import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import {
  JotaiStoryWrapper,
  mockPositions,
  mockShifts,
  mockShiftsAllPatterns,
  mockStaffs,
  mockTimeRange,
} from "../../stories/fixtures";
import { detailPositions, timeDetailDate, timeDetailShifts, timeDetailStaffs } from "../detailStoryFixtures";
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

/** 休み希望の日に勤務を入れた状態。希望は「休み」と表示する。 */
export const DayOffRequestWithShift: Story = {
  args: {
    ...baseArgs,
    staff: mockStaffs[0],
    shift: { ...shiftWithSingleRange, requestedTime: null, requestedTimes: undefined },
  },
};

export const NewShift: Story = {
  args: {
    ...baseArgs,
    shift: undefined,
  },
};

/** 勤務が2件以上ある日は、シンプル表示でも複数行で編集する。 */
export const WithBreak: Story = {
  args: {
    ...baseArgs,
    staff: staffWithBreak,
    shift: shiftWithBreak,
  },
};

// ==========================================
// くわしく表示（ポジションの選択と休憩の欄を出す）
// ==========================================
const detailDecorators: Story["decorators"] = [
  (StoryComponent) => (
    <JotaiStoryWrapper
      overrides={{
        staffs: timeDetailStaffs,
        positions: detailPositions,
        initialShifts: timeDetailShifts,
        dates: [timeDetailDate],
        initialDetailMode: true,
      }}
    >
      <StoryComponent />
    </JotaiStoryWrapper>
  ),
];

const detailShiftOf = (staffId: string) =>
  timeDetailShifts.find((shift) => shift.staffId === staffId && shift.date === timeDetailDate);
const detailStaffOf = (staffId: string) =>
  timeDetailStaffs.find((staff) => staff.id === staffId) ?? timeDetailStaffs[0];

const detailArgs = {
  ...baseArgs,
  positions: detailPositions,
  selectedDate: timeDetailDate,
  onEditBreaks: () => {},
};

/** 勤務が1件。行ごとにポジションを選び、同じシートで休憩を確かめられる。 */
export const DetailSingleRange: Story = {
  name: "Detail Single Range",
  args: { ...detailArgs, staff: detailStaffOf("staff2"), shift: detailShiftOf("staff2") },
  decorators: detailDecorators,
};

/** 勤務が複数件。途中でポジションが変わる日。 */
export const DetailMultipleRanges: Story = {
  name: "Detail Multiple Ranges",
  args: { ...detailArgs, staff: detailStaffOf("staff1"), shift: detailShiftOf("staff1") },
  decorators: detailDecorators,
};

/** 勤務がない日。時刻を入れるまで、休憩の欄は出さない。 */
export const DetailNewShift: Story = {
  name: "Detail New Shift",
  args: { ...detailArgs, staff: detailStaffOf("staff5"), shift: undefined },
  decorators: detailDecorators,
};

/** 重なる勤務時間は保存できず、文言で伝える。 */
export const DetailOverlapError: Story = {
  name: "Detail Overlap Error",
  args: {
    ...detailArgs,
    staff: detailStaffOf("staff1"),
    shift: {
      ...shiftWithSingleRange,
      id: "overlap-shift",
      positions: [
        {
          id: "overlap-1",
          positionId: "hall",
          positionName: "ホール",
          color: "#3b82f6",
          start: "10:00",
          end: "14:00",
        },
        {
          id: "overlap-2",
          positionId: "kitchen",
          positionName: "キッチン",
          color: "#c2410c",
          start: "13:00",
          end: "18:00",
        },
      ],
    },
  },
  decorators: detailDecorators,
  render: (args) => <ShiftEditSheetBehaviorHarness {...args} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const sheet = within(await body.findByRole("dialog", { name: /Aさんのシフト/ }));

    await userEvent.click(sheet.getByRole("button", { name: "変更する" }));

    await expect(await sheet.findByRole("alert")).toHaveTextContent("勤務時間が重なっています");
    await expect(within(canvasElement).getByText("未更新")).toBeInTheDocument();
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
    await userEvent.click(sheet.getByRole("button", { name: "変更する" }));

    await expect(await within(canvasElement).findByText("更新結果：1件 single-work 12:00〜13:00")).toBeInTheDocument();
  },
};

/** シンプル表示で勤務が1件の日も、「勤務時間を追加」で複数行の編集へ切り替えて2件目を足せる。 */
export const AddSecondRangeSimple: Story = {
  name: "Add Second Range Simple",
  parameters: {
    screenshot: { skip: true },
  },
  args: ShortenSingleRange.args,
  render: (args) => <ShiftEditSheetBehaviorHarness {...args} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog", { name: /短縮テストのシフト/ });
    const sheet = within(dialog);
    // 押すまでは、開始と終了だけの形で、全部を消す操作も出ている。
    await expect(sheet.getByRole("combobox", { name: "開始時間" })).toHaveTextContent("12:00");
    await expect(sheet.getByRole("button", { name: "勤務時間を削除" })).toBeInTheDocument();

    await userEvent.click(sheet.getByRole("button", { name: "勤務時間を追加" }));

    // 複数行へ切り替わり、1件目はそのまま、2件目は1件目の終了から始まる。
    await expect(await sheet.findByRole("combobox", { name: "勤務時間1の終了時間" })).toHaveTextContent("14:00");
    await expect(sheet.getByRole("combobox", { name: "勤務時間2の開始時間" })).toHaveTextContent("14:00");
    await expect(sheet.queryByRole("button", { name: "勤務時間を削除" })).not.toBeInTheDocument();
    // シンプル表示では、ポジションの選択を出さない。
    await expect(sheet.queryByRole("radiogroup")).not.toBeInTheDocument();

    await userEvent.click(sheet.getByRole("combobox", { name: "勤務時間2の開始時間" }));
    await userEvent.click(await sheet.findByRole("option", { name: "15:00" }));
    await userEvent.click(sheet.getByRole("combobox", { name: "勤務時間2の終了時間" }));
    await userEvent.click(await sheet.findByRole("option", { name: "17:00" }));
    await userEvent.click(sheet.getByRole("button", { name: "変更する" }));

    await expect(
      await within(canvasElement).findByText(/^更新結果：2件 single-work 12:00〜14:00 \/ seg-\d+-\d+ 15:00〜17:00$/),
    ).toBeInTheDocument();
  },
};

/** 勤務がない日も、「勤務時間を追加」で2件を一度に入れられる。 */
export const AddRangeToNewShiftSimple: Story = {
  name: "Add Range To New Shift Simple",
  parameters: {
    screenshot: { skip: true },
  },
  args: { ...baseArgs, shift: undefined },
  render: (args) => <ShiftEditSheetBehaviorHarness {...args} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const sheet = within(await body.findByRole("dialog", { name: /のシフト/ }));

    await userEvent.click(sheet.getByRole("button", { name: "勤務時間を追加" }));
    await expect(await sheet.findByRole("group", { name: "勤務時間2" })).toBeInTheDocument();

    // 入力していない行があると保存できず、行ごとに文言が出る。
    await userEvent.click(sheet.getByRole("button", { name: "変更する" }));
    await expect(await sheet.findAllByText("開始時間を選択してください")).toHaveLength(2);
    await expect(within(canvasElement).getByText("未更新")).toBeInTheDocument();
  },
};

/** 勤務が2件ある日は、シンプル表示でも2件目だけを変えられる。 */
export const EditSecondRangeSimple: Story = {
  name: "Edit Second Range Simple",
  parameters: {
    screenshot: { skip: true },
  },
  args: {
    ...baseArgs,
    staff: { id: "edit-multiple", name: "複数編集テスト", isSubmitted: true },
    shift: {
      ...shiftWithBreak,
      id: "edit-multiple-shift",
      staffId: "edit-multiple",
      staffName: "複数編集テスト",
    },
  },
  render: (args) => <ShiftEditSheetBehaviorHarness {...args} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog", { name: /複数編集テストのシフト/ });
    const sheet = within(dialog);
    // シンプル表示では、ポジションの選択を出さない。
    await expect(sheet.queryByRole("radiogroup")).not.toBeInTheDocument();

    await userEvent.click(sheet.getByRole("combobox", { name: "勤務時間2の終了時間" }));
    await userEvent.click(await sheet.findByRole("option", { name: "16:00" }));
    await userEvent.click(sheet.getByRole("button", { name: "変更する" }));

    await expect(
      await within(canvasElement).findByText(
        "更新結果：2件 seg-staff4-2026-01-23-09:00-12:00-ap 09:00〜12:00 / seg-staff4-2026-01-23-13:00-17:00-ap 13:00〜16:00",
      ),
    ).toBeInTheDocument();
  },
};

/** 行をすべて削除して「変更する」と、その日の勤務がなくなる。 */
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

    await userEvent.click(sheet.getByRole("button", { name: "勤務時間2を削除" }));
    await userEvent.click(sheet.getByRole("button", { name: "勤務時間1を削除" }));
    await expect(sheet.queryByRole("group", { name: "勤務時間1" })).not.toBeInTheDocument();
    await expect(within(canvasElement).getByText("未更新")).toBeInTheDocument();

    await userEvent.click(sheet.getByRole("button", { name: "変更する" }));

    await expect(await within(canvasElement).findByText("削除結果：delete-multiple")).toBeInTheDocument();
  },
};
