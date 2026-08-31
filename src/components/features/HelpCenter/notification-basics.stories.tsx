import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { HelpNotificationBasics } from "./HelpNotificationBasics";

const meta = {
  title: "Features/HelpCenter/NotificationBasics",
  component: HelpNotificationBasics,
  decorators: [
    (Story) => (
      <>
        <style>
          {
            'html[data-vrt="true"] header { position: static !important; inset-inline-start: auto !important; inset-inline-end: auto !important; top: auto !important; } html[data-vrt="true"] main { padding-top: 0 !important; }'
          }
        </style>
        <Story />
      </>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    vrt: { releaseFixedHeader: true },
  },
} satisfies Meta<typeof HelpNotificationBasics>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const relatedHelp = within(canvas.getByRole("region", { name: "関連情報" }));

    await expect(canvas.getByRole("heading", { name: "業務フローで見る通知タイミング" })).toBeVisible();
    await expect(canvas.getByText("スタッフ追加方法で通知タイミングが少し異なります。")).toBeVisible();
    await expect(canvas.getByText(/提出期限前催促、確定時の通知があります。/)).toBeVisible();
    await expect(canvas.getByText(/また、管理者へのリマインダーもあります。/)).toBeVisible();
    await expect(canvas.getByRole("figure", { name: "スタッフ登録と通知の流れ" })).toHaveAccessibleDescription(
      /毎日17時に対象店舗の管理者へお知らせします/,
    );
    await expect(
      canvas.getByRole("figure", { name: "シフト募集から確定・変更までの通知" }),
    ).toHaveAccessibleDescription(/提出期限の翌日17時/);
    await expect(canvas.getByRole("figure", { name: "管理者招待と通知の流れ" })).toHaveAccessibleDescription(
      /ほかの有効な管理者へ承認完了メールを送ります/,
    );
    await expect(canvas.queryByRole("heading", { name: "LINEとメールの選ばれ方" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("heading", { name: "スタッフに送る通知" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("heading", { name: "管理者に送る通知" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("heading", { name: "通知が届かないとき" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("heading", { name: "シフトリから届くメール" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("table")).not.toBeInTheDocument();
    await expect(
      canvas.queryByText(/管理者招待は、招待先と既存の有効な管理者へメールで案内します/),
    ).not.toBeInTheDocument();
    await expect(relatedHelp.getByRole("link", { name: /個別スタッフへの通知履歴を確認する/ })).toHaveAttribute(
      "href",
      "/help/check-notification-history",
    );
    await expect(relatedHelp.getByRole("link", { name: /メール通知が届かないときの確認項目を見る/ })).toHaveAttribute(
      "href",
      "/help/tasks/notifications#notification-not-received",
    );
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
