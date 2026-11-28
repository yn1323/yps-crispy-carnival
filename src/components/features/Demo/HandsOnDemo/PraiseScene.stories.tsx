import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { PraiseScene } from "./PraiseScene";

const meta = {
  title: "Features/Demo/HandsOnDemo/PraiseScene",
  component: PraiseScene,
  args: { onContinue: () => {} },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ position: "relative", height: "100dvh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PraiseScene>;

export default meta;
type Story = StoryObj<typeof meta>;

/** シフトの完成を祝う。主の行動は登録へ進むことで、白抜きのボタンからシフト表へ戻って操作を続けることもできる。 */
export const Praise: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("link", { name: "シフトリを使ってみる" })).toHaveAttribute("href", "/signup");
  },
};

export const PraiseMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
