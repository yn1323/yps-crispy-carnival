import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccountDeletionAcceptedPage } from ".";

const meta = {
  title: "Pages/AccountDeletionAccepted",
  component: AccountDeletionAcceptedPage,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AccountDeletionAcceptedPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
