import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ShiftForm } from "../..";
import { fullscreenParameters, mobileGlobals, shiftFormDecorators } from "../../stories/shared";
import { readStaffingCalls, StaffingHarness } from "../../stories/staffingHarness";
import { dateOnlyDetailArgs, dateOnlyDetailDays, dateOnlyDetailTemplates } from "../detailStoryFixtures";

const meta = {
  title: "Features/Shift/ShiftForm/Date Only/SP/Daily Detail",
  component: ShiftForm,
  tags: ["vrt-mobile2"],
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 複数ポジション、必要人数（足りない人数、見習いだけの印）、休憩、熟練度、仮の勤務を1画面で確かめる。 */
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
    await expect(staffing).toHaveTextContent("ホール2/2キッチン1/2 ▲1レジ1/1見習いだけ");

    // 選んだポジションで入る。
    await userEvent.click(await canvas.findByRole("radio", { name: "キッチン" }));
    await userEvent.click(await canvas.findByRole("button", { name: "吉田 三郎 6/2(火) 勤務なし" }));
    await expect(await canvas.findByRole("button", { name: "吉田 三郎 6/2(火) 勤務あり、キッチン" })).toHaveTextContent(
      "キッチン",
    );
    await expect(staffing).toHaveTextContent("ホール2/2キッチン2/2レジ1/1見習いだけ");

    // 別のポジションを選んで勤務のあるボタンを押すと、外れずに入れ替わる。
    await userEvent.click(await canvas.findByRole("radio", { name: "レジ" }));
    await userEvent.click(await canvas.findByRole("button", { name: "吉田 三郎 6/2(火) 勤務あり、キッチン" }));
    await expect(await canvas.findByRole("button", { name: "吉田 三郎 6/2(火) 勤務あり、レジ" })).toHaveTextContent(
      "レジ",
    );
    await expect(staffing).toHaveTextContent("ホール2/2キッチン1/2 ▲1レジ2/1 ＋1");

    // 同じポジションでもう一度押すと外れる。
    await userEvent.click(await canvas.findByRole("button", { name: "吉田 三郎 6/2(火) 勤務あり、レジ" }));
    await expect(await canvas.findByRole("button", { name: "吉田 三郎 6/2(火) 勤務なし" })).toBeInTheDocument();
    await expect(staffing).toHaveTextContent("ホール2/2キッチン1/2 ▲1レジ1/1見習いだけ");
  },
};

/** スマートフォンでも、「この日だけ人数を変える」で1日の人数を数字で直し、その日だけの必要人数として保存できる。 */
export const CustomRequirementsInteractive: Story = {
  name: "Custom Requirements Interactive",
  args: dateOnlyDetailArgs,
  render: (args) => <StaffingHarness {...args} templates={dateOnlyDetailTemplates} weekdayDays={dateOnlyDetailDays} />,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const staffing = await canvas.findByRole("region", { name: "人数" });

    await userEvent.click(within(staffing).getByRole("button", { name: "この日のテンプレート: 平日" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "この日だけ人数を変える" }));
    const dialog = within(await body.findByRole("dialog", { name: "6月2日（火）の必要人数" }));
    const kitchenInput = dialog.getByRole("spinbutton", { name: "1日のキッチンの必要人数" });
    await expect(kitchenInput).toHaveValue(2);

    await userEvent.clear(kitchenInput);
    await userEvent.type(kitchenInput, "1");
    await userEvent.click(dialog.getByRole("button", { name: "保存する" }));

    await waitFor(() => expect(body.queryByRole("dialog", { name: "6月2日（火）の必要人数" })).not.toBeInTheDocument());
    await expect((await readStaffingCalls(canvasElement)).calls).toEqual([
      {
        mutation: "saveDayCustomRequirements",
        date: "2026-06-02",
        requirements: {
          kind: "dateOnly",
          counts: [
            { positionId: "hall", count: 2 },
            { positionId: "kitchen", count: 1 },
            { positionId: "register", count: 1 },
          ],
        },
      },
    ]);
    // キッチンの不足がなくなり、その日だけ変えた日として出る。
    await expect(
      await within(staffing).findByRole("button", { name: "この日のテンプレート: この日だけ変更" }),
    ).toBeInTheDocument();
    await expect(staffing).toHaveTextContent("ホール2/2キッチン1/1レジ1/1見習いだけ");
    await expect(within(staffing).getByText("不足なし")).toBeInTheDocument();
  },
};
