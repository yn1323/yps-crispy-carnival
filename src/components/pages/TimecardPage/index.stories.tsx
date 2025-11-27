import type { Meta, StoryObj } from "@storybook/react-vite";
import { TimecardPage } from "@/src/components/pages/TimecardPage";

const meta = {
  title: "pages/TimecardPage",
  component: TimecardPage,
} satisfies Meta<typeof TimecardPage>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
