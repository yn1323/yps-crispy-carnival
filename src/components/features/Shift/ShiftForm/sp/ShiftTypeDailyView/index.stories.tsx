import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ShiftForm } from "../..";
import { mockShiftTypeDates } from "../../stories/fixtures";
import { fullscreenParameters, mobileGlobals, shiftFormDecorators } from "../../stories/shared";
import { clearRememberedBoardPosition, shiftTypeBoardDetailArgs } from "../../stories/shiftTypeBoardFixtures";
import { readStaffingCalls, StaffingHarness } from "../../stories/staffingHarness";
import { shiftTypeDetailArgs, shiftTypeDetailTemplates } from "../detailStoryFixtures";

const meta = {
  title: "Features/Shift/ShiftForm/Shift Type/SP/Daily Detail",
  component: ShiftForm,
  tags: ["vrt-mobile2"],
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 複数ポジション、必要人数、熟練度、仮の勤務を1画面で確かめる。勤務パターンが4つでも横スクロールにしない。 */
export const Detail: Story = {
  args: shiftTypeDetailArgs,
  globals: mobileGlobals,
};

/** スタッフ向けの確定シフト表示では、ポジションだけを足す。希望の輪、点、充足は出さない。 */
export const DetailReadOnly: Story = {
  name: "Detail Read Only",
  args: { ...shiftTypeDetailArgs, isReadOnly: true, displayMode: "confirmed", onDetailModeChange: undefined },
  globals: mobileGlobals,
};

/** 依頼の画像と同じ状態（希望どおり、希望だけ、希望外、時間の重なり、休み希望、未提出）を持つ代表例。 */
export const Board: Story = {
  args: shiftTypeBoardDetailArgs,
  globals: mobileGlobals,
  beforeEach: clearRememberedBoardPosition,
};

/** 充足の欄は閉じた状態で始まり、開くとポジションごと・勤務パターンごとの「配置/必要」を出す。 */
export const FulfillmentInteractive: Story = {
  name: "Fulfillment Interactive",
  args: shiftTypeBoardDetailArgs,
  globals: mobileGlobals,
  beforeEach: clearRememberedBoardPosition,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const fulfillment = await canvas.findByRole("region", { name: "充足" });
    const toggle = within(fulfillment).getByRole("button", { name: "充足 66%" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(within(fulfillment).queryByRole("table")).not.toBeInTheDocument();

    await userEvent.click(toggle);
    const rows = within(await within(fulfillment).findByRole("table")).getAllByRole("row");
    await expect(rows.slice(1).map((row) => row.textContent)).toEqual([
      "ホールホール2/2ホール3/2ホール0/1",
      "キッチンキッチン1/1キッチン0/1キッチン0/1",
      "ドリンクドリンク1/1",
    ]);

    // 必要人数のない日は、充足の欄を出さず、見出しに人数を出す。
    await userEvent.click(canvasElement.querySelector('[data-date-chip="2026-12-17"]') as HTMLElement);
    await waitFor(() => expect(canvas.queryByRole("region", { name: "充足" })).not.toBeInTheDocument());
    await expect(await canvas.findByRole("columnheader", { name: /^早番/ })).toHaveTextContent("9–15・0人");
  },
};

/**
 * 空きのセルをタップすると、最後に選んだポジションで入る。ピルをタップして開くモーダルでポジションを変えると、充足率が変わる。
 * 「削除」で割り当てを外す。
 */
export const PositionDialogInteractive: Story = {
  name: "Position Dialog Interactive",
  args: shiftTypeBoardDetailArgs,
  globals: mobileGlobals,
  beforeEach: clearRememberedBoardPosition,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const lateCell = (state: "勤務あり" | "勤務なし") =>
      canvas.findByRole("button", { name: `山本 拓海 遅番 ${state}` });
    await expect(await canvas.findByRole("button", { name: "充足 66%" })).toBeVisible();

    // 覚えたポジションがないため、店舗の先頭のポジション（ホール）で入る。
    await userEvent.click(await lateCell("勤務なし"));
    await expect(await lateCell("勤務あり")).toHaveTextContent("ホール");

    // モーダルでキッチンに変えると、充足率が変わる。
    await userEvent.click(await lateCell("勤務あり"));
    const dialog = await body.findByRole("dialog", { name: "山本 拓海" });
    await expect(dialog).toHaveTextContent("遅番 15:00〜21:00");
    await expect(within(dialog).getByRole("radio", { name: "ホール" })).toBeChecked();
    await userEvent.click(within(dialog).getByRole("radio", { name: "キッチン" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(await lateCell("勤務あり")).toHaveTextContent("キッチン");
    await expect(await canvas.findByRole("button", { name: "充足 77%" })).toBeVisible();

    // 最後に選んだキッチンを覚え、次の空きのセルはキッチンで入る。
    // 夜番は遅番と時間が重なるが、重なりは知らせない。ピルに点は出さず、名前の右の確認事項に希望外だけを出す。
    await userEvent.click(await canvas.findByRole("button", { name: "山本 拓海 夜番 勤務なし" }));
    const night = await canvas.findByRole("button", { name: "山本 拓海 夜番 勤務あり" });
    await expect(night).toHaveTextContent("キッチン");
    await expect(night.querySelector("[data-assignment-dot]")).toBeNull();
    await userEvent.click(within(night.closest("tr") as HTMLElement).getByRole("button", { name: "確認事項1件" }));
    // ピルの読み上げ用の説明にも同じ理由が入るため、開いた吹き出しの中で確かめる。
    await expect(await body.findByRole("dialog")).toHaveTextContent("確認事項夜番：希望時間外に勤務あり");
    await userEvent.keyboard("{Escape}");

    // モーダルには点の理由を出す。「削除」で割り当てを外す。
    await userEvent.click(night);
    const nightDialog = await body.findByRole("dialog", { name: "山本 拓海" });
    await expect(nightDialog).toHaveTextContent("希望時間外に勤務あり");
    await expect(nightDialog).not.toHaveTextContent("時間が重なっています");
    await userEvent.click(within(nightDialog).getByRole("button", { name: "削除" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(await canvas.findByRole("button", { name: "山本 拓海 夜番 勤務なし" })).toBeInTheDocument();
  },
};

/** スマートフォンでも、日付の見出しのテンプレートのメニューからテンプレートを当てると、その日とテンプレートを送り、必要人数が変わる。 */
export const ApplyTemplateInteractive: Story = {
  name: "Apply Template Interactive",
  args: shiftTypeDetailArgs,
  render: (args) => <StaffingHarness {...args} templates={shiftTypeDetailTemplates} />,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const before = (await canvas.findByRole("button", { name: /^充足 \d+%$/ })).textContent;

    await userEvent.click(await canvas.findByRole("button", { name: "この日のテンプレート: 平日" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "イベント日" }));

    await expect(await canvas.findByRole("button", { name: "この日のテンプレート: イベント日" })).toBeInTheDocument();
    await expect((await readStaffingCalls(canvasElement)).calls).toEqual([
      { mutation: "applyDayTemplateToDates", dates: [mockShiftTypeDates[0]], templateId: "event" },
    ]);
    // イベント日は早番と中番のホールに3人ずつが必要で、充足率が変わる。
    await waitFor(async () =>
      expect((await canvas.findByRole("button", { name: /^充足 \d+%$/ })).textContent).not.toBe(before),
    );
  },
};
