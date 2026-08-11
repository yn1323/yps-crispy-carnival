import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useState } from "react";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";
import {
  type StaffNotificationHistoryItem,
  StaffNotificationHistoryView,
} from "@/src/components/features/StaffNotificationHistory";
import { mockCurrentRecruitments, mockRecruitments, mockStaffs, mockStaffsWithExcluded } from "../stories/fixtures";
import type { Staff } from "../types";
import { StaffDetailDialog } from "./StaffDetailDialog";

const noop = () => {};

const lineLinkedStaff = {
  ...mockStaffs[0],
  name: "田中太郎",
  isLineLinked: true,
  isLineFollowing: true,
} as Staff;

const lineNotFollowingStaff = {
  ...mockStaffs[2],
  name: "鈴木一郎",
  isLineLinked: true,
  isLineFollowing: false,
} as Staff;

const excludedStaff = mockStaffsWithExcluded[2] as Staff;
const organizationLinkedStaff = {
  ...mockStaffs[1],
  isOrganizationLinked: true,
} as Staff;
const availableManagerInvitationStaff = {
  ...mockStaffs[1],
  managerInvitationState: { kind: "available", mode: "addition", replacesStaleInvitation: false },
} as Staff;
const pendingManagerInvitationStaff = {
  ...mockStaffs[1],
  managerInvitationState: { kind: "pending", mode: "addition" },
} as Staff;
const unavailableManagerInvitationStaff = {
  ...mockStaffs[1],
  managerInvitationState: {
    kind: "unavailable",
    reason:
      "管理者と招待中の管理者は、組織全体で5名までです。\n管理者権限を外すか招待を取り消してから、もう一度お試しください。",
  },
} as Staff;
const hiddenManagerInvitationStaff = {
  ...mockStaffs[1],
  managerInvitationState: { kind: "hidden" },
} as Staff;
const freeManagerExchangeStaff = {
  ...mockStaffs[1],
  managerInvitationState: { kind: "available", mode: "freeManagerExchange", replacesStaleInvitation: false },
} as Staff;
const pendingFreeManagerExchangeStaff = {
  ...mockStaffs[1],
  managerInvitationState: { kind: "pending", mode: "freeManagerExchange" },
} as Staff;
const staleManagerInvitationStaff = {
  ...mockStaffs[1],
  managerInvitationState: { kind: "available", mode: "addition", replacesStaleInvitation: true },
} as Staff;

const notificationHistoryItems = [
  {
    _id: "history-delivered-email",
    requestedAt: new Date("2026-07-19T01:00:00Z").getTime(),
    sentAt: new Date("2026-07-19T01:00:12Z").getTime(),
    channel: "email",
    displayTitle: "確定シフトのお知らせ",
    displayStatus: "delivered",
  },
  {
    _id: "history-sent-line",
    requestedAt: new Date("2026-07-18T08:30:00Z").getTime(),
    sentAt: new Date("2026-07-18T08:30:05Z").getTime(),
    channel: "line",
    displayTitle: "シフト提出のお願い",
    displayStatus: "sent",
  },
  {
    _id: "history-failed-email",
    requestedAt: new Date("2026-07-17T23:15:00Z").getTime(),
    channel: "email",
    displayTitle: "募集中シフトのお知らせ",
    displayStatus: "failed",
  },
  {
    _id: "history-delayed-email",
    requestedAt: new Date("2026-07-17T03:00:00Z").getTime(),
    channel: "email",
    displayTitle: "シフト変更のお知らせ",
    displayStatus: "delayed",
  },
  {
    _id: "history-queued-email",
    requestedAt: new Date("2026-07-16T12:00:00Z").getTime(),
    channel: "email",
    displayTitle: "スタッフ登録のお知らせ",
    displayStatus: "queued",
  },
  {
    _id: "history-cancelled-line",
    requestedAt: new Date("2026-07-15T04:45:00Z").getTime(),
    channel: "line",
    displayTitle: "シフト募集のお知らせ",
    displayStatus: "cancelled",
  },
] satisfies StaffNotificationHistoryItem[];

const longTitleNotificationHistoryItems = [
  {
    ...notificationHistoryItems[0],
    _id: "history-long-title",
    displayTitle: "7月後半の確定シフトと営業時間変更にともなう出勤時刻・休憩時間の変更についてのお知らせ",
  },
] satisfies StaffNotificationHistoryItem[];

const paginatedNotificationHistoryItems = Array.from({ length: 25 }, (_, index) => ({
  _id: `history-page-${index + 1}`,
  requestedAt: new Date("2026-07-19T01:00:00Z").getTime() - index * 60_000,
  channel: index % 2 === 0 ? ("email" as const) : ("line" as const),
  displayTitle: `通知履歴 ${index + 1}`,
  displayStatus: "sent" as const,
}));

function NotificationHistoryLoadMoreStory(props: ComponentProps<typeof StaffDetailDialog>) {
  const [visibleCount, setVisibleCount] = useState(3);
  const canLoadMore = visibleCount < paginatedNotificationHistoryItems.length;

  return (
    <StaffDetailDialog
      {...props}
      notificationHistory={
        <StaffNotificationHistoryView
          items={paginatedNotificationHistoryItems.slice(0, visibleCount)}
          canLoadMore={canLoadMore}
          onLoadMore={() =>
            setVisibleCount((current) => Math.min(current + 10, paginatedNotificationHistoryItems.length))
          }
        />
      }
    />
  );
}

let managerInvitationCallCount = 0;
const countManagerInvitation = async (): Promise<boolean> => {
  managerInvitationCallCount += 1;
  return true;
};
const rejectManagerInvitation = async (): Promise<boolean> => false;

const meta = {
  title: "Features/Dashboard/StaffDetailDialog",
  component: StaffDetailDialog,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    staff: mockStaffs[1],
    isOpen: true,
    onOpenChange: noop,
    onClose: noop,
    openRecruitments: mockRecruitments.filter((recruitment) => recruitment.status === "open").slice(0, 1),
    currentRecruitments: mockCurrentRecruitments,
    onEdit: noop,
    isEditing: false,
    onDelete: noop,
    isDeleting: false,
    onShowLineQr: noop,
    lineQrState: { staffId: null, authorizeUrl: null, isLoading: false },
    onSendLineInvite: noop,
    isSendingLineInvite: false,
    onSendRecruitments: noop,
    isSendingRecruitments: false,
    onSendCurrentShift: noop,
    isSendingCurrentShift: false,
    notificationHistory: <StaffNotificationHistoryView items={[]} />,
    onChangeShiftTarget: noop,
    isChangingShiftTarget: false,
    onInviteManager: async (): Promise<boolean> => true,
    isInvitingManager: false,
  },
} satisfies Meta<typeof StaffDetailDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "スタッフ詳細" });
    await expect(within(dialog).getAllByText("LINE未連携").length).toBeGreaterThan(0);
    await userEvent.click(within(dialog).getByRole("tab", { name: "LINE" }));
    await expect(await within(dialog).findByText("次のいずれかの方法でLINE連携できます。")).toBeInTheDocument();
    await expect(await within(dialog).findByRole("heading", { name: "1. LINE連携リンクを表示" })).toBeInTheDocument();
    await expect(
      await within(dialog).findByRole("heading", { name: "2. LINE連携リンクをメールで送る" }),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "メールでLINE連携リンクを送る" }));
    await expect(within(dialog).queryByRole("button", { name: "やめる" })).toBeNull();
    await userEvent.click(within(dialog).getByRole("tab", { name: "通知" }));
    await expect(await within(dialog).findByText("現在の募集中シフト")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "募集中のシフトを再送する" }));
    await expect(within(dialog).queryByRole("button", { name: "やめる" })).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "確定シフトを再送する" }));
    await expect(within(dialog).queryByRole("button", { name: "やめる" })).toBeNull();
    await userEvent.click(within(dialog).getByRole("tab", { name: "設定" }));
    await expect(await within(dialog).findByRole("heading", { name: "シフト対象" })).toBeInTheDocument();
    await expect(within(dialog).getByRole("checkbox", { name: /シフト対象/ })).toBeChecked();
    await expect(within(dialog).getByRole("button", { name: "スタッフを削除" })).toBeInTheDocument();
    await expect(within(dialog).queryByText("危険な操作")).toBeNull();
  },
};

export const NotificationHistory: Story = {
  args: {
    defaultTab: "notification",
    notificationHistory: <StaffNotificationHistoryView items={notificationHistoryItems} />,
  },
};

export const NotificationHistoryLifecycleBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    notificationHistory: <output data-testid="deferred-notification-history">通知履歴の遅延内容</output>,
  },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "スタッフ詳細" });
    const view = within(dialog);

    await expect(view.queryByTestId("deferred-notification-history")).not.toBeInTheDocument();
    await userEvent.click(view.getByRole("tab", { name: "通知" }));
    await expect(await view.findByTestId("deferred-notification-history")).toBeInTheDocument();

    await userEvent.click(view.getByRole("tab", { name: "情報" }));
    await expect(view.queryByTestId("deferred-notification-history")).not.toBeInTheDocument();
  },
};

export const NotificationHistoryLoading: Story = {
  args: {
    defaultTab: "notification",
    notificationHistory: <StaffNotificationHistoryView items={[]} isLoading />,
  },
};

export const NotificationHistoryEmpty: Story = {
  args: {
    defaultTab: "notification",
  },
};

export const NotificationHistoryError: Story = {
  args: {
    defaultTab: "notification",
    notificationHistory: <StaffNotificationHistoryView items={[]} isError />,
  },
};

export const NotificationHistoryLongText: Story = {
  args: {
    defaultTab: "notification",
    notificationHistory: <StaffNotificationHistoryView items={longTitleNotificationHistoryItems} />,
  },
};

export const NotificationHistoryReadOnly: Story = {
  args: {
    defaultTab: "notification",
    isReadOnly: true,
    notificationHistory: (
      <StaffNotificationHistoryView
        items={paginatedNotificationHistoryItems.slice(0, 3)}
        canLoadMore
        onLoadMore={noop}
      />
    ),
  },
};

export const NotificationHistoryMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: {
    defaultTab: "notification",
    notificationHistory: <StaffNotificationHistoryView items={notificationHistoryItems.slice(0, 3)} />,
  },
};

export const NotificationHistoryLoadMoreBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    defaultTab: "notification",
    isReadOnly: true,
  },
  render: (args) => <NotificationHistoryLoadMoreStory {...args} />,
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "スタッフ詳細" });
    const historyTable = await within(dialog).findByRole("table", { name: "通知履歴" });
    await expect(within(historyTable).getAllByRole("row")).toHaveLength(4);

    const loadMoreButton = within(dialog).getByRole("button", { name: "もっと見る" });
    await expect(loadMoreButton).toBeEnabled();
    await userEvent.click(loadMoreButton);

    await expect(await within(historyTable).findByText("通知履歴 13")).toBeInTheDocument();
    await expect(within(historyTable).getAllByRole("row")).toHaveLength(14);
  },
};

export const LineLinked: Story = {
  args: {
    staff: lineLinkedStaff,
  },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "スタッフ詳細" });
    await userEvent.click(within(dialog).getByRole("tab", { name: "LINE" }));
    await expect(within(dialog).getAllByText("LINE連携済み").length).toBeGreaterThan(0);
    await expect(within(dialog).queryByRole("button", { name: "LINE連携リンクを表示" })).toBeNull();
  },
};

export const LineNotFollowing: Story = {
  args: {
    staff: lineNotFollowingStaff,
  },
};

export const ExcludedFromShift: Story = {
  args: {
    staff: excludedStaff,
  },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "スタッフ詳細" });
    await userEvent.click(within(dialog).getByRole("tab", { name: "通知" }));
    await expect(await within(dialog).findByText("このスタッフはシフト対象外です")).toBeInTheDocument();
    await expect(within(dialog).getByRole("button", { name: "募集中のシフトを再送する" })).toBeDisabled();
  },
};

export const NoTargetShift: Story = {
  args: {
    openRecruitments: [],
    currentRecruitments: [],
  },
};

export const ManagerStaff: Story = {
  args: {
    staff: lineLinkedStaff,
  },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "スタッフ詳細" });
    await userEvent.click(within(dialog).getByRole("tab", { name: "設定" }));
    await expect(await within(dialog).findByRole("button", { name: "管理者として招待" })).toBeDisabled();
    await expect(within(dialog).getByText("すでに管理者です")).toBeInTheDocument();
    await expect(await within(dialog).findByRole("button", { name: "スタッフを削除" })).toBeDisabled();
  },
};

export const ManagerInvitationAvailable: Story = {
  args: {
    staff: availableManagerInvitationStaff,
    defaultTab: "settings",
  },
};

export const ManagerInvitationPending: Story = {
  args: {
    staff: pendingManagerInvitationStaff,
    defaultTab: "settings",
  },
};

export const ManagerInvitationUnavailableAtCapacity: Story = {
  args: {
    staff: unavailableManagerInvitationStaff,
    defaultTab: "settings",
  },
};

export const ManagerInvitationDarkLaunchBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    staff: hiddenManagerInvitationStaff,
    defaultTab: "settings",
  },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "スタッフ詳細" });
    await expect(within(dialog).queryByRole("heading", { name: "管理者権限" })).not.toBeInTheDocument();
    await expect(
      within(dialog).queryByRole("button", { name: /管理者として招待|ログイン案内を再送/ }),
    ).not.toBeInTheDocument();
    await expect(within(dialog).getByRole("button", { name: "スタッフを削除" })).toBeInTheDocument();
  },
};

export const FreeManagerExchangeAvailable: Story = {
  args: {
    staff: freeManagerExchangeStaff,
    defaultTab: "settings",
  },
};

export const ManagerInvitationWithStaleEmail: Story = {
  args: {
    staff: staleManagerInvitationStaff,
    defaultTab: "settings",
  },
};

export const ManagerInvitationConfirmationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    staff: availableManagerInvitationStaff,
    onInviteManager: countManagerInvitation,
  },
  play: async () => {
    managerInvitationCallCount = 0;
    const dialog = await screen.findByRole("dialog", { name: "スタッフ詳細" });
    await userEvent.click(within(dialog).getByRole("tab", { name: "設定" }));
    const requestButton = within(dialog).getByRole("button", { name: "管理者として招待" });
    await userEvent.click(requestButton);
    let confirmation = await screen.findByRole("alertdialog", {
      name: "佐藤花子さんを管理者として招待しますか？",
    });
    await expect(screen.queryAllByRole("alertdialog")).toHaveLength(1);
    await expect(screen.queryAllByRole("dialog")).toHaveLength(0);
    await expect(within(confirmation).getByTestId("staff-detail-confirmation-body")).toHaveFocus();
    await expect(within(confirmation).getAllByRole("button", { name: "管理者として招待" })).toHaveLength(1);
    await userEvent.click(within(confirmation).getByRole("button", { name: "やめる" }));
    const restoredDialog = await screen.findByRole("dialog", { name: "スタッフ詳細" });
    const restoredRequestButton = within(restoredDialog).getByRole("button", { name: "管理者として招待" });
    await expect(restoredRequestButton).toHaveFocus();

    await userEvent.click(restoredRequestButton);
    confirmation = await screen.findByRole("alertdialog", {
      name: "佐藤花子さんを管理者として招待しますか？",
    });
    await userEvent.click(within(confirmation).getByRole("button", { name: "管理者として招待" }));
    await expect(managerInvitationCallCount).toBe(1);
    await waitFor(() => {
      expect(
        within(dialog).queryByRole("heading", { name: "佐藤花子さんを管理者として招待しますか？" }),
      ).not.toBeInTheDocument();
    });
  },
};

export const ManagerInvitationFailureKeepsConfirmationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    staff: availableManagerInvitationStaff,
    onInviteManager: rejectManagerInvitation,
  },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "スタッフ詳細" });
    await userEvent.click(within(dialog).getByRole("tab", { name: "設定" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "管理者として招待" }));
    const confirmation = await screen.findByRole("alertdialog", {
      name: "佐藤花子さんを管理者として招待しますか？",
    });
    await expect(within(dialog).getAllByRole("button", { name: "管理者として招待" })).toHaveLength(1);
    await userEvent.click(within(confirmation).getByRole("button", { name: "管理者として招待" }));
    await expect(
      within(dialog).getByRole("heading", { name: "佐藤花子さんを管理者として招待しますか？" }),
    ).toBeInTheDocument();
  },
};

export const ManagerInvitationResendConfirmationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    staff: pendingManagerInvitationStaff,
    onInviteManager: countManagerInvitation,
  },
  play: async () => {
    managerInvitationCallCount = 0;
    const dialog = await screen.findByRole("dialog", { name: "スタッフ詳細" });
    await userEvent.click(within(dialog).getByRole("tab", { name: "設定" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "ログイン案内を再送" }));
    const confirmation = await screen.findByRole("alertdialog", {
      name: "佐藤花子さんへログイン案内を再送しますか？",
    });
    await expect(within(dialog).getAllByRole("button", { name: "ログイン案内を再送" })).toHaveLength(1);
    await userEvent.click(within(confirmation).getByRole("button", { name: "ログイン案内を再送" }));
    await expect(managerInvitationCallCount).toBe(1);
  },
};

export const FreeManagerExchangeConfirmationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    staff: freeManagerExchangeStaff,
    onInviteManager: countManagerInvitation,
  },
  play: async () => {
    managerInvitationCallCount = 0;
    const dialog = await screen.findByRole("dialog", { name: "スタッフ詳細" });
    await userEvent.click(within(dialog).getByRole("tab", { name: "設定" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "次の管理者として招待" }));

    await expect(managerInvitationCallCount).toBe(0);
    await expect(
      await within(dialog).findByRole("heading", { name: "佐藤花子さんへ管理者交代の案内を送りますか？" }),
    ).toBeInTheDocument();
    await expect(within(dialog).getByText(/この組織の唯一の管理者になります/)).toBeInTheDocument();
    await expect(within(dialog).getByText(/あなたはこの組織の管理者ではなくなり/)).toBeInTheDocument();
    await expect(within(dialog).getByText(/交代が完了するまでは、あなたが引き続き管理できます/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "交代の案内を送る" }));
    await expect(managerInvitationCallCount).toBe(1);
  },
};

export const FreeManagerExchangeResendConfirmationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    staff: pendingFreeManagerExchangeStaff,
    onInviteManager: countManagerInvitation,
  },
  play: async () => {
    managerInvitationCallCount = 0;
    const dialog = await screen.findByRole("dialog", { name: "スタッフ詳細" });
    await userEvent.click(within(dialog).getByRole("tab", { name: "設定" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "ログイン案内を再送" }));

    await expect(managerInvitationCallCount).toBe(0);
    await expect(
      await within(dialog).findByRole("heading", { name: "佐藤花子さんへ管理者交代の案内を再送しますか？" }),
    ).toBeInTheDocument();
    await expect(within(dialog).getByText(/以前のURLは利用できなくなります/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "交代の案内を再送" }));
    await expect(managerInvitationCallCount).toBe(1);
  },
};

export const OrganizationLinkedStaffRemoval: Story = {
  args: {
    staff: organizationLinkedStaff,
  },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "スタッフ詳細" });
    await userEvent.click(within(dialog).getByRole("tab", { name: "設定" }));
    await userEvent.click(await within(dialog).findByRole("button", { name: "スタッフを削除" }));
    await expect(within(dialog).getByText(/利用人数にも引き続き含まれます/)).toBeInTheDocument();
    await expect(within(dialog).getByRole("button", { name: "店舗から削除" })).toBeEnabled();
  },
};
