import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ShopDetailSkeleton, ShopDetailView } from ".";
import type { ShopDetailData } from "./types";

const shop: ShopDetailData = {
  id: "shop-shibuya",
  name: "スーパー美味しいカフェ新宿店",
  staffCount: 8,
  canDelete: true,
};

const meta = {
  title: "Features/ShopDetail",
  component: ShopDetailView,
  parameters: { layout: "padded" },
  args: {
    shop,
    activeTab: "information",
    isDeleting: false,
    onBack: () => {},
    onTabChange: () => {},
    onDelete: async () => true,
  },
} satisfies Meta<typeof ShopDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Information: Story = {};

export const Loading: Story = {
  render: () => <ShopDetailSkeleton />,
};

export const Settings: Story = {
  args: { activeTab: "settings" },
};

export const DeletionUnavailable: Story = {
  args: {
    activeTab: "settings",
    shop: {
      ...shop,
      canDelete: false,
      deleteDisabledReason: "最後の店舗は削除できません。",
    },
  },
};

export const DeleteConfirmationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: { activeTab: "settings" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "削除" }));
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("alertdialog", { name: "店舗を削除" });
    await waitFor(() =>
      expect(within(dialog).getByText("「スーパー美味しいカフェ新宿店」を削除しますか？")).toBeVisible(),
    );
    await expect(within(dialog).getByRole("button", { name: "閉じる" })).toHaveFocus();
    const confirmButton = within(dialog).getByRole("button", { name: "店舗を削除" });
    await userEvent.click(confirmButton);
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).queryByRole("alertdialog", { name: "店舗を削除" }),
      ).not.toBeInTheDocument(),
    );
  },
};

function PermissionLossHarness() {
  const [canDelete, setCanDelete] = useState(true);
  const disabledReason = "最新の権限では、この店舗を削除できません。";

  return (
    <>
      <button type="button" onClick={() => setCanDelete(false)}>
        削除権限を失う
      </button>
      <ShopDetailView
        shop={{ ...shop, canDelete, deleteDisabledReason: canDelete ? undefined : disabledReason }}
        activeTab="settings"
        isDeleting={false}
        onBack={() => {}}
        onTabChange={() => {}}
        onDelete={async () => false}
      />
    </>
  );
}

export const DeletionPermissionLossBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <PermissionLossHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const losePermissionButton = canvas.getByRole("button", { name: "削除権限を失う" });
    await userEvent.click(canvas.getByRole("button", { name: "削除" }));
    await body.findByRole("alertdialog", { name: "店舗を削除" });

    losePermissionButton.click();

    await waitFor(() => expect(body.queryByRole("alertdialog", { name: "店舗を削除" })).not.toBeInTheDocument());
    await expect(await canvas.findByText("最新の権限では、この店舗を削除できません。")).toBeVisible();
  },
};

export const MobileInformation: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const MobileSettings: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: { activeTab: "settings" },
};
