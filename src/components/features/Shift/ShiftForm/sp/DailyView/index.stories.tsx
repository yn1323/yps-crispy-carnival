import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ShiftForm } from "../..";
import { fullscreenParameters, mobileGlobals, shiftFormDecorators } from "../../stories/shared";
import { buildStaffing, readStaffingCalls, StaffingHarness, unsetDay } from "../../stories/staffingHarness";
import { hall, timeDetailArgs, timeDetailDate, timeDetailTemplates } from "../detailStoryFixtures";

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
 * カードは畳んだ状態で、不足している時間だけを「ポジション → 時間 → 人数」で出す。
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
    // Aさんはホールでリーダーなので、ポジションの名前と時刻の間に、熟練度の印が入る。
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Aさんの勤務を編集" })).toHaveTextContent("ホールリーダー10:00〜13:00"),
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
// 人数のカードと、その日のテンプレートの操作
// ==========================================
type ShiftFormArgs = Parameters<typeof ShiftForm>[0];

const harnessRender = (args: ShiftFormArgs) => <StaffingHarness {...args} templates={timeDetailTemplates} />;

const findStaffingCard = (canvasElement: HTMLElement) => within(canvasElement).findByRole("region", { name: "人数" });

/** 人数の行を「時間 人数」の文字で返す。 */
const getRows = (card: HTMLElement, positionName: string) =>
  within(within(card).getByRole("list", { name: `${positionName}の人数` }))
    .getAllByRole("listitem")
    .map((row) => row.textContent);

/** カードは不足の数を文字で出し、畳んだ状態では不足だけ、「すべて見る」で多い時間と見習いだけの時間も出す。 */
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
    // レジは見習いのDさんだけが入る。必要人数のない午前は多い時間になる。
    await expect(getRows(card, "レジ")).toEqual(["09:00〜12:001/0 ＋1見習いだけ", "13:00〜17:001/1見習いだけ"]);
  },
};

/** カードのテンプレートのメニューからテンプレートを当てると、その日とテンプレートを1回で送り、不足の数が変わる。 */
export const ApplyTemplateInteractive: Story = {
  name: "Apply Template Interactive",
  args: timeDetailArgs,
  render: harnessRender,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const card = await findStaffingCard(canvasElement);

    await userEvent.click(within(card).getByRole("button", { name: "この日のテンプレート: 平日" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "イベント日" }));

    await expect(
      await within(card).findByRole("button", { name: "この日のテンプレート: イベント日" }),
    ).toBeInTheDocument();
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

/** テンプレートが当たらない日は、カードに「必要人数が未設定」と出し、「すべて見る」で人数だけを確かめられる。 */
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
    await expect(within(card).getByRole("button", { name: "この日のテンプレート: 未設定" })).toBeInTheDocument();

    await userEvent.click(within(card).getByRole("button", { name: "すべて見る" }));
    // 過不足を出さず、人数だけを出す。
    await waitFor(() => expect(getRows(card, "ホール")).toEqual(["10:00〜18:001"]));
    await expect(getRows(card, "キッチン")).toEqual(["12:00〜17:001"]);
  },
};
