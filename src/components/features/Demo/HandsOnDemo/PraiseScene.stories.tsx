import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { PraiseScene } from "./PraiseScene";

const meta = {
  title: "Features/Demo/HandsOnDemo/PraiseScene",
  component: PraiseScene,
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

/** シフトの完成を祝う。次の行動は、登録へ進む1つだけにする。 */
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
