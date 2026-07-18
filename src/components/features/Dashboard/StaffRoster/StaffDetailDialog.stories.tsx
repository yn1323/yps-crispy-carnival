import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";
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
      "管理者と招待中の管理者は、グループ全体で5名までです。管理者権限を外すか、招待を取り消してからもう一度お試しください。",
  },
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
    await userEvent.click(within(dialog).getByRole("button", { name: "募集中のシフトを送る" }));
    await expect(within(dialog).queryByRole("button", { name: "やめる" })).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "確定シフトを送る" }));
    await expect(within(dialog).queryByRole("button", { name: "やめる" })).toBeNull();
    await userEvent.click(within(dialog).getByRole("tab", { name: "設定" }));
    await expect(await within(dialog).findByRole("heading", { name: "シフト対象" })).toBeInTheDocument();
    await expect(within(dialog).getByRole("checkbox", { name: /シフト対象/ })).toBeChecked();
    await expect(within(dialog).getByRole("button", { name: "スタッフを削除" })).toBeInTheDocument();
    await expect(within(dialog).queryByText("危険な操作")).toBeNull();
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
    await expect(within(dialog).getByRole("button", { name: "募集中のシフトを送る" })).toBeDisabled();
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
    await userEvent.click(within(dialog).getByRole("button", { name: "管理者として招待" }));
    await expect(
      await within(dialog).findByRole("heading", { name: "佐藤花子さんを管理者として招待しますか？" }),
    ).toBeInTheDocument();
    const managerInvitationButtons = within(dialog).getAllByRole("button", { name: "管理者として招待" });
    await expect(managerInvitationButtons).toHaveLength(2);
    await userEvent.click(managerInvitationButtons[1]);
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
    await expect(
      await within(dialog).findByRole("heading", { name: "佐藤花子さんを管理者として招待しますか？" }),
    ).toBeInTheDocument();
    const managerInvitationButtons = within(dialog).getAllByRole("button", { name: "管理者として招待" });
    await expect(managerInvitationButtons).toHaveLength(2);
    await userEvent.click(managerInvitationButtons[1]);
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
    await expect(
      await within(dialog).findByRole("heading", { name: "佐藤花子さんへログイン案内を再送しますか？" }),
    ).toBeInTheDocument();
    const resendButtons = within(dialog).getAllByRole("button", { name: "ログイン案内を再送" });
    await expect(resendButtons).toHaveLength(2);
    await userEvent.click(resendButtons[1]);
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
    await expect(within(dialog).getByText(/このグループの唯一の管理者になります/)).toBeInTheDocument();
    await expect(within(dialog).getByText(/あなたのこのグループの管理者権限は終了し/)).toBeInTheDocument();
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
