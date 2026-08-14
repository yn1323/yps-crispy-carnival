import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { type ActionInboxItem, ActionInboxView } from "@/src/components/features/ActionInbox";
import { ShopFilterMenu } from "@/src/components/features/AuthenticatedApp/ShopFilterMenu";
import { AppActionsPageView, AppActionsReadOnlyNotice } from ".";

const items: readonly ActionInboxItem[] = [
  {
    id: "shift:preview",
    category: "shift",
    statusLabel: "締切済み",
    title: "シフトを組んでスタッフに共有しましょう",
    metadata: [{ label: "yn1323店舗", icon: "shop" }, { label: "8/17〜8/24" }, { label: "提出 2/3人" }],
    actions: [{ label: "シフトを組む", emphasis: "primary", onClick: () => undefined }],
  },
  {
    id: "staff:preview",
    category: "staff",
    statusLabel: "承認待ち",
    title: "山田花子さんからスタッフ登録申請があります",
    metadata: [{ label: "もて", icon: "shop" }, { label: "申請 8/14 10:30" }],
    actions: [
      { label: "却下する", emphasis: "danger", onClick: () => undefined },
      { label: "承認する", emphasis: "primary", onClick: () => undefined },
    ],
  },
  {
    id: "notification:preview",
    category: "notification",
    statusLabel: "送信失敗",
    title: "田中さんへシフト募集通知を送れませんでした",
    metadata: [{ label: "yn1323店舗", icon: "shop" }, { label: "メール" }, { label: "8/14 09:20" }],
    actions: [
      { label: "対応済みにする", onClick: () => undefined },
      { label: "再送する", emphasis: "primary", onClick: () => undefined },
    ],
  },
  {
    id: "management:preview",
    category: "management",
    statusLabel: "招待エラー",
    title: "鈴木さんへの管理者招待を確認してください",
    metadata: [{ label: "suzuki@example.com" }, { label: "8/14 08:45" }],
    actions: [
      { label: "取り消す", emphasis: "danger", onClick: () => undefined },
      { label: "再送する", emphasis: "primary", onClick: () => undefined },
    ],
  },
];

function ReadyPreview({ readOnly = false, empty = false }: { readOnly?: boolean; empty?: boolean }) {
  const [shopFilter, setShopFilter] = useState<string | null>(null);
  return (
    <AppActionsPageView
      state={{ kind: "ready" }}
      headingAction={
        <ShopFilterMenu
          prefix="対象"
          value={shopFilter}
          options={[
            { value: "shop-1", label: "yn1323店舗" },
            { value: "shop-2", label: "もて" },
          ]}
          onChange={setShopFilter}
        />
      }
    >
      {readOnly && <AppActionsReadOnlyNotice />}
      <ActionInboxView items={empty ? [] : items} />
    </AppActionsPageView>
  );
}

const meta = {
  title: "Pages/AppActions/States",
  component: AppActionsPageView,
  parameters: { layout: "fullscreen" },
  args: { state: { kind: "loading" } },
} satisfies Meta<typeof AppActionsPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};

export const Ready: Story = {
  render: () => <ReadyPreview />,
};

export const Empty: Story = {
  render: () => <ReadyPreview empty />,
};

export const ReadOnly: Story = {
  render: () => <ReadyPreview readOnly />,
};

export const QueryError: Story = {
  args: { state: { kind: "error" }, onReload: () => undefined },
};

export const MobileReady: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: () => <ReadyPreview />,
};

function RetryBehaviorPreview() {
  const [state, setState] = useState<"error" | "ready">("error");
  return state === "error" ? (
    <AppActionsPageView state={{ kind: "error" }} onReload={() => setState("ready")} />
  ) : (
    <ReadyPreview empty />
  );
}

export const QueryRetryBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <RetryBehaviorPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "再読み込み" }));
    await expect(await canvas.findByText("対応が必要な項目はありません")).toBeVisible();
  },
};
