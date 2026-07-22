import { Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { DeletionActionSection } from ".";

const meta = {
  title: "Shared/DeletionActionSection",
  component: DeletionActionSection,
  parameters: { layout: "padded" },
  args: {
    title: "店舗を削除する",
    description: "この店舗を利用できない状態にします。この操作は元に戻せません。",
    actionLabel: "削除",
    canDelete: true,
    onDelete: () => {},
  },
} satisfies Meta<typeof DeletionActionSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
  args: {
    canDelete: false,
    disabledReason: "最後の店舗は削除できません。",
  },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button", { name: "削除" });

    await expect(button).toBeDisabled();
    await expect(button).toHaveAccessibleDescription("最後の店舗は削除できません。");
  },
};

export const WithFollowUpContent: Story = {
  args: {
    children: (
      <Text borderRadius="lg" bg="red.50" p={3} fontSize="sm">
        削除前の確認内容をここに表示できます。
      </Text>
    ),
  },
};
