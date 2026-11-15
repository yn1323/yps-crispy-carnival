import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { timeToMinutes } from "@/src/domains/shift/time";
import type { PositionType, ShiftData, StaffType } from "@/src/domains/shift/types";
import { DEFAULT_TIME_PATTERN } from "@/src/domains/shop/submissionPattern";
import { ShiftForm, type ShiftFormStaffing } from "../..";
import { TIME_AXIS_PADDING_PX } from "../../constants";
import { mockStaffs, mockTimeRange } from "../../stories/fixtures";
import { desktopGlobals, fullscreenParameters, shiftFormDecorators } from "../../stories/shared";

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

// ==========================================
// くわしく表示のfixture（ポジション3つ、日の型あり、休憩あり、熟練度あり、仮の勤務あり）
// 2026-01-21は水曜（平日の型が当たる）、2026-01-24は土曜（型が当たらない）。
// ==========================================
const hall: PositionType = { id: "hall", name: "ホール", color: "#3b82f6", isDefault: true };
const kitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#c2410c", isDefault: false };
const register: PositionType = { id: "register", name: "レジ", color: "#7c3aed", isDefault: false };
const HALL_RGB = "rgb(59, 130, 246)";
const KITCHEN_RGB = "rgb(194, 65, 12)";

const WEEKDAY = "2026-01-21";
const SATURDAY = "2026-01-24";

const detailStaffs: StaffType[] = mockStaffs.map((staff) =>
  staff.id === "staff1"
    ? { ...staff, skillLevel: "lead" }
    : staff.id === "staff3"
      ? { ...staff, skillLevel: "newcomer" }
      : staff,
);

const shift = (
  staffId: string,
  date: string,
  segments: Array<[position: PositionType, start: string, end: string]>,
  extra: Partial<ShiftData> = {},
): ShiftData => ({
  id: `shift-${staffId}-${date}`,
  staffId,
  staffName: detailStaffs.find((staff) => staff.id === staffId)?.name ?? staffId,
  date,
  requestedTime: null,
  positions: segments.map(([position, start, end]) => ({
    id: `seg-${staffId}-${date}-${start}`,
    positionId: position.id,
    positionName: position.name,
    color: position.color,
    start,
    end,
  })),
  ...extra,
});

const buildShifts = (date: string): ShiftData[] => [
  // Aさん（責任者）: 時刻で入れた休憩がバーの内側に出る。
  shift("staff1", date, [[hall, "10:00", "18:00"]], {
    requestedTime: { start: "10:00", end: "18:00" },
    breaks: [{ start: "13:00", end: "14:00" }],
  }),
  // Bさん: 休憩のない勤務。
  shift("staff2", date, [[kitchen, "12:00", "20:00"]], { requestedTime: { start: "12:00", end: "20:00" } }),
  // Cさん（新人、未提出）: 前回の勤務を仮で入れた日。
  shift("staff3", date, [[hall, "10:00", "14:00"]], { isProvisional: true }),
  // Dさん: 1日の中でポジションを変える。
  shift(
    "staff4",
    date,
    [
      [hall, "09:00", "13:00"],
      [kitchen, "13:00", "17:00"],
    ],
    { requestedTime: { start: "09:00", end: "17:00" } },
  ),
  // Eさん（未提出）: 勤務なし。
];

const timeSlot = (startTime: string, endTime: string, counts: Array<[position: PositionType, count: number]>) => ({
  key: { kind: "time" as const, startTime, endTime },
  requirements: counts.map(([position, count]) => ({ positionId: position.id, count })),
});

const detailStaffing: ShiftFormStaffing = {
  dayTemplates: [
    {
      id: "weekday",
      name: "平日",
      weekdays: ["mon", "tue", "wed", "thu", "fri"],
      slots: [
        timeSlot("09:00", "12:00", [
          [hall, 2],
          [kitchen, 1],
        ]),
        timeSlot("12:00", "17:00", [
          [hall, 2],
          [kitchen, 2],
        ]),
        timeSlot("17:00", "22:00", [
          [hall, 1],
          [kitchen, 1],
        ]),
      ],
    },
  ],
  dayTemplateOverrides: [],
  breakRule: null,
};

const detailArgs = {
  shopId: "shop1",
  staffs: detailStaffs,
  positions: [hall, kitchen, register],
  initialShifts: buildShifts(WEEKDAY),
  dates: [WEEKDAY],
  timeRange: mockTimeRange,
  holidays: [],
  submissionPattern: DEFAULT_TIME_PATTERN,
  staffing: detailStaffing,
  initialDetailMode: true,
  onDetailModeChange: () => {},
  detailActions: { onOpenSetup: () => {}, onChangeDayTemplate: () => {} },
} satisfies ShiftFormArgs;

const meta = {
  title: "Features/Shift/ShiftForm/Time/PC/Daily Detail",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 複数ポジション、日の型あり（不足あり）、バーの内側の休憩、熟練度、仮の勤務を1画面で確かめる。 */
export const Detail: Story = {
  args: detailArgs,
  globals: desktopGlobals,
};

/** 日の型が当たらない日は、1時間ごとの人数だけを出す。 */
export const DetailWithoutDayTemplateForDate: Story = {
  name: "Detail Without Day Template For Date",
  args: { ...detailArgs, dates: [SATURDAY], initialShifts: buildShifts(SATURDAY) },
  globals: desktopGlobals,
};

// ==========================================
// 操作の補助
// ==========================================
const findRow = async (canvasElement: HTMLElement, staffId: string) => {
  const selector = `[data-tour="shift-row-${staffId}"]`;
  await waitFor(() => expect(canvasElement.querySelector(selector)).not.toBeNull());
  return canvasElement.querySelector(selector) as HTMLElement;
};

// 勤務のバーと、時刻で入れた休憩の帯は、名前を持たない色の面なので、塗り方で見分ける。
const getWorkBars = (row: HTMLElement) =>
  Array.from(row.querySelectorAll<HTMLElement>('div[style^="background: rgb"]'));
const getBreakBars = (row: HTMLElement) =>
  Array.from(row.querySelectorAll<HTMLElement>('div[style^="background-color"]'));
const getWorkBarColors = (row: HTMLElement) => getWorkBars(row).map((bar) => getComputedStyle(bar).backgroundColor);

/** 行の時間軸の上で、その時刻にあたる位置を返す。 */
const pointAt = (row: HTMLElement, time: string) => {
  const rect = (row.lastElementChild as HTMLElement).getBoundingClientRect();
  const hourWidth = (rect.width - TIME_AXIS_PADDING_PX * 2) / (mockTimeRange.end - mockTimeRange.start);
  const minutesFromStart = timeToMinutes(time) - mockTimeRange.start * 60;
  return {
    clientX: rect.left + TIME_AXIS_PADDING_PX + (minutesFromStart / 60) * hourWidth,
    clientY: rect.top + rect.height / 2,
  };
};

const findStaffingSection = (canvasElement: HTMLElement) =>
  within(canvasElement).findByRole("region", { name: "人数" });

/** 勤務のバーを押すと開く欄で、勤務区間のポジションを変えると、バーの色と人数の行が変わる。 */
export const DetailChangePositionInteractive: Story = {
  name: "Detail Change Position Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const row = await findRow(canvasElement, "staff1");
    const staffing = within(await findStaffingSection(canvasElement));
    await expect(getWorkBarColors(row)).toEqual([HALL_RGB]);
    await expect(await staffing.findByTitle("12:00–17:00 ホール 1/2、キッチン 1/2、レジ 0")).toBeInTheDocument();

    await userEvent.click(getWorkBars(row)[0]);
    const positionGroup = await body.findByRole("radiogroup", { name: "10:00〜18:00のポジション" });
    await expect(within(positionGroup).getByRole("radio", { name: "ホール" })).toBeChecked();
    await userEvent.click(within(positionGroup).getByRole("radio", { name: "キッチン" }));

    await waitFor(() => expect(getWorkBarColors(row)).toEqual([KITCHEN_RGB]));
    await expect(await staffing.findByTitle("12:00–17:00 ホール 0/2、キッチン 2/2、レジ 0")).toBeInTheDocument();
    // ポジションを変えても、入れてあった休憩は残る。
    await expect(getBreakBars(row)).toHaveLength(1);
  },
};

/** 勤務のバーを押すと開く欄の「休憩を変更」から、休憩を足し、消せる。 */
export const DetailEditBreaksInteractive: Story = {
  name: "Detail Edit Breaks Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const row = await findRow(canvasElement, "staff2");
    await expect(getBreakBars(row)).toHaveLength(0);

    // 足す: 勤務の中央に1時間の休憩が入る。
    await userEvent.click(getWorkBars(row)[0]);
    await expect(await body.findByText("休憩：なし")).toBeInTheDocument();
    await userEvent.click(await body.findByRole("button", { name: "休憩を変更" }));
    const addDialog = within(await body.findByRole("dialog"));
    await userEvent.click(await addDialog.findByRole("button", { name: "休憩を追加" }));
    await expect(await addDialog.findByRole("group", { name: "休憩1" })).toBeInTheDocument();
    await userEvent.click(addDialog.getByRole("button", { name: "変更する" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(getBreakBars(row)).toHaveLength(1));

    await userEvent.click(getWorkBars(row)[0]);
    await expect(await body.findByText("休憩：15:30〜16:30")).toBeInTheDocument();

    // 消す。
    await userEvent.click(await body.findByRole("button", { name: "休憩を変更" }));
    const removeDialog = within(await body.findByRole("dialog"));
    await userEvent.click(await removeDialog.findByRole("button", { name: "休憩1を削除" }));
    await userEvent.click(removeDialog.getByRole("button", { name: "変更する" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(getBreakBars(row)).toHaveLength(0));

    await userEvent.click(getWorkBars(row)[0]);
    await expect(await body.findByText("休憩：なし")).toBeInTheDocument();
  },
};

/** 「入れるもの」で休憩を選んでいる間は、勤務のある行を押すと休憩の編集が開き、勤務は増えない。 */
export const DetailBreakToolInteractive: Story = {
  name: "Detail Break Tool Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(await canvas.findByRole("radio", { name: "休憩" }));
    // ドラッグの開始、移動、終了を分けて送る。ボタンを押している状態を引き継ぐため、同じ操作者で送る。
    // 押した時点で休憩の編集が開いて背面を押せなくなっても、ドラッグの続きを送って、勤務が入らないことを確かめる。
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const drag = async (target: HTMLElement, from: { clientX: number; clientY: number }, to: typeof from) => {
      await user.pointer({ keys: "[MouseLeft>]", target, coords: from });
      await user.pointer({ target, coords: to });
      await user.pointer({ keys: "[/MouseLeft]", target, coords: to });
    };

    // 勤務のない行をドラッグしても、勤務は入らず、休憩の編集も開かない。
    const emptyRow = await findRow(canvasElement, "staff5");
    await drag(emptyRow.lastElementChild as HTMLElement, pointAt(emptyRow, "18:00"), pointAt(emptyRow, "21:00"));
    await expect(getWorkBars(emptyRow)).toHaveLength(0);
    await expect(body.queryByRole("dialog")).not.toBeInTheDocument();

    // 勤務のある行は、勤務の外の時間をドラッグしても、勤務は増えず、その日の休憩の編集が開く。
    const row = await findRow(canvasElement, "staff2");
    await drag(row.lastElementChild as HTMLElement, pointAt(row, "09:30"), pointAt(row, "11:30"));
    await expect(await body.findByRole("dialog")).toHaveTextContent("Bさんの休憩");
    await expect(getWorkBarColors(row)).toEqual([KITCHEN_RGB]);
    await expect(row).toHaveTextContent("12:00–20:00");
  },
};

/** 休憩を選んでいる間に勤務のバーを押しても、休憩の編集だけが開き、勤務の欄を重ねて開かない。 */
export const DetailBreakToolOnBarInteractive: Story = {
  name: "Detail Break Tool On Bar Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(await canvas.findByRole("radio", { name: "休憩" }));

    const row = await findRow(canvasElement, "staff2");
    await userEvent.click(getWorkBars(row)[0]);

    await expect(await body.findByRole("dialog")).toHaveTextContent("Bさんの休憩");
    // 勤務の欄は「休憩：…」と「休憩を変更」を持つ。休憩の編集と同時には開かない。
    await expect(body.queryByText(/^休憩：/)).not.toBeInTheDocument();
    await expect(body.queryByRole("button", { name: "休憩を変更" })).not.toBeInTheDocument();
  },
};

/** 「入れるもの」で選んだポジションで、ドラッグした時間に勤務が入り、人数が変わる。 */
export const DetailPaintInteractive: Story = {
  name: "Detail Paint Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = await findRow(canvasElement, "staff5");
    const timeline = row.lastElementChild as HTMLElement;
    const staffing = within(await findStaffingSection(canvasElement));
    await expect(await staffing.findByTitle("17:00–22:00 ホール 0/1、キッチン 0/1、レジ 0")).toBeInTheDocument();

    await userEvent.click(await canvas.findByRole("radio", { name: "キッチン" }));
    // ドラッグの開始、移動、終了を分けて送り、移動を受け取る準備ができてから次へ進む。
    // ボタンを押している状態を引き継ぐため、同じ操作者で送る。
    const user = userEvent.setup();
    await user.pointer({ keys: "[MouseLeft>]", target: timeline, coords: pointAt(row, "17:00") });
    await user.pointer({ target: timeline, coords: pointAt(row, "22:00") });
    await user.pointer({ keys: "[/MouseLeft]", target: timeline, coords: pointAt(row, "22:00") });

    await waitFor(() => expect(getWorkBarColors(row)).toEqual([KITCHEN_RGB]));
    await expect(row).toHaveTextContent("17:00–22:00");
    await expect(await staffing.findByTitle("17:00–22:00 ホール 0/1、キッチン 1/1、レジ 0")).toBeInTheDocument();
  },
};
