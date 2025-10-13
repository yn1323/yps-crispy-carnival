import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemberDetail } from ".";

const meta = {
  title: "features/Member/MemberDetail",
  component: MemberDetail,
  args: {},
  parameters: {},
} satisfies Meta<typeof MemberDetail>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
