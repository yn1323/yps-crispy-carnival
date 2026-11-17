import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ShiftForm } from "../..";
import { fullscreenParameters, mobileGlobals, shiftFormDecorators } from "../../stories/shared";
import { dateOnlyDetailArgs } from "../detailStoryFixtures";

const meta = {
  title: "Features/Shift/ShiftForm/Date Only/SP/Overview Detail",
  component: ShiftForm,
  tags: ["vrt-mobile2"],
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const overviewArgs = { ...dateOnlyDetailArgs, initialViewMode: "overview" as const };

/** 名前の横に熟練度、右端にポジションと休憩の印を出す。 */
export const Detail: Story = {
  args: overviewArgs,
  globals: mobileGlobals,
};

/** 人ごとの合計は、日付選択では出勤日数で出す。 */
export const StaffTotalsInteractive: Story = {
  name: "Staff Totals Interactive",
  args: overviewArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const totals = await within(canvasElement).findByRole("region", { name: "人ごとの合計" });
    await userEvent.click(within(totals).getByRole("button", { name: "人ごとの合計" }));
    await within(totals).findByText("田中 太郎");
    // 熟練度の印は、「入れるもの」で選んでいるポジション（選ぶ前はホール）での値を出す。
    await expect(totals).toHaveTextContent(
      "田中 太郎ホール：リーダー2日佐藤 花子1日吉田 三郎-山田 一郎2日鈴木 次郎ホール：担当外-中村 五郎1日",
    );
  },
};
