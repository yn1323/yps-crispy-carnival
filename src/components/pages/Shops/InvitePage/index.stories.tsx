import type { Meta, StoryObj } from "@storybook/react-vite";
import { InvitePage } from "@/src/components/pages/Shops/InvitePage";

const meta = {
  title: "pages/Shops/InvitePage",
  component: InvitePage,
} satisfies Meta<typeof InvitePage>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
