import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ShiftForm } from "..";
import {
  allPatternsArgs,
  emptyOrAllUnsubmittedArgs,
  fullscreenParameters,
  halfHourBusinessHoursArgs,
  overnightArgs,
  shiftFormDecorators,
  validationErrorAndWarningArgs,
  validationErrorArgs,
  validationWarningArgs,
} from "./shared";

const meta = {
  title: "Features/Shift/ShiftForm/Time/PC/Daily",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TimeBasic: Story = {
  name: "Basic",
  args: allPatternsArgs,
};

export const TimeHalfHourBusinessHours: Story = {
  name: "Half Hour Business Hours",
  args: halfHourBusinessHoursArgs,
};

export const TimeOvernight: Story = {
  name: "Overnight",
  args: overnightArgs,
};

export const TimeEmptyOrAllUnsubmitted: Story = {
  name: "Empty Or All Unsubmitted",
  args: emptyOrAllUnsubmittedArgs,
};

export const TimeReadOnly: Story = {
  name: "Read Only",
  args: { ...allPatternsArgs, isReadOnly: true, currentStaffId: "staff1" },
};

export const TimeConfirmed: Story = {
  name: "Confirmed",
  args: { ...allPatternsArgs, isConfirmed: true },
};

// 確定前バリデーションエラー: パネル＋DateRailバッジ＋該当行ハイライトの統合表示
export const TimeWithValidationErrors: Story = {
  name: "With Validation Errors",
  args: validationErrorArgs,
};

// エラー行クリックで該当日付の日別ビューへジャンプする
export const TimeValidationErrorJump: Story = {
  name: "Validation Error Jump",
  args: validationErrorArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("1月21日")).toBeVisible();

    await userEvent.click(await canvas.findByRole("button", { name: /1\/23\(金\) Dさん/ }));

    await expect(await canvas.findByText("1月23日")).toBeVisible();
  },
};

// 確認事項（ワーニング）: DateRailオレンジバッジ＋スタッフ名セルの理由アイコン
export const TimeWithValidationWarnings: Story = {
  name: "With Validation Warnings",
  args: validationWarningArgs,
};

// エラーと確認事項が同時にあるとき（エラーパネル＋ワーニングのバッジ/理由アイコン）
export const TimeWithErrorsAndWarnings: Story = {
  name: "With Errors And Warnings",
  args: validationErrorAndWarningArgs,
};
