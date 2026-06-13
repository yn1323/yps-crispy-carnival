import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm } from "..";
import {
  allPatternsArgs,
  emptyOrAllUnsubmittedArgs,
  expectVisibleText,
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
  play: async ({ canvasElement }) => {
    await expectVisibleText(canvasElement, "21:00–翌5:00");
    await expectVisibleText(canvasElement, "翌5:00");
  },
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
    await expectVisibleText(canvasElement, "1月21日");
    const issueRow = Array.from(canvasElement.querySelectorAll<HTMLElement>('[role="button"]')).find((element) =>
      element.textContent?.includes("1/23(金) Dさん"),
    );
    issueRow?.click();
    await expectVisibleText(canvasElement, "1月23日");
  },
};

// 確認事項（ワーニング）: オレンジパネル＋DateRailオレンジバッジ＋行のオレンジハイライト
export const TimeWithValidationWarnings: Story = {
  name: "With Validation Warnings",
  args: validationWarningArgs,
};

// エラーと確認事項が同時にあるとき（赤パネルが上、オレンジパネルが下）
export const TimeWithErrorsAndWarnings: Story = {
  name: "With Errors And Warnings",
  args: validationErrorAndWarningArgs,
};
