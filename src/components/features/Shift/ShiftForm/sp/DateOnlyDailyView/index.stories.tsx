import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ShiftForm } from "../..";
import { clearRememberedDateOnlyBoardPosition, dateOnlyBoardDetailArgs } from "../../stories/dateOnlyBoardFixtures";
import { fullscreenParameters, mobileGlobals, shiftFormDecorators } from "../../stories/shared";
import { dateOnlyDetailArgs } from "../detailStoryFixtures";

const meta = {
  title: "Features/Shift/ShiftForm/Date Only/SP/Daily Detail",
  component: ShiftForm,
  tags: ["vrt-mobile2"],
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 複数ポジション、必要人数（足りない人数、見習いだけの印）、仮の勤務を1画面で確かめる。 */
export const Detail: Story = {
  args: dateOnlyDetailArgs,
  globals: mobileGlobals,
};

/** スタッフ向けの確定シフトでも、ポジションは出す。希望の輪、点、充足は出さない。 */
export const DetailReadOnly: Story = {
  name: "Detail Read Only",
  args: { ...dateOnlyDetailArgs, isReadOnly: true, displayMode: "confirmed", onDetailModeChange: undefined },
  globals: mobileGlobals,
};

/** 依頼の画像と同じ日（12/2）を表示する。 */
const selectSecondDay = async (canvasElement: HTMLElement) => {
  await userEvent.click(await within(canvasElement).findByRole("button", { name: "12/2(水)を表示" }));
};

/** 依頼の画像と同じ日（12/2）。ポジションの色のピル、その日の充足の行、連絡事項、たたんだ「この日の希望がない人」を1画面で確かめる。 */
export const Board: Story = {
  args: dateOnlyBoardDetailArgs,
  globals: mobileGlobals,
  beforeEach: clearRememberedDateOnlyBoardPosition,
  play: async ({ canvasElement }) => selectSecondDay(canvasElement),
};

/**
 * 空きのピルをタップすると、最後に選んだポジションで入る。ピルをタップして開くモーダルでポジションを変えると、すぐ閉じて反映される。
 * その日の充足の行も変わる。「削除」で割り当てを外す。
 */
export const PositionDialogInteractive: Story = {
  name: "Position Dialog Interactive",
  args: dateOnlyBoardDetailArgs,
  globals: mobileGlobals,
  beforeEach: clearRememberedDateOnlyBoardPosition,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await selectSecondDay(canvasElement);
    const fulfillment = await canvas.findByRole("region", { name: "充足" });
    await expect(fulfillment).toHaveTextContent("充足 60%販売2/3製造1/2");

    // 「希望」をタップすると、覚えたポジションがないため、店舗の先頭のポジション（販売）で入る。
    const requested = await canvas.findByRole("button", { name: "林 心春 12/2(水) 勤務なし" });
    await expect(requested).toHaveTextContent("希望");
    const rowHeight = (requested.closest("li") as HTMLElement).getBoundingClientRect().height;
    await userEvent.click(requested);
    const pill = await canvas.findByRole("button", { name: "林 心春 12/2(水) 勤務あり、販売" });
    await expect((pill.closest("li") as HTMLElement).getBoundingClientRect().height).toBe(rowHeight);
    await expect(fulfillment).toHaveTextContent("充足 80%販売3/3製造1/2");

    // モーダルで製造に変えると、すぐ閉じて反映される。
    await userEvent.click(pill);
    const dialog = await body.findByRole("dialog", { name: "林 心春" });
    await expect(dialog).toHaveTextContent("12/2(水)");
    await expect(within(dialog).getByRole("radio", { name: "販売" })).toBeChecked();
    await userEvent.click(within(dialog).getByRole("radio", { name: "製造" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(await canvas.findByRole("button", { name: "林 心春 12/2(水) 勤務あり、製造" })).toHaveTextContent(
      "製造",
    );
    await expect(fulfillment).toHaveTextContent("充足 80%販売2/3製造2/2");

    // 「この日の希望がない人」は、最初はたたまれている。開いて入れると、最後に選んだ製造で入り、橙の点が付く。
    const toggle = await canvas.findByRole("button", { name: /^この日の希望がない人 4人/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByRole("button", { name: /^小林 悠斗 / })).not.toBeInTheDocument();
    await userEvent.click(toggle);
    await userEvent.click(await canvas.findByRole("button", { name: "小林 悠斗 12/2(水) 勤務なし" }));
    const unrequested = await canvas.findByRole("button", { name: "小林 悠斗 12/2(水) 勤務あり、製造" });
    await expect(unrequested.querySelector("[data-assignment-dot]")).toHaveAttribute("data-assignment-dot", "orange");
    await expect(await canvas.findByRole("button", { name: /^この日の希望がない人 3人/ })).toBeInTheDocument();
    // 名前の横の注意のアイコンは出さない。
    await expect(canvas.queryByRole("button", { name: /^確認事項\d+件$/ })).not.toBeInTheDocument();

    // モーダルには点の理由を出す。「削除」で割り当てを外すと、たたんだまとまりへ戻る。
    await userEvent.click(unrequested);
    const unrequestedDialog = await body.findByRole("dialog", { name: "小林 悠斗" });
    await expect(unrequestedDialog).toHaveTextContent("希望していない日です");
    await userEvent.click(within(unrequestedDialog).getByRole("button", { name: "削除" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(await canvas.findByRole("button", { name: /^この日の希望がない人 4人/ })).toBeInTheDocument();
    await expect(await canvas.findByRole("button", { name: "小林 悠斗 12/2(水) 勤務なし" })).toBeInTheDocument();
  },
};

/** その日の連絡事項がある人、希望がある人、希望外で割り当て済みの人、未提出の人の順に並べる。連絡事項は名前の下に全文を出す。 */
export const RowOrderInteractive: Story = {
  name: "Row Order Interactive",
  args: dateOnlyBoardDetailArgs,
  globals: mobileGlobals,
  beforeEach: clearRememberedDateOnlyBoardPosition,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const getNames = () =>
      Array.from(canvasElement.querySelectorAll("li[data-tour^='shift-row-']")).map(
        (row) => row.querySelector("p")?.textContent ?? "",
      );
    await selectSecondDay(canvasElement);
    await canvas.findByRole("button", { name: "山口 美月 12/2(水) 勤務あり、販売" });
    await expect(getNames()).toEqual(["山口 美月", "林 心春", "加藤 愛", "佐藤 健太", "伊藤 大輔"]);
    const note = await canvas.findByText(/^短めの時間だと助かります。.*16時には出たいです$/);
    await expect(note).toHaveAttribute("data-clarity-mask", "true");

    // 希望のない人へ入れると、希望のある人の後ろ、未提出の人の前に並ぶ。割り当て済みの人の並びは変わらない。
    await userEvent.click(await canvas.findByRole("button", { name: /^この日の希望がない人 4人/ }));
    await userEvent.click(await canvas.findByRole("button", { name: "山本 拓海 12/2(水) 勤務なし" }));
    await canvas.findByRole("button", { name: "山本 拓海 12/2(水) 勤務あり、販売" });
    await expect(getNames().slice(0, 6)).toEqual([
      "山口 美月",
      "林 心春",
      "加藤 愛",
      "佐藤 健太",
      "山本 拓海",
      "伊藤 大輔",
    ]);

    // 定休日は、リストを出さない。
    await userEvent.click(canvasElement.querySelector('[data-date-chip="2026-12-03"]') as HTMLElement);
    await expect(await canvas.findByText("この日は店舗の定休日のため、割当を編集できません。")).toBeInTheDocument();
    await expect(getNames()).toEqual([]);
  },
};
