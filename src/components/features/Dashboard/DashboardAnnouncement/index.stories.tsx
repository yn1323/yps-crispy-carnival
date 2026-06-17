import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import type { DashboardAnnouncement as DashboardAnnouncementData } from "../types";
import { DashboardAnnouncement } from "./index";

const announcement = {
  _id: "dashboard-announcement-1",
  title: "LINE通知の遅延について",
  bodyHtml:
    '<p>現在、LINE通知の送信に遅延が発生しています。</p><p>復旧までメール通知をご確認ください。</p><p><a href="/dashboard">ダッシュボードを確認する</a></p>',
  displayDate: "2026-06-17",
} as unknown as DashboardAnnouncementData;

const meta = {
  title: "Features/Dashboard/DashboardAnnouncement",
  component: DashboardAnnouncement,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <Box minH="100vh" bg="white" p={{ base: 4, md: 8 }}>
        <Box maxW="960px" mx="auto">
          <Story />
        </Box>
      </Box>
    ),
  ],
} satisfies Meta<typeof DashboardAnnouncement>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = {
  args: {
    announcement,
  },
};

export const LongTitle: Story = {
  args: {
    announcement: {
      ...announcement,
      _id: "dashboard-announcement-long",
      title: "一部のお客様でメール通知とLINE通知の送信完了まで通常より時間がかかっています",
    } as unknown as DashboardAnnouncementData,
  },
};

export const HtmlBody: Story = {
  args: {
    announcement: {
      ...announcement,
      _id: "dashboard-announcement-html",
      title: "通知配送の復旧対応について",
      bodyHtml:
        "<p><strong>対応中です。</strong>復旧まで以下をご確認ください。</p><ul><li>スタッフへの共有はメールも確認してください</li><li>再送は時間をおいて実行してください</li></ul>",
    } as unknown as DashboardAnnouncementData,
  },
};

export const ModalOpen: Story = {
  args: {
    announcement,
    defaultOpen: true,
  },
};

export const OpensDialog: Story = {
  args: {
    announcement,
  },
  parameters: {
    chromatic: { disableSnapshot: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(await canvas.findByRole("button", { name: /LINE通知の遅延についてを開く/ }));

    await expect(await page.findByRole("dialog", { name: "LINE通知の遅延について" })).toBeInTheDocument();
    await expect(await page.findByText("復旧までメール通知をご確認ください。")).toBeInTheDocument();
    await expect(await page.findAllByText("6/17(水)")).toHaveLength(2);
  },
};
