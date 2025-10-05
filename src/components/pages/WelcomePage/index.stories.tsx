import type { Meta, StoryObj } from "@storybook/react-vite";
import { WelcomePage } from "@/src/components/pages/WelcomePage";

const meta = {
  title: "pages/WelcomePage",
  component: WelcomePage,
} satisfies Meta<typeof WelcomePage>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
