import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { AccountEmailMismatchRecovery } from "./AccountEmailMismatchRecovery";

const meta = {
  title: "Features/AuthenticatedApp/AccountEmailMismatchRecovery",
  component: AccountEmailMismatchRecovery,
  parameters: { layout: "fullscreen" },
  args: {
    clerkEmail: "current-login@example.com",
    convexEmail: "registered@example.com",
  },
} satisfies Meta<typeof AccountEmailMismatchRecovery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "シフトリの登録メールをログインにも使う" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "現在のログインメールをシフトリへ反映" })).toBeInTheDocument();
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};
