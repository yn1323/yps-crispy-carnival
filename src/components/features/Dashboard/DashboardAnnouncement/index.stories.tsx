import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Button } from "@/src/components/ui/Button";
import type { DashboardAnnouncement as DashboardAnnouncementData } from "../types";
import { DashboardAnnouncement } from "./index";
import { DISMISSED_ANNOUNCEMENTS_STORAGE_KEY } from "./useDismissedAnnouncements";

const announcement = {
  _id: "dashboard-announcement-1",
  title: "LINE通知の遅延について",
  bodyHtml:
    '<p>現在、LINE通知の送信に遅延が発生しています。</p><p>復旧までメール通知をご確認ください。</p><p><a href="/dashboard">ダッシュボードを確認する</a></p>',
  displayDate: "2026-06-17",
} as unknown as DashboardAnnouncementData;
const organizationAnnouncement = {
  _id: "dashboard-announcement-organization",
  organizationId: "organization-current",
  title: "現在の事業者向けのお知らせ",
  bodyHtml: "<p>このお知らせは、現在選択している事業者を対象にしています。</p>",
  displayDate: "2026-06-16",
} as unknown as DashboardAnnouncementData;

const meta = {
  title: "Features/Dashboard/DashboardAnnouncement",
  component: DashboardAnnouncement,
  parameters: {
    layout: "fullscreen",
  },
  beforeEach: () => {
    localStorage.removeItem(DISMISSED_ANNOUNCEMENTS_STORAGE_KEY);
    return () => localStorage.removeItem(DISMISSED_ANNOUNCEMENTS_STORAGE_KEY);
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
    announcements: [announcement],
  },
};

export const LongTitle: Story = {
  args: {
    announcements: [
      {
        ...announcement,
        _id: "dashboard-announcement-long",
        title: "一部のお客様でメール通知とLINE通知の送信完了まで通常より時間がかかっています",
      } as unknown as DashboardAnnouncementData,
    ],
  },
};

export const HtmlBody: Story = {
  args: {
    announcements: [
      {
        ...announcement,
        _id: "dashboard-announcement-html",
        title: "通知配送の復旧対応について",
        bodyHtml:
          "<p><strong>対応中です。</strong>復旧まで以下をご確認ください。</p><ul><li>スタッフへの共有はメールも確認してください</li><li>再送は時間をおいて実行してください</li></ul>",
      } as unknown as DashboardAnnouncementData,
    ],
  },
};

export const MultipleAnnouncements: Story = {
  args: {
    announcements: [announcement, organizationAnnouncement],
  },
};

export const ModalOpen: Story = {
  args: {
    announcements: [announcement],
    defaultOpen: true,
  },
};

export const ModalOpenMobile: Story = {
  ...ModalOpen,
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const OpensDialog: Story = {
  args: {
    announcements: [announcement, organizationAnnouncement],
  },
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(await canvas.findByRole("button", { name: /現在の事業者向けのお知らせを開く/ }));

    await expect(await page.findByRole("dialog", { name: "現在の事業者向けのお知らせ" })).toBeInTheDocument();
    await expect(
      await page.findByText("このお知らせは、現在選択している事業者を対象にしています。"),
    ).toBeInTheDocument();
    await expect(page.queryByRole("dialog", { name: "LINE通知の遅延について" })).not.toBeInTheDocument();
  },
};

export const DismissesAnnouncements: Story = {
  args: {
    announcements: [announcement, organizationAnnouncement],
  },
  parameters: {
    screenshot: { skip: true },
  },
  render: function Render(args) {
    const [mountKey, setMountKey] = useState(0);
    return (
      <>
        <DashboardAnnouncement key={mountKey} {...args} />
        <Button mt={4} variant="outline" onClick={() => setMountKey((key) => key + 1)}>
          お知らせを再読み込み
        </Button>
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(await canvas.findByRole("button", { name: /LINE通知の遅延についてを開く/ }));
    const firstDialog = within(await page.findByRole("dialog", { name: announcement.title }));
    await userEvent.click(firstDialog.getByText("閉じる", { selector: "button" }));
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(canvas.getAllByRole("button", { name: /を開く$/ })).toHaveLength(2);

    await userEvent.click(canvas.getByRole("button", { name: /LINE通知の遅延についてを開く/ }));
    const reopenedDialog = within(await page.findByRole("dialog", { name: announcement.title }));
    await userEvent.click(reopenedDialog.getByRole("button", { name: "次回以降表示しない" }));
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(canvas.queryByRole("button", { name: /LINE通知の遅延についてを開く/ })).not.toBeInTheDocument();
    await expect(canvas.getAllByRole("button", { name: /を開く$/ })).toHaveLength(1);

    await userEvent.click(canvas.getByRole("button", { name: /現在の事業者向けのお知らせを開く/ }));
    const remainingDialog = within(await page.findByRole("dialog", { name: organizationAnnouncement.title }));
    await userEvent.click(remainingDialog.getByRole("button", { name: "次回以降表示しない" }));
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(canvas.queryAllByRole("button", { name: /を開く$/ })).toHaveLength(0);

    await userEvent.click(canvas.getByRole("button", { name: "お知らせを再読み込み" }));
    await expect(canvas.queryAllByRole("button", { name: /を開く$/ })).toHaveLength(0);
  },
};
