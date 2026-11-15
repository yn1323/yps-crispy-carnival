import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ShiftForm } from "../..";
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

/** 複数ポジション、日の型あり（不足あり）、休憩、熟練度、仮の勤務を1画面で確かめる。 */
export const Detail: Story = {
  args: dateOnlyDetailArgs,
  globals: mobileGlobals,
};

/** 閲覧専用でも、ポジションと休憩は出す。人数は、スタッフ向けの表示のため従来の合計のままにする。 */
export const DetailReadOnly: Story = {
  name: "Detail Read Only",
  args: { ...dateOnlyDetailArgs, isReadOnly: true, displayMode: "confirmed", onDetailModeChange: undefined },
  globals: mobileGlobals,
};

/** 選んだポジションで勤務が入り、別のポジションを選んで押すと入れ替わり、人数も変わる。 */
export const AssignInteractive: Story = {
  name: "Assign Interactive",
  args: dateOnlyDetailArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const staffing = await canvas.findByRole("region", { name: "人数" });
    await expect(staffing).toHaveTextContent("ホール2/2キッチン1/2▲1レジ1/1");

    // 選んだポジションで入る。
    await userEvent.click(await canvas.findByRole("radio", { name: "キッチン" }));
    await userEvent.click(await canvas.findByRole("button", { name: "吉田 三郎 6/2(火) 勤務なし" }));
    await expect(await canvas.findByRole("button", { name: "吉田 三郎 6/2(火) 勤務あり、キッチン" })).toHaveTextContent(
      "キッチン",
    );
    await expect(staffing).toHaveTextContent("ホール2/2キッチン2/2レジ1/1");

    // 別のポジションを選んで勤務のあるボタンを押すと、外れずに入れ替わる。
    await userEvent.click(await canvas.findByRole("radio", { name: "レジ" }));
    await userEvent.click(await canvas.findByRole("button", { name: "吉田 三郎 6/2(火) 勤務あり、キッチン" }));
    await expect(await canvas.findByRole("button", { name: "吉田 三郎 6/2(火) 勤務あり、レジ" })).toHaveTextContent(
      "レジ",
    );
    await expect(staffing).toHaveTextContent("ホール2/2キッチン1/2▲1レジ2/1");

    // 同じポジションでもう一度押すと外れる。
    await userEvent.click(await canvas.findByRole("button", { name: "吉田 三郎 6/2(火) 勤務あり、レジ" }));
    await expect(await canvas.findByRole("button", { name: "吉田 三郎 6/2(火) 勤務なし" })).toBeInTheDocument();
    await expect(staffing).toHaveTextContent("ホール2/2キッチン1/2▲1レジ1/1");
  },
};
