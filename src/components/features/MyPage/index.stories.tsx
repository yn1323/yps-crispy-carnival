import type { Meta, StoryObj } from "@storybook/react-vite";
import { MyPage } from "@/src/components/features/MyPage";

const meta = {
  title: "features/MyPage",
  component: MyPage,
} satisfies Meta<typeof MyPage>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
