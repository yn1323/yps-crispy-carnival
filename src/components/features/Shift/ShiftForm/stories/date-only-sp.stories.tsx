import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ShiftForm } from "..";
import {
  dateOnlyArgs,
  dateOnlyValidationWarningArgs,
  fullscreenParameters,
  mobileGlobals,
  shiftFormDecorators,
} from "./shared";

const meta = {
  title: "Features/Shift/ShiftForm/Date Only/SP",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Daily: Story = {
  args: dateOnlyArgs,
  globals: mobileGlobals,
};

export const DailyWithValidationWarnings: Story = {
  name: "Daily With Validation Warnings",
  args: dateOnlyValidationWarningArgs,
  globals: mobileGlobals,
};

export const Overview: Story = {
  args: { ...dateOnlyArgs, initialViewMode: "overview" },
  globals: mobileGlobals,
};

export const OverviewWithValidationWarnings: Story = {
  name: "Overview With Validation Warnings",
  args: { ...dateOnlyValidationWarningArgs, initialViewMode: "overview" },
  globals: mobileGlobals,
};

export const Interactive: Story = {
  args: dateOnlyArgs,
  globals: mobileGlobals,
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

    await expect(await canvas.findByRole("tab", { name: "日別" })).toBeInTheDocument();
    await expect(await canvas.findByRole("tab", { name: "一覧" })).toBeInTheDocument();
    await expect(canvas.queryByLabelText("6/1(月)を表示")).not.toBeInTheDocument();
    await expect(canvas.queryByText("希望 2人")).not.toBeInTheDocument();
    await expect((await canvas.findAllByText("合計")).length).toBeGreaterThan(0);

    const tanakaSecond = await findVisibleByLabelText("田中 太郎 6/2(火) 勤務あり");
    await userEvent.click(tanakaSecond);
    await expect(await findVisibleByLabelText("田中 太郎 6/2(火) 勤務なし")).toBeInTheDocument();

    await userEvent.click(await canvas.findByRole("tab", { name: "一覧" }));
    await expect(await canvas.findByText("6/1 – 6/7")).toBeInTheDocument();
    await expect((await canvas.findAllByText("期間外")).length).toBeGreaterThan(0);
    await expect((await canvas.findAllByText("佐藤 花子")).length).toBeGreaterThan(0);
    await expect((await canvas.findAllByText("勤務なし")).length).toBeGreaterThan(0);

    await userEvent.click(await canvas.findByLabelText("6/2(火)の日別を表示"));
    await expect(await canvas.findByRole("tab", { name: "日別" })).toHaveAttribute("aria-selected", "true");
    await expect(await findVisibleByLabelText("田中 太郎 6/2(火) 勤務なし")).toBeInTheDocument();
  },
};
