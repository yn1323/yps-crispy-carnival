import type { Meta, StoryObj } from "@storybook/react-vite";
import { MembershipRemovalImpact } from ".";

const meta = {
  title: "Shared/MembershipRemovalImpact",
  component: MembershipRemovalImpact,
  parameters: { layout: "padded" },
  args: { heading: "もて", badgeLabel: "店舗から外す" },
} satisfies Meta<typeof MembershipRemovalImpact>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Checking: Story = {
  args: { statusMessage: "変更内容を確認しています…" },
};
