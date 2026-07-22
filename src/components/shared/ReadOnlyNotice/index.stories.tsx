import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReadOnlyNotice } from ".";

const meta = {
  title: "Shared/ReadOnlyNotice",
  component: ReadOnlyNotice,
  parameters: { layout: "padded" },
  args: {
    title: "店舗情報は閲覧のみです",
    description: "現在、この店舗の情報を変更できません。",
  },
} satisfies Meta<typeof ReadOnlyNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const InDialog: Story = {
  args: {
    title: "この店舗は閲覧のみです",
    borderRadius: "lg",
  },
};
