import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ActionInboxView } from "./ActionInboxView";
import type { ActionInboxItem } from "./types";

const noop = () => undefined;

const allItems: readonly ActionInboxItem[] = [
  {
    id: "shift",
    category: "shift",
    statusLabel: "締切済み",
    title: "シフトを組んでスタッフに共有しましょう",
    metadata: [
      { label: "yn1323店舗", icon: "shop" },
      { label: "8/17〜8/24", icon: "calendar" },
      { label: "提出 2/3人", icon: "people" },
      { label: "締切 8/14", icon: "clock" },
    ],
    actions: [{ label: "シフトを組む", emphasis: "primary", onClick: noop }],
  },
  {
    id: "staff",
    category: "staff",
    statusLabel: "承認待ち",
    title: "山田花子さんからスタッフ登録申請があります",
    metadata: [
      { label: "もて", icon: "shop" },
      { label: "申請 8/14 10:30", icon: "clock" },
    ],
    actions: [
      {
        label: "却下する",
        emphasis: "danger",
        onClick: noop,
        removesItemOnSuccess: true,
        successMessage: "スタッフ登録申請を却下しました。",
      },
      {
        label: "承認する",
        emphasis: "primary",
        onClick: noop,
        removesItemOnSuccess: true,
        successMessage: "スタッフ登録申請を承認しました。",
      },
    ],
  },
  {
    id: "notification",
    category: "notification",
    statusLabel: "送信失敗",
    title: "田中さんへシフト募集通知を送れませんでした",
    metadata: [
      { label: "yn1323店舗", icon: "shop" },
      { label: "メール", icon: "mail" },
      { label: "8/14 09:20", icon: "clock" },
    ],
    actions: [
      {
        label: "再送せず破棄する",
        emphasis: "danger",
        onClick: noop,
        removesItemOnSuccess: true,
        successMessage: "通知を再送せず破棄しました。",
      },
      {
        label: "再送する",
        emphasis: "primary",
        onClick: noop,
        removesItemOnSuccess: true,
        successMessage: "シフト募集通知を再送しました。",
      },
    ],
  },
  {
    id: "management",
    category: "management",
    statusLabel: "招待エラー",
    title: "鈴木さんへの管理者招待が送れませんでした",
    metadata: [
      { label: "メール", icon: "mail" },
      { label: "8/14 08:45", icon: "clock" },
    ],
    actions: [
      {
        label: "取り消す",
        emphasis: "danger",
        onClick: noop,
        removesItemOnSuccess: true,
        successMessage: "管理者招待を取り消しました。",
      },
      {
        label: "再送する",
        emphasis: "primary",
        onClick: noop,
        removesItemOnSuccess: true,
        successMessage: "管理者招待メールを再送しました。",
      },
    ],
  },
];

const meta = {
  title: "Features/ActionInbox/ActionInboxView",
  component: ActionInboxView,
  args: { items: allItems },
  parameters: { layout: "padded" },
} satisfies Meta<typeof ActionInboxView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllFour: Story = {};

export const Empty: Story = {
  args: { items: [] },
};

export const Disabled: Story = {
  args: {
    items: [
      {
        ...allItems[2],
        actions: [
          {
            label: "再送する",
            emphasis: "primary",
            disabled: true,
            disabledReason: "連絡先を確認してから再送してください。",
          },
        ],
      },
    ],
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const RetryGuidance: Story = {
  args: { items: [allItems[2], allItems[3]] },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("※メールアドレスに誤りがないか確認ください", { exact: true })).toHaveLength(2);
  },
};

export const SecondaryActionsMenu: Story = {
  args: { items: [allItems[1]] },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /その他の操作$/ }));
    await waitFor(() => expect(within(document.body).getByRole("menuitem", { name: "却下する" })).toBeVisible());
  },
};

export const SuccessfulRemoval: Story = {
  args: { items: [allItems[1]] },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "承認する" }));
    await waitFor(() => expect(canvas.queryByRole("article")).toBeNull());
    await expect(canvas.findByText("要対応の項目はありません")).resolves.toBeVisible();
  },
};

function ServerRefreshDuringRemovalPreview() {
  const [isPresent, setIsPresent] = useState(true);
  const item: ActionInboxItem = {
    ...allItems[1],
    actions: [
      {
        label: "承認する",
        emphasis: "primary",
        removesItemOnSuccess: true,
        successMessage: "スタッフ登録申請を承認しました。",
        onClick: async (): Promise<void> => setIsPresent(false),
      },
    ],
  };
  return <ActionInboxView items={isPresent ? [item] : []} />;
}

export const ServerRefreshDuringRemoval: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ServerRefreshDuringRemovalPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "承認する" }));
    await expect(canvas.getByRole("article")).toBeInTheDocument();
    await waitFor(() => expect(canvas.queryByRole("article")).toBeNull());
    await expect(canvas.findByText("要対応の項目はありません")).resolves.toBeVisible();
  },
};

function ConfirmationRemovalPreview() {
  const [isConfirming, setIsConfirming] = useState(false);
  const [completedItemId, setCompletedItemId] = useState<string | null>(null);
  const [items, setItems] = useState<readonly ActionInboxItem[]>([
    {
      ...allItems[2],
      actions: [{ label: "再送せず破棄する", emphasis: "danger", onClick: () => setIsConfirming(true) }],
    },
  ]);
  return (
    <>
      <ActionInboxView items={items} completedItemId={completedItemId} />
      {isConfirming && (
        <button
          type="button"
          onClick={() => {
            const completedId = items[0]?.id;
            if (completedId) setCompletedItemId(completedId);
            setItems([]);
            setIsConfirming(false);
          }}
        >
          確認して完了
        </button>
      )}
    </>
  );
}

export const ConfirmationRemoval: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ConfirmationRemovalPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "再送せず破棄する" }));
    await userEvent.click(canvas.getByRole("button", { name: "確認して完了" }));
    await expect(canvas.getByRole("article")).toBeInTheDocument();
    await waitFor(() => expect(canvas.queryByRole("article")).toBeNull());
  },
};

export const FailedAction: Story = {
  args: {
    items: [
      {
        ...allItems[2],
        actions: [
          {
            label: "再送する",
            emphasis: "primary",
            failureMessage: "通知を再送できませんでした。連絡先を確認してください。",
            onClick: async () => {
              throw new Error("preview failure");
            },
          },
        ],
      },
    ],
  },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "再送する" }));
    const article = canvas.getByRole("article");
    await expect(
      within(article).findByText("通知を再送できませんでした。連絡先を確認してください。"),
    ).resolves.toBeVisible();
    await expect(article).toBeVisible();
  },
};
