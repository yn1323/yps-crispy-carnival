import type { Meta, StoryObj } from "@storybook/react-vite";
import { SectionHeading } from ".";

const meta = {
  title: "Features/LandingPage/SectionHeading",
  component: SectionHeading,
} satisfies Meta<typeof SectionHeading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  args: {
    phrases: ["毎月のシフト作成が、", "この4ステップで終わります。"],
    textAlign: "center",
  },
};

export const Mobile: Story = {
  args: {
    phrases: ["シフト希望表は、", "お店に合わせて", "3タイプから選べます。"],
    textAlign: "center",
  },
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
