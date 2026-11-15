import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ShiftForm } from "../..";
import { fullscreenParameters, mobileGlobals, shiftFormDecorators } from "../../stories/shared";
import { shiftTypeDetailArgs } from "../detailStoryFixtures";

const meta = {
  title: "Features/Shift/ShiftForm/Shift Type/SP/Daily Detail",
  component: ShiftForm,
  tags: ["vrt-mobile2"],
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 複数ポジション、日の型あり（不足あり）、休憩、熟練度、仮の勤務を1画面で確かめる。 */
export const Detail: Story = {
  args: shiftTypeDetailArgs,
  globals: mobileGlobals,
};

/** 閲覧専用でも、ポジションと休憩は出す。人数は、スタッフ向けの表示のため従来の件数のままにする。 */
export const DetailReadOnly: Story = {
  name: "Detail Read Only",
  args: { ...shiftTypeDetailArgs, isReadOnly: true, displayMode: "confirmed", onDetailModeChange: undefined },
  globals: mobileGlobals,
};

/** 選んだポジションで勤務が入り、別のポジションを選んで押すと入れ替わり、人数も変わる。 */
export const AssignInteractive: Story = {
  name: "Assign Interactive",
  args: shiftTypeDetailArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const staffing = await canvas.findByRole("region", { name: "人数" });
    await expect(staffing).toHaveTextContent("早番ホール1/2▲1キッチン1/1");

    // 選んだポジションで入る。
    await userEvent.click(await canvas.findByRole("radio", { name: "キッチン" }));
    await userEvent.click(await canvas.findByRole("button", { name: "山田 一郎 早番 勤務なし" }));
    await expect(await canvas.findByRole("button", { name: "山田 一郎 早番 勤務あり、キッチン" })).toHaveTextContent(
      "キッチン",
    );
    await expect(staffing).toHaveTextContent("早番ホール1/2▲1キッチン2/1");

    // 別のポジションを選んで勤務のあるボタンを押すと、外れずに入れ替わる。
    await userEvent.click(await canvas.findByRole("radio", { name: "ホール" }));
    await userEvent.click(await canvas.findByRole("button", { name: "山田 一郎 早番 勤務あり、キッチン" }));
    await expect(await canvas.findByRole("button", { name: "山田 一郎 早番 勤務あり、ホール" })).toHaveTextContent(
      "ホール",
    );
    await expect(staffing).toHaveTextContent("早番ホール2/2キッチン1/1");

    // 同じポジションでもう一度押すと外れる。
    await userEvent.click(await canvas.findByRole("button", { name: "山田 一郎 早番 勤務あり、ホール" }));
    await expect(await canvas.findByRole("button", { name: "山田 一郎 早番 勤務なし" })).toBeInTheDocument();
    await expect(staffing).toHaveTextContent("早番ホール1/2▲1キッチン1/1");
  },
};

/** 休憩を選んでいる間は、勤務のあるボタンを押すと休憩の編集が開き、勤務は外れない。 */
export const BreakToolInteractive: Story = {
  name: "Break Tool Interactive",
  args: shiftTypeDetailArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("radio", { name: "休憩" }));
    await userEvent.click(await canvas.findByRole("button", { name: "佐藤 花子 中番 勤務あり、キッチン" }));

    const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: /^佐藤 花子の休憩/ });
    await userEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    await expect(await canvas.findByRole("button", { name: "佐藤 花子 中番 勤務あり、キッチン" })).toBeInTheDocument();
  },
};
