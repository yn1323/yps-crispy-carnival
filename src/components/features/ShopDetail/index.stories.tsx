import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ShopDetailSkeleton, ShopDetailView } from ".";
import type { ShopDetailData, ShopDetailPerson } from "./types";

const shop: ShopDetailData = {
  id: "shop-shibuya",
  name: "スーパー美味しいカフェ新宿店",
  regularClosedDays: ["sun"],
  submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  canUpdateSettings: true,
  canDelete: true,
};

const staffs: ShopDetailPerson[] = [
  {
    id: "person-manager",
    name: "田中 太郎",
    managerRole: "active",
    isLineConnected: true,
    shopNames: ["スーパー美味しいカフェ新宿店", "めっちゃおいしいカフェ渋谷店"],
    shopIds: ["shop-shibuya", "shop-shinjuku"],
  },
  {
    id: "person-staff",
    name: "佐藤 花子",
    managerRole: "none",
    isLineConnected: false,
    shopNames: ["スーパー美味しいカフェ新宿店"],
    shopIds: ["shop-shibuya"],
  },
];

const closedSettingsDialog = {
  isOpen: false,
  onOpenChange: () => {},
  open: () => {},
  close: () => {},
};

const meta = {
  title: "Features/ShopDetail",
  component: ShopDetailView,
  decorators: [
    (Story) => (
      <Box maxW="1024px" mx="auto">
        <Story />
      </Box>
    ),
  ],
  parameters: { layout: "padded" },
  args: {
    shop,
    staffs,
    settingsDialog: closedSettingsDialog,
    isDeleting: false,
    onBack: () => {},
    onOpenUser: () => {},
    onUpdateSettings: () => {},
    onDelete: async () => true,
  },
} satisfies Meta<typeof ShopDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  render: () => <ShopDetailSkeleton />,
};

export const NoStaffs: Story = {
  args: { staffs: [] },
};

export const ReadOnly: Story = {
  args: {
    shop: {
      ...shop,
      canUpdateSettings: false,
      settingsDisabledReason: "現在の契約状態では、店舗情報を変更できません。",
      canDelete: false,
      deleteDisabledReason: "現在の契約状態では、この店舗を削除できません。",
    },
  },
};

export const LongText: Story = {
  args: {
    shop: {
      ...shop,
      name: "駅前商業施設フードコート内スーパー美味しいカフェ新宿中央東口店",
    },
    staffs: [
      {
        ...staffs[0],
        name: "とても長い氏名を持つ管理者ユーザー田中太郎",
      },
    ],
  },
};

export const DeletionUnavailable: Story = {
  args: {
    shop: {
      ...shop,
      canDelete: false,
      deleteDisabledReason: "最後の店舗は削除できません。",
    },
  },
};

export const SettingsDialog: Story = {
  args: {
    settingsDialog: { ...closedSettingsDialog, isOpen: true },
  },
};

export const StaffAccordionOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /スタッフ一覧を見る/ });
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const staffButton = await canvas.findByRole("button", { name: "佐藤 花子のスタッフ詳細を開く" });
    await waitFor(() => expect(staffButton).toBeVisible());
  },
};

export const EmptyStaffAccordionOpen: Story = {
  args: { staffs: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /スタッフ一覧を見る/ });
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const emptyMessage = await canvas.findByText("この店舗に所属するスタッフはいません。");
    await waitFor(() => expect(emptyMessage).toBeVisible());
  },
};

export const SettingsDialogBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractionHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "編集する" }));
    const dialog = await body.findByRole("dialog", { name: "店舗設定" });
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(body.queryByRole("dialog", { name: "店舗設定" })).not.toBeInTheDocument());
  },
};

export const SettingsBatchUpdateBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractionHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "編集する" }));
    const dialog = await body.findByRole("dialog", { name: "店舗設定" });
    const form = within(dialog);

    const shopName = form.getByRole("textbox", { name: "お店の名前" });
    await userEvent.clear(shopName);
    await userEvent.type(shopName, "更新後の新宿店");
    await userEvent.click(form.getByRole("button", { name: "次へ" }));

    await form.findByText("希望シフトの集め方");
    await userEvent.click(form.getByRole("button", { name: "次へ" }));

    await form.findByText("シフト開始時間");
    await userEvent.click(form.getByRole("button", { name: "次へ" }));

    await form.findByText("現在の設定: 毎週 日");
    await userEvent.click(form.getByRole("button", { name: "変更を保存" }));

    await waitFor(() => expect(canvas.getByLabelText("操作結果")).toHaveTextContent("update:更新後の新宿店|time|sun"));
  },
};

export const StaffNavigationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractionHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /スタッフ一覧を見る/ });
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const staffButton = await canvas.findByRole("button", { name: "佐藤 花子のスタッフ詳細を開く" });
    await waitFor(() => expect(staffButton).toBeVisible());
    await userEvent.click(staffButton);
    await expect(await canvas.findByLabelText("操作結果")).toHaveTextContent("open:person-staff");
  },
};

export const DeleteConfirmationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "削除" }));
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("alertdialog", {
      name: "スーパー美味しいカフェ新宿店を削除しますか？",
    });
    const confirmation = within(dialog);
    await waitFor(() =>
      expect(confirmation.getByText("削除すると、この店舗と所属スタッフは利用できなくなります。")).toBeVisible(),
    );
    await expect(
      confirmation.getByText("この店舗の管理権限、LINE連携、シフトの提出・閲覧用リンクも停止します。"),
    ).toBeVisible();
    await expect(
      confirmation.queryByText("店舗名、スタッフの氏名・メールアドレス、過去のシフト履歴は、業務記録として残ります。"),
    ).not.toBeInTheDocument();
    await expect(
      confirmation.queryByText("グループのユーザー情報と、ほかの店舗の管理権限はそのまま使えます。"),
    ).not.toBeInTheDocument();
    await expect(confirmation.getByText("この操作は元に戻せません。")).toBeVisible();
    await expect(within(dialog).getByRole("button", { name: "閉じる" })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole("button", { name: "店舗を削除" }));
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).queryByRole("alertdialog", {
          name: "スーパー美味しいカフェ新宿店を削除しますか？",
        }),
      ).not.toBeInTheDocument(),
    );
  },
};

const permissionLossReason = "最新の権限では、この店舗を削除できません。";

function InteractionHarness() {
  const [result, setResult] = useState("");
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);

  return (
    <>
      <output aria-label="操作結果">{result}</output>
      <ShopDetailView
        shop={shop}
        staffs={staffs}
        settingsDialog={{
          isOpen: isSettingsDialogOpen,
          onOpenChange: ({ open }) => setIsSettingsDialogOpen(open),
          open: () => setIsSettingsDialogOpen(true),
          close: () => setIsSettingsDialogOpen(false),
        }}
        isDeleting={false}
        onBack={() => {}}
        onOpenUser={(personId) => setResult(`open:${personId}`)}
        onUpdateSettings={(data) =>
          setResult(`update:${data.shopName}|${data.submissionPattern.kind}|${data.regularClosedDays.join(",")}`)
        }
        onDelete={async () => false}
      />
    </>
  );
}

function PermissionLossHarness() {
  const [canDelete, setCanDelete] = useState(true);

  return (
    <>
      <button type="button" onClick={() => setCanDelete(false)}>
        削除権限を失う
      </button>
      <ShopDetailView
        shop={{ ...shop, canDelete, deleteDisabledReason: canDelete ? undefined : permissionLossReason }}
        staffs={staffs}
        settingsDialog={closedSettingsDialog}
        isDeleting={false}
        onBack={() => {}}
        onOpenUser={() => {}}
        onUpdateSettings={() => {}}
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
    await body.findByRole("alertdialog", { name: "スーパー美味しいカフェ新宿店を削除しますか？" });

    losePermissionButton.click();

    await waitFor(() =>
      expect(
        body.queryByRole("alertdialog", { name: "スーパー美味しいカフェ新宿店を削除しますか？" }),
      ).not.toBeInTheDocument(),
    );
    await expect(await canvas.findByText(permissionLossReason)).toBeVisible();
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const MobileStaffAccordionOpen: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /スタッフ一覧を見る/ });
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const staffButton = await canvas.findByRole("button", { name: "佐藤 花子のスタッフ詳細を開く" });
    await waitFor(() => expect(staffButton).toBeVisible());
  },
};

export const MobileShiftType: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: {
    shop: {
      ...shop,
      submissionPattern: {
        kind: "shiftType",
        options: [
          { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
          { id: "late", name: "遅番", startTime: "15:00", endTime: "21:00", sortOrder: 1 },
        ],
      },
    },
  },
};
