import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ShiftForm } from "../..";
import { fullscreenParameters, mobileGlobals, shiftFormDecorators } from "../../stories/shared";
import { timeDetailArgs } from "../detailStoryFixtures";

const meta = {
  title: "Features/Shift/ShiftForm/Time/SP/Overview Detail",
  component: ShiftForm,
  tags: ["vrt-mobile2"],
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const overviewArgs = { ...timeDetailArgs, initialViewMode: "overview" as const };

/** 名前の横に熟練度、時刻の横に休憩の印、下の行にポジションを出す。 */
export const Detail: Story = {
  args: overviewArgs,
  globals: mobileGlobals,
};

/** 閲覧専用でも、ポジションと休憩は出す。 */
export const DetailReadOnly: Story = {
  name: "Detail Read Only",
  args: { ...overviewArgs, isReadOnly: true, displayMode: "confirmed", onDetailModeChange: undefined },
  globals: mobileGlobals,
};

/** 人ごとの合計は、押したときだけ開く。時間指定は休憩を引いた時間で出す。 */
export const StaffTotalsInteractive: Story = {
  name: "Staff Totals Interactive",
  args: overviewArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const totals = await within(canvasElement).findByRole("region", { name: "人ごとの合計" });
    await expect(within(totals).queryByText("Aさん")).not.toBeInTheDocument();

    await userEvent.click(within(totals).getByRole("button", { name: "人ごとの合計" }));
    await within(totals).findByText("Aさん");
    // Aさんは「8時間−休憩1時間」と「8時間」で、計15時間。
    await expect(totals).toHaveTextContent("Aさん責任者15hBさん12.5hCさん4hDさん新人7hEさん-");
  },
};
