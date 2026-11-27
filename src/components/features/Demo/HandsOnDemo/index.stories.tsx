import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { HandsOnDemo } from ".";

const meta = {
  title: "Features/Demo/HandsOnDemo",
  component: HandsOnDemo,
  args: {
    variant: "simple",
    // 撮るたびに日付が変わらないよう、募集の初日を固定する。
    periodStart: "2026-11-30",
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof HandsOnDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 始まりの画面。まっさらな画面の中央に、募集を開始するボタンだけを置く。 */
export const Start: Story = {};

export const StartMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

/** 募集を開始すると、提出依頼を送る場面に進み、上の段の手順は1のままにする。 */
export const StartsRecruitment: Story = {
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "11/30〜12/13の募集を開始" }));

    await expect(await canvas.findByRole("status")).toHaveTextContent("提出依頼を自動で送ります");
    await expect(canvas.getByRole("listitem", { current: "step" })).toHaveTextContent("希望シフトを集める");
  },
};
