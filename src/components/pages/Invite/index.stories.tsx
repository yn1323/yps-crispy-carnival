import type { Meta, StoryObj } from "@storybook/react-vite";
import { InvitePage } from "./index";

const meta = {
  title: "pages/InvitePage",
  component: InvitePage,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof InvitePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    token: "sample-token-12345",
  },
};

export const NoToken: Story = {
  args: {
    token: "",
  },
};
