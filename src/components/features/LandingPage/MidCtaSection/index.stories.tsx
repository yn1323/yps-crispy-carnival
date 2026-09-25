import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { MidCtaSection } from ".";

const meta = {
  title: "Features/LandingPage/MidCtaSection",
  component: MidCtaSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof MidCtaSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { level: 2 })).toHaveTextContent("スタッフへの連絡はシフトリに任せよう");
    await expect(canvas.getByRole("link", { name: "無料ではじめる" })).toHaveAttribute("href", "/signup");
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
