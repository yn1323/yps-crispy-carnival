import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, screen, userEvent, within } from "storybook/test";
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
