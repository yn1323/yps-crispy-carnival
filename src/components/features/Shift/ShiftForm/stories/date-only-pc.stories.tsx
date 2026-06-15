import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ShiftForm } from "..";
import {
  dateOnlyArgs,
  dateOnlyValidationWarningArgs,
  desktopGlobals,
  fullscreenParameters,
  shiftFormDecorators,
} from "./shared";

const meta = {
  title: "Features/Shift/ShiftForm/Date Only/PC",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: dateOnlyArgs,
  globals: desktopGlobals,
};

// 確認事項（ワーニング）: 日ごと募集レイアウトでのDateRailバッジ＋スタッフ名セルアイコン表示確認
// （日ごとは時間・勤務区分の概念がないため NOT_SUBMITTED / OFF_REQUEST のみ）
export const WithValidationWarnings: Story = {
  name: "With Validation Warnings",
  args: dateOnlyValidationWarningArgs,
  globals: desktopGlobals,
};

export const Interactive: Story = {
  args: dateOnlyArgs,
  globals: desktopGlobals,
  parameters: {
    chromatic: { disableSnapshot: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const findVisibleByLabelText = async (label: string) => {
      const elements = await canvas.findAllByLabelText(label);
      const visible = elements.find((element) => element.getClientRects().length > 0);
      await expect(visible).toBeDefined();
      return visible as HTMLElement;
    };

    await expect(canvas.queryByRole("tab", { name: "日別" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("tab", { name: "一覧" })).not.toBeInTheDocument();
    await expect(canvas.queryByText("3日")).not.toBeInTheDocument();
    await expect(canvas.queryByText("休み")).not.toBeInTheDocument();
    await expect(await findVisibleByLabelText("田中 太郎 6/1(月) 期間外")).toBeInTheDocument();
    await expect(await findVisibleByLabelText("田中 太郎 6/7(日) 勤務なし")).toHaveTextContent("-");
    await expect((await canvas.findAllByText("6/2")).length).toBeGreaterThan(1);
    await expect((await canvas.findAllByText("希望なし")).length).toBeGreaterThan(0);

    const tanakaJunSecond = await findVisibleByLabelText("田中 太郎 6/2(火) 勤務あり");
    await userEvent.click(tanakaJunSecond);
    await expect(await findVisibleByLabelText("田中 太郎 6/2(火) 勤務なし")).toBeInTheDocument();

    const yamadaJunThird = await findVisibleByLabelText("山田 一郎 6/3(水) 勤務なし");
    await userEvent.click(yamadaJunThird);
    await expect(await findVisibleByLabelText("山田 一郎 6/3(水) 勤務あり")).toBeInTheDocument();

    await userEvent.click(await canvas.findByRole("button", { name: "6/8-6/14を表示" }));
    const tanakaJunEighth = await findVisibleByLabelText("田中 太郎 6/8(月) 勤務なし");
    await userEvent.click(tanakaJunEighth);
    await expect(await findVisibleByLabelText("田中 太郎 6/8(月) 勤務あり")).toBeInTheDocument();
    await expect(await findVisibleByLabelText("田中 太郎 6/9(火) 期間外")).toBeInTheDocument();
    await expect((await canvas.findAllByText("希望なし")).length).toBeGreaterThan(1);
  },
};
