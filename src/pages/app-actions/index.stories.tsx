import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { type ActionInboxItem, ActionInboxView } from "@/src/components/features/ActionInbox";
import { ShopFilterMenu } from "@/src/components/features/AuthenticatedApp/ShopFilterMenu";
import { AuthenticatedAppShell } from "@/src/components/templates/AuthenticatedAppShell";
import { AppActionsPageView, AppActionsReadOnlyNotice } from ".";

const items: readonly ActionInboxItem[] = [
  {
    id: "shift:preview",
    category: "shift",
    statusLabel: "提出期限超過",
    title: "シフトを組んでスタッフに共有しましょう",
    metadata: [
      { label: "yn1323店舗", icon: "shop" },
      { label: "8/17〜8/24", icon: "calendar" },
      { label: "提出 2/3人", icon: "people" },
      { label: "提出期限 8/14", icon: "clock" },
    ],
    actions: [{ label: "シフトを組む", emphasis: "primary", onClick: () => undefined }],
  },
  {
    id: "staff:preview",
    category: "staff",
    statusLabel: "承認待ち",
    title: "山田花子さんからスタッフ登録申請があります",
    metadata: [
      { label: "もて", icon: "shop" },
      { label: "申請 8/14 10:30", icon: "clock" },
    ],
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
    metadata: [
      { label: "yn1323店舗", icon: "shop" },
      { label: "メール", icon: "mail" },
      { label: "8/14 09:20", icon: "clock" },
    ],
    actions: [
      { label: "再送せず破棄する", emphasis: "danger", onClick: () => undefined },
      { label: "再送する", emphasis: "primary", onClick: () => undefined },
    ],
  },
  {
    id: "management:preview",
    category: "management",
    statusLabel: "招待エラー",
    title: "鈴木さんへの管理者招待が送れませんでした",
    metadata: [
      { label: "suzuki@example.com", icon: "mail" },
      { label: "8/14 08:45", icon: "clock" },
    ],
    actions: [
      { label: "取り消す", emphasis: "danger", onClick: () => undefined },
      { label: "再送する", emphasis: "primary", onClick: () => undefined },
    ],
  },
];

function ReadyPreview({
  readOnly = false,
  empty = false,
  singleShop = false,
}: {
  readOnly?: boolean;
  empty?: boolean;
  singleShop?: boolean;
}) {
  const [shopFilter, setShopFilter] = useState<string | null>(null);
  return (
    <AppActionsPageView
      state={{ kind: "ready" }}
      headingAction={
        <ShopFilterMenu
          prefix="対象"
          value={shopFilter}
          options={
            singleShop
              ? [{ value: "shop-1", label: "yn1323店舗" }]
              : [
                  { value: "shop-1", label: "yn1323店舗" },
                  { value: "shop-2", label: "もて" },
                ]
          }
          onChange={setShopFilter}
        />
      }
    >
      {readOnly && <AppActionsReadOnlyNotice />}
      <ActionInboxView items={empty ? [] : items} />
    </AppActionsPageView>
  );
}

function AppCompositionPreview() {
  return (
    <AuthenticatedAppShell activeKey="actions" activeOrganizationId="organization-preview">
      <ReadyPreview />
    </AuthenticatedAppShell>
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

export const SingleShop: Story = {
  render: () => <ReadyPreview singleShop />,
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

export const AppCompositionDesktop: Story = {
  name: "対応Inbox・新shell・デスクトップ",
  parameters: { vrt: { releaseFixedHeader: true } },
  render: () => <AppCompositionPreview />,
};

export const AppCompositionMobile: Story = {
  ...AppCompositionDesktop,
  name: "対応Inbox・新shell・モバイル414px",
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
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
