import type { Meta, StoryObj } from "@storybook/react-vite";
import { MembersDetailPage } from ".";

const meta = {
  title: "pages/Members/DetailPage",
  component: MembersDetailPage,
  args: {},
  parameters: {},
} satisfies Meta<typeof MembersDetailPage>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
