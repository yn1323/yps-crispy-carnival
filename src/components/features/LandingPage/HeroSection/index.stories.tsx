import type { Meta, StoryObj } from "@storybook/react-vite";
import { HeroSection } from ".";

const meta = {
  title: "Features/LandingPage/HeroSection",
  component: HeroSection,
  parameters: {
    layout: "fullscreen",
  },
  play: async ({ canvasElement }) => {
    // async画像のデコード後に撮影し、画像の影が描画途中の状態で固定されるのを防ぐ。
    await Promise.all(Array.from(canvasElement.querySelectorAll("img"), (image) => image.decode()));
  },
} satisfies Meta<typeof HeroSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
