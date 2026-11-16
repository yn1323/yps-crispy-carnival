import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ShiftForm } from "../..";
import { fullscreenParameters, mobileGlobals, shiftFormDecorators } from "../../stories/shared";
import { buildStaffing, readStaffingCalls, StaffingHarness, unsetDay } from "../../stories/staffingHarness";
import { hall, timeDetailArgs, timeDetailDate, timeDetailDays, timeDetailTemplates } from "../detailStoryFixtures";

const meta = {
  title: "Features/Shift/ShiftForm/Time/SP/Daily Detail",
  component: ShiftForm,
  tags: ["vrt-mobile2"],
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 複数ポジション、休憩、熟練度、仮の勤務と、上端の人数のカードを1画面で確かめる。
 * カードは畳んだ状態で、不足している時間だけを「ポジション → 時間 → 人数」で出す。日付の並びには人数の印が出る。
 */
export const Detail: Story = {
  args: timeDetailArgs,
  globals: mobileGlobals,
};

/** ポジションが1つの店舗では色分けせず、人数、休憩、印だけを足す。 */
export const DetailSinglePosition: Story = {
  name: "Detail Single Position",
  args: {
    ...timeDetailArgs,
    positions: [hall],
    initialShifts: timeDetailArgs.initialShifts.map((shift) => ({
      ...shift,
      positions: shift.positions.map((position) => ({
        ...position,
        positionId: hall.id,
        positionName: hall.name,
        color: hall.color,
      })),
    })),
    staffing: buildStaffing({ days: timeDetailArgs.dates.map(unsetDay) }),
  },
  globals: mobileGlobals,
};

/** 閲覧専用でも、ポジションと休憩と人数は出す。入れるものの選択は出さない。 */
export const DetailReadOnly: Story = {
  name: "Detail Read Only",
  args: { ...timeDetailArgs, isReadOnly: true, displayMode: "confirmed", onDetailModeChange: undefined },
  globals: mobileGlobals,
};

const openEditSheet = async (canvasElement: HTMLElement, staffName: string) => {
  await userEvent.click(await within(canvasElement).findByRole("button", { name: `${staffName}の勤務を編集` }));
  const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog", {
    name: new RegExp(`^${staffName}のシフト`),
  });
  return within(dialog);
};

const selectTime = async (sheet: ReturnType<typeof within>, label: string, time: string) => {
  await userEvent.click(sheet.getByRole("combobox", { name: label }));
  await userEvent.click(await sheet.findByRole("option", { name: time }));
};

/** 勤務が2件ある日を開き、2件目の時刻とポジションを変えると、カードの表示が変わる。 */
export const EditSecondRangeInteractive: Story = {
  name: "Edit Second Range Interactive",
  args: timeDetailArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sheet = await openEditSheet(canvasElement, "Aさん");

    await selectTime(sheet, "勤務時間2の終了時間", "17:00");
    await userEvent.click(
      within(sheet.getByRole("radiogroup", { name: "勤務時間2のポジション" })).getByRole("radio", { name: "レジ" }),
    );
    await userEvent.click(sheet.getByRole("button", { name: "変更する" }));

    const card = await canvas.findByRole("button", { name: "Aさんの勤務を編集" });
    await waitFor(() => expect(card).toHaveTextContent("10:00–17:00"));
    await expect(card).toHaveTextContent("レジ14:00〜17:00");
    await expect(card).not.toHaveTextContent("キッチン");
  },
};

/** 「勤務時間を追加」で行が増え、直前の行の終了が開始に入る。 */
export const AddRangeInteractive: Story = {
  name: "Add Range Interactive",
  args: timeDetailArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sheet = await openEditSheet(canvasElement, "Bさん");
    await expect(sheet.queryByRole("group", { name: "勤務時間2" })).not.toBeInTheDocument();

    // Bさんの勤務は11:00〜19:00。足した行は19:00から始まる。
    await userEvent.click(sheet.getByRole("button", { name: "勤務時間を追加" }));
    const addedRow = within(await sheet.findByRole("group", { name: "勤務時間2" }));
    await expect(addedRow.getByRole("combobox", { name: "勤務時間2の開始時間" })).toHaveTextContent("19:00");

    await selectTime(sheet, "勤務時間2の終了時間", "21:00");
    await userEvent.click(addedRow.getByRole("radio", { name: "ホール" }));
    await userEvent.click(sheet.getByRole("button", { name: "変更する" }));

    const card = await canvas.findByRole("button", { name: "Bさんの勤務を編集" });
    await waitFor(() => expect(card).toHaveTextContent("11:00–21:00"));
    await expect(card).toHaveTextContent("ホール19:00〜21:00");
  },
};

/** 重なる時刻は保存できず、文言で伝える。直すと保存できる。 */
export const OverlapErrorInteractive: Story = {
  name: "Overlap Error Interactive",
  args: timeDetailArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sheet = await openEditSheet(canvasElement, "Aさん");

    // 1件目は10:00〜14:00。2件目を13:00からにすると重なる。
    await selectTime(sheet, "勤務時間2の開始時間", "13:00");
    await userEvent.click(sheet.getByRole("button", { name: "変更する" }));
    await expect(await sheet.findByRole("alert")).toHaveTextContent("勤務時間が重なっています");
    // シートが開いている間、後ろのカードは変わらない。
    await expect(canvas.getByRole("button", { name: "Aさんの勤務を編集", hidden: true })).toHaveTextContent(
      "10:00–18:00",
    );

    await selectTime(sheet, "勤務時間1の終了時間", "13:00");
    await waitFor(() => expect(sheet.queryByRole("alert")).not.toBeInTheDocument());
    await userEvent.click(sheet.getByRole("button", { name: "変更する" }));
    // Aさんはホールで責任者なので、ポジションの名前と時刻の間に、熟練度の印が入る。
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Aさんの勤務を編集" })).toHaveTextContent("ホール責任者10:00〜13:00"),
    );
  },
};

/** 編集シートの「休憩を変更」は、シートを閉じてから休憩の編集を開く。入力中の勤務時間は先に反映する。 */
export const EditBreaksFromSheetInteractive: Story = {
  name: "Edit Breaks From Sheet Interactive",
  args: timeDetailArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const sheet = await openEditSheet(canvasElement, "Bさん");

    await selectTime(sheet, "勤務時間1の終了時間", "18:00");
    await userEvent.click(sheet.getByRole("button", { name: "休憩を変更" }));

    const breakDialog = await body.findByRole("dialog", { name: /^Bさんの休憩/ });
    await expect(breakDialog).toHaveTextContent("勤務：11:00〜18:00");
    await waitFor(() => expect(body.getAllByRole("dialog")).toHaveLength(1));
  },
};

/** 休憩を選んでいる間は、カードを押すと編集シートではなく休憩の編集が開く。 */
export const BreakToolInteractive: Story = {
  name: "Break Tool Interactive",
  args: timeDetailArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(await canvas.findByRole("radio", { name: "休憩" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Aさんの勤務を編集" }));

    await expect(await body.findByRole("dialog", { name: /^Aさんの休憩/ })).toBeInTheDocument();
    await expect(body.queryByRole("dialog", { name: /^Aさんのシフト/ })).not.toBeInTheDocument();
  },
};

// ==========================================
// 人数のカードと、その日の型の操作
// ==========================================
type ShiftFormArgs = Parameters<typeof ShiftForm>[0];

const harnessRender = (args: ShiftFormArgs) => (
  <StaffingHarness {...args} templates={timeDetailTemplates} weekdayDays={timeDetailDays} />
);

const findStaffingCard = (canvasElement: HTMLElement) => within(canvasElement).findByRole("region", { name: "人数" });

/** 人数の行を「時間 人数」の文字で返す。 */
const getRows = (card: HTMLElement, positionName: string) =>
  within(within(card).getByRole("list", { name: `${positionName}の人数` }))
    .getAllByRole("listitem")
    .map((row) => row.textContent);

const getDateMarks = (canvasElement: HTMLElement) =>
  Array.from(canvasElement.querySelectorAll("[data-date-chip]")).map((chip) => [
    chip.getAttribute("data-date-chip"),
    Array.from(chip.querySelectorAll("[data-staffing-mark]")).map((mark) => mark.getAttribute("data-staffing-mark")),
  ]);

/** カードは不足の数を文字で出し、畳んだ状態では不足だけ、「すべて見る」で多い時間と新人だけの時間も出す。 */
export const StaffingCardInteractive: Story = {
  name: "Staffing Card Interactive",
  args: timeDetailArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const card = await findStaffingCard(canvasElement);
    await expect(within(card).getByText("不足 7か所")).toBeInTheDocument();
    // 畳んだ状態は、不足している時間だけ。不足のないレジは出さない。
    await expect(getRows(card, "ホール")).toEqual([
      "09:00〜10:000/2 ▲2",
      "10:00〜12:001/2 ▲1",
      "12:00〜13:000/2 ▲2",
      "17:00〜22:000/1 ▲1",
    ]);
    await expect(within(card).queryByRole("list", { name: "レジの人数" })).not.toBeInTheDocument();

    await userEvent.click(within(card).getByRole("button", { name: "すべて見る" }));

    await waitFor(() =>
      expect(getRows(card, "ホール")).toEqual([
        "09:00〜10:000/2 ▲2",
        "10:00〜12:001/2 ▲1",
        "12:00〜13:000/2 ▲2",
        "13:00〜14:002/1 ＋1",
        "14:00〜17:001/1",
        "17:00〜22:000/1 ▲1",
      ]),
    );
    // レジは新人のDさんだけが入る。必要人数のない午前は多い時間になる。
    await expect(getRows(card, "レジ")).toEqual(["09:00〜12:001/0 ＋1新人だけ", "13:00〜17:001/1新人だけ"]);
    // 日付の並びは、不足と多い時間のある金曜にだけ印を出す。
    await expect(getDateMarks(canvasElement)).toEqual([
      [timeDetailDate, ["shortage", "excess"]],
      ["2026-01-24", []],
    ]);
  },
};

/** カードの型のメニューから型を当てると、その日と型を1回で送り、不足の数が変わる。 */
export const ApplyTemplateInteractive: Story = {
  name: "Apply Template Interactive",
  args: timeDetailArgs,
  render: harnessRender,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const card = await findStaffingCard(canvasElement);

    await userEvent.click(within(card).getByRole("button", { name: "この日の型: 平日" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "イベント日" }));

    await expect(await within(card).findByRole("button", { name: "この日の型: イベント日" })).toBeInTheDocument();
    await expect((await readStaffingCalls(canvasElement)).calls).toEqual([
      { mutation: "applyDayTemplateToDates", dates: [timeDetailDate], templateId: "event" },
    ]);
    // イベント日はホールに3人、キッチンに2人が1日を通して必要で、レジは未設定になる。
    await waitFor(() =>
      expect(getRows(card, "ホール")).toEqual([
        "09:00〜10:000/3 ▲3",
        "10:00〜12:001/3 ▲2",
        "12:00〜13:000/3 ▲3",
        "13:00〜14:002/3 ▲1",
        "14:00〜17:001/3 ▲2",
        "17:00〜22:000/3 ▲3",
      ]),
    );
  },
};

/** スマートフォンでも、「ほかの日もまとめて変える」で複数の日を選び、型を1回で当てられる。 */
export const BulkApplyInteractive: Story = {
  name: "Bulk Apply Interactive",
  args: timeDetailArgs,
  render: harnessRender,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const card = await findStaffingCard(canvasElement);

    await userEvent.click(within(card).getByRole("button", { name: "この日の型: 平日" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "ほかの日もまとめて変える" }));
    const dialog = within(await body.findByRole("dialog", { name: "型をまとめて変える" }));

    await userEvent.click(dialog.getByRole("combobox", { name: "当てる型" }));
    await userEvent.click(await dialog.findByRole("option", { name: "イベント日" }));
    await userEvent.click(dialog.getByRole("button", { name: "すべて" }));
    await userEvent.click(dialog.getByRole("button", { name: "変更する" }));

    await waitFor(() => expect(body.queryByRole("dialog", { name: "型をまとめて変える" })).not.toBeInTheDocument());
    await expect((await readStaffingCalls(canvasElement)).calls).toEqual([
      { mutation: "applyDayTemplateToDates", dates: [timeDetailDate, "2026-01-24"], templateId: "event" },
    ]);
    // 未設定だった土曜にも型が当たり、不足の印が付く。金曜は多い時間がなくなる。
    await waitFor(() =>
      expect(getDateMarks(canvasElement)).toEqual([
        [timeDetailDate, ["shortage"]],
        ["2026-01-24", ["shortage"]],
      ]),
    );
  },
};

/** スマートフォンでは、ボタンと時刻の選択でバーを足し、その日だけの必要人数として保存できる。 */
export const CustomRequirementsInteractive: Story = {
  name: "Custom Requirements Interactive",
  args: timeDetailArgs,
  render: harnessRender,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const card = await findStaffingCard(canvasElement);

    await userEvent.click(within(card).getByRole("button", { name: "この日の型: 平日" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "この日だけ人数を変える" }));
    const dialog = within(await body.findByRole("dialog", { name: "1月23日（金）の必要人数" }));
    await expect(dialog.getByText("この日だけの変更です。型「平日」は変わりません。")).toBeInTheDocument();

    // レジに、9:00〜12:00のバーを1本足す。
    const registerSection = within(await dialog.findByRole("region", { name: "レジのバー" }));
    await userEvent.click(registerSection.getByRole("button", { name: "時刻を選んで足す" }));
    const addDialog = within(await dialog.findByRole("group", { name: "レジのバーを足す" }));
    await userEvent.selectOptions(addDialog.getByRole("combobox", { name: "終了" }), "12:00");
    await userEvent.click(addDialog.getByRole("button", { name: "足す" }));
    await waitFor(() => expect(dialog.queryByRole("group", { name: "レジのバーを足す" })).not.toBeInTheDocument());

    await userEvent.click(dialog.getByRole("button", { name: "保存する" }));

    await waitFor(() =>
      expect(body.queryByRole("dialog", { name: "1月23日（金）の必要人数" })).not.toBeInTheDocument(),
    );
    const bar = (positionId: string, startTime: string, endTime: string) => ({ positionId, startTime, endTime });
    await expect((await readStaffingCalls(canvasElement)).calls).toEqual([
      {
        mutation: "saveDayCustomRequirements",
        date: timeDetailDate,
        requirements: {
          kind: "time",
          bars: [
            bar("hall", "09:00", "13:00"),
            bar("hall", "09:00", "13:00"),
            bar("hall", "13:00", "22:00"),
            bar("kitchen", "09:00", "13:00"),
            bar("kitchen", "13:00", "17:00"),
            bar("kitchen", "13:00", "17:00"),
            bar("register", "13:00", "17:00"),
            bar("register", "09:00", "12:00"),
          ],
        },
      },
    ]);
    await expect(await within(card).findByRole("button", { name: "この日の型: この日だけ変更" })).toBeInTheDocument();
  },
};

/** 型が当たらない日は、カードに「必要人数が未設定」と出し、「すべて見る」で人数だけを確かめられる。 */
export const UnsetDayInteractive: Story = {
  name: "Unset Day Interactive",
  args: timeDetailArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvasElement.querySelector('[data-date-chip="2026-01-24"]') as HTMLElement);

    const card = await canvas.findByRole("region", { name: "人数" });
    await expect(await within(card).findByText("必要人数が未設定")).toBeInTheDocument();
    await expect(within(card).getByRole("button", { name: "この日の型: 未設定" })).toBeInTheDocument();

    await userEvent.click(within(card).getByRole("button", { name: "すべて見る" }));
    // 過不足を出さず、人数だけを出す。
    await waitFor(() => expect(getRows(card, "ホール")).toEqual(["10:00〜18:001"]));
    await expect(getRows(card, "キッチン")).toEqual(["12:00〜17:001"]);
  },
};
