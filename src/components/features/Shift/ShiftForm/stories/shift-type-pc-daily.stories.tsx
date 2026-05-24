import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ShiftForm } from "..";
import { desktopGlobals, fullscreenParameters, shiftFormDecorators, shiftTypeArgs } from "./shared";

const meta = {
  title: "Features/Shift/ShiftForm/Shift Type/PC/Daily",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const findVisibleByLabelText = async (canvas: ReturnType<typeof within>, label: string) => {
  const elements: HTMLElement[] = await canvas.findAllByLabelText(label);
  const visibleElement = elements.find((element) => element.getClientRects().length > 0);
  await expect(visibleElement).toBeDefined();
  return visibleElement as HTMLElement;
};

export const Basic: Story = {
  args: shiftTypeArgs,
  globals: desktopGlobals,
};

export const Interactive: Story = {
  args: shiftTypeArgs,
  globals: desktopGlobals,
  parameters: {
    chromatic: { disableSnapshot: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByRole("tab", { name: /21/ }));
    await expect((await canvas.findAllByText("21:00〜翌9:00")).length).toBeGreaterThan(0);
    const yamadaMorningOff = await findVisibleByLabelText(canvas, "山田 一郎 早番 勤務なし");
    await expect(yamadaMorningOff).toBeInTheDocument();
    await userEvent.click(yamadaMorningOff);
    await expect(await findVisibleByLabelText(canvas, "山田 一郎 早番 勤務あり")).toBeInTheDocument();

    await expect((await canvas.findAllByText("2人")).length).toBeGreaterThan(0);
    await userEvent.click(await findVisibleByLabelText(canvas, "田中 太郎 早番 勤務あり"));
    await expect(await findVisibleByLabelText(canvas, "田中 太郎 早番 勤務なし")).toBeInTheDocument();
  },
};
