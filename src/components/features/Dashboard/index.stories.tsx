import type { Meta, StoryObj } from "@storybook/react-vite";
import { Dashboard } from "@/src/components/features/Dashboard";

const meta = {
  title: "features/Dashboard",
  component: Dashboard,
} satisfies Meta<typeof Dashboard>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
