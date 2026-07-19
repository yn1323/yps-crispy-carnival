import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/components/ui/Button";
import type { UserDetailData, UserDetailDialog, UserDetailTab } from "./types";
import { UserDetailSkeleton } from "./UserDetailSkeleton";
import { UserDetailView, type UserDetailViewProps } from "./UserDetailView";

const personId = "person-tanaka" as Id<"organizationPeople">;
const shibuyaStaffId = "staff-shibuya" as Id<"staffs">;
const shibuyaShopId = "shop-shibuya" as Id<"shops">;
const shinjukuStaffId = "staff-shinjuku" as Id<"staffs">;
const shinjukuShopId = "shop-shinjuku" as Id<"shops">;

const shibuyaMembership: UserDetailData["memberships"][number] = {
  staffId: shibuyaStaffId,
  shopId: shibuyaShopId,
  shopName: "渋谷店",
  shopStatus: "active",
  excludedFromShift: false,
  canRemove: true,
  line: { isLinked: true, isFollowing: true },
};

const shinjukuMembership: UserDetailData["memberships"][number] = {
  staffId: shinjukuStaffId,
  shopId: shinjukuShopId,
  shopName: "新宿店",
  shopStatus: "planSuspended",
  excludedFromShift: true,
  canRemove: true,
  line: { isLinked: true, isFollowing: false },
};

const baseData: UserDetailData = {
  person: {
    id: personId,
    name: "田中 花子",
    email: "hanako.tanaka@example.com",
  },
  isSelf: false,
  managerRole: "active",
  hasManagerInvitation: false,
  managerInvitationState: { kind: "unavailable", reason: "このユーザーはすでに管理者です。" },
  canRemoveManagerRole: true,
  managerRoleRemovalDisabledReason: undefined,
  canRemove: true,
  removeDisabledReason: undefined,
  canWrite: true,
  memberships: [shibuyaMembership],
};

const baseState: UserDetailViewProps["state"] = {
  isUpdatingProfile: false,
  notification: {
    isLoading: false,
    openRecruitments: [{ _id: "recruitment-open", periodStart: "2026-07-21", periodEnd: "2026-07-31", status: "open" }],
    currentRecruitments: [
      {
        _id: "recruitment-current",
        periodStart: "2026-07-11",
        periodEnd: "2026-07-20",
        status: "confirmed",
      },
    ],
    isSendingRecruitments: false,
    isSendingCurrentShift: false,
  },
  line: {
    authorizeUrl: null,
    showQr: false,
    isQrLoading: false,
    isSendingInvite: false,
  },
  membership: {
    dialog: null,
    isChangingShiftTarget: false,
    isRemoving: false,
  },
  manager: {
    dialog: null,
    isAssignmentConfirmationOpen: false,
    isAssigning: false,
    isRemoving: false,
  },
};

const noop = () => undefined;
const asyncNoop = async () => undefined;
const confirmMembershipRemoval = fn(async () => undefined);
const confirmManagerRemoval = fn(async () => undefined);
const confirmPersonRemoval = fn(async () => undefined);
const selectStore = fn();
const sendRecruitments = fn(async () => undefined);
const showLineLink = fn(async () => undefined);
const assignManager = fn(async () => undefined);
const baseActions: UserDetailViewProps["actions"] = {
  onBack: noop,
  onSelectShop: noop,
  onTabChange: noop,
  onUpdateProfile: asyncNoop,
  onSendRecruitments: asyncNoop,
  onSendCurrentShift: asyncNoop,
  onShowLineQr: asyncNoop,
  onSendLineInvite: asyncNoop,
  onChangeShiftTarget: asyncNoop,
  onRequestRemoveMembership: noop,
  onConfirmRemoveMembership: asyncNoop,
  onCloseMembershipDialog: noop,
  onRequestManagerAssignment: noop,
  onCancelManagerAssignment: noop,
  onAssignManager: asyncNoop,
  onRequestRemoveManagerRole: noop,
  onRequestRemovePerson: noop,
  onConfirmManagerSetting: asyncNoop,
  onCloseManagerDialog: noop,
};

const meta = {
  title: "Features/UserDetail",
  component: UserDetailView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <Box bg="gray.50" minH="100dvh" p={{ base: 4, md: 8 }}>
        <Box maxW="1024px" mx="auto">
          <Story />
        </Box>
      </Box>
    ),
  ],
  args: {
    data: baseData,
    selectedShopId: shibuyaShopId,
    activeTab: "information",
    state: baseState,
    actions: baseActions,
  },
} satisfies Meta<typeof UserDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Information: Story = {};

export const MultipleStores: Story = {
  args: {
    data: {
      ...baseData,
      managerRole: "none",
      managerInvitationState: { kind: "available", mode: "addition", replacesStaleInvitation: false },
      canRemoveManagerRole: false,
      memberships: [...baseData.memberships, shinjukuMembership],
    },
  },
};

export const Notification: Story = {
  args: { activeTab: "notification" },
};

export const NotificationWithoutChannel: Story = {
  args: {
    activeTab: "notification",
    data: {
      ...baseData,
      person: { ...baseData.person, email: "" },
      memberships: [{ ...shibuyaMembership, line: { isLinked: false, isFollowing: false } }],
    },
  },
};

export const LineLinked: Story = {
  args: { activeTab: "line" },
};

export const LineUnlinked: Story = {
  args: {
    activeTab: "line",
    data: {
      ...baseData,
      memberships: [{ ...shibuyaMembership, line: { isLinked: false, isFollowing: false } }],
    },
  },
};

export const ManagerWithoutStore: Story = {
  args: {
    activeTab: "settings",
    selectedShopId: null,
    data: {
      ...baseData,
      memberships: [],
      canRemoveManagerRole: false,
      managerRoleRemovalDisabledReason: "最後の有効管理者の管理者権限は外せません。",
      canRemove: false,
      removeDisabledReason: "最後の有効管理者は削除できません。",
    },
  },
};

export const ReadOnly: Story = {
  args: {
    activeTab: "information",
    data: {
      ...baseData,
      canWrite: false,
      writeDisabledReason: "閲覧のみの管理者は変更できません。",
      canRemoveManagerRole: false,
      managerRoleRemovalDisabledReason: "閲覧のみの管理者は管理者権限を変更できません。",
      canRemove: false,
      removeDisabledReason: "閲覧のみの管理者はユーザーを削除できません。",
    },
  },
};

export const ReadOnlyProfileBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: ReadOnly.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("textbox", { name: "名前" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "変更を保存" })).toBeDisabled();
  },
};

export const ReadOnlyPendingManagerInvitationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    activeTab: "settings",
    data: {
      ...baseData,
      managerRole: "none",
      hasManagerInvitation: true,
      managerInvitationState: { kind: "pending", mode: "addition" },
      canWrite: false,
      writeDisabledReason: "閲覧のみの管理者は変更できません。",
      canRemoveManagerRole: false,
      canRemove: false,
      removeDisabledReason: "閲覧のみの管理者はユーザーを削除できません。",
    },
    state: {
      ...baseState,
      manager: { ...baseState.manager, isAssignmentConfirmationOpen: true },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const resendButton = canvas.getByRole("button", { name: "ログイン案内を再送" });
    await expect(resendButton).toBeDisabled();
    await expect(resendButton).toHaveAccessibleDescription("閲覧のみの管理者は変更できません。");
    await expect(canvas.getAllByText("閲覧のみの管理者は変更できません。")[0]).toBeInTheDocument();
    await expect(
      canvas.queryByRole("heading", { name: "田中 花子さんへログイン案内を再送しますか？" }),
    ).not.toBeInTheDocument();
  },
};

export const ArchivedStore: Story = {
  args: {
    activeTab: "settings",
    data: {
      ...baseData,
      memberships: [{ ...shibuyaMembership, shopStatus: "archived" }],
    },
  },
};

export const ArchivedStoreActionsBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: ArchivedStore.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const removeButton = canvas.getByRole("button", { name: "この店舗から外す" });
    await expect(removeButton).toBeDisabled();
    await expect(removeButton).toHaveAccessibleDescription(
      "アーカイブ済みの店舗では、通知送信やスタッフ設定を変更できません。",
    );
  },
};

export const FutureAssignmentRemovalBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    activeTab: "settings",
    data: {
      ...baseData,
      memberships: [
        {
          ...shibuyaMembership,
          canRemove: false,
          removeDisabledReason: "将来のシフト割当を解除してから、この店舗から外してください。",
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("checkbox", { name: "シフト対象" })).toBeEnabled();
    const removeButton = canvas.getByRole("button", { name: "この店舗から外す" });
    await expect(removeButton).toBeDisabled();
    await expect(removeButton).toHaveAccessibleDescription(
      "将来のシフト割当を解除してから、この店舗から外してください。",
    );
  },
};

export const LongText: Story = {
  args: {
    data: {
      ...baseData,
      person: {
        ...baseData.person,
        name: "東日本エリア統括マネージャー兼店舗運営責任者 田中花子",
        email: "very-long-email-address-for-operation-manager@example-long-domain.co.jp",
      },
      memberships: [
        {
          ...shibuyaMembership,
          shopName: "渋谷駅新南口商業施設フードコート第一店舗",
        },
      ],
    },
  },
};

export const Loading: Story = {
  render: () => <UserDetailSkeleton />,
};

export const MobileSettings: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: { activeTab: "settings" },
};

function NavigationBehaviorHarness() {
  const [tab, setTab] = useState<UserDetailTab>("information");
  return (
    <UserDetailView
      data={baseData}
      selectedShopId={shibuyaShopId}
      activeTab={tab}
      state={baseState}
      actions={{ ...baseActions, onTabChange: setTab }}
    />
  );
}

export const TabNavigationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <NavigationBehaviorHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "通知" }));
    await expect(await canvas.findByRole("heading", { name: "渋谷店の通知" })).toBeInTheDocument();
  },
};

export const StoreSwitchBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    data: { ...baseData, memberships: [...baseData.memberships, shinjukuMembership] },
    selectedShopId: shibuyaShopId,
    actions: { ...baseActions, onSelectShop: selectStore },
  },
  play: async ({ canvasElement }) => {
    selectStore.mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("combobox", { name: "表示する店舗" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("option", { name: "新宿店（プラン停止中）" }));
    await expect(selectStore).toHaveBeenCalledTimes(1);
    await expect(selectStore).toHaveBeenCalledWith(shinjukuShopId);
  },
};

export const NotificationSendBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    activeTab: "notification",
    actions: { ...baseActions, onSendRecruitments: sendRecruitments },
  },
  play: async ({ canvasElement }) => {
    sendRecruitments.mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "募集中のシフトを送る" }));
    await expect(sendRecruitments).toHaveBeenCalledTimes(1);
  },
};

export const LineLinkBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    activeTab: "line",
    data: {
      ...baseData,
      memberships: [{ ...shibuyaMembership, line: { isLinked: false, isFollowing: false } }],
    },
    actions: { ...baseActions, onShowLineQr: showLineLink },
  },
  play: async ({ canvasElement }) => {
    showLineLink.mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "LINE連携リンクを表示" }));
    await expect(showLineLink).toHaveBeenCalledTimes(1);
  },
};

export const ManagerAssignmentBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    activeTab: "settings",
    data: {
      ...baseData,
      managerRole: "none",
      managerInvitationState: { kind: "available", mode: "addition", replacesStaleInvitation: false },
      canRemoveManagerRole: false,
    },
    state: {
      ...baseState,
      manager: { ...baseState.manager, isAssignmentConfirmationOpen: true },
    },
    actions: { ...baseActions, onAssignManager: assignManager },
  },
  play: async ({ canvasElement }) => {
    assignManager.mockClear();
    const canvas = within(canvasElement);
    const confirmationButtons = canvas.getAllByRole("button", { name: "管理者として招待" });
    await userEvent.click(confirmationButtons[confirmationButtons.length - 1]);
    await expect(assignManager).toHaveBeenCalledTimes(1);
  },
};

function ProfileSubscriptionHarness() {
  const [data, setData] = useState(baseData);
  return (
    <>
      <Button
        onClick={() =>
          setData((current) => ({
            ...current,
            person: { ...current.person, name: "田中 花子（別の管理者が更新）" },
          }))
        }
      >
        別の管理者の更新を反映
      </Button>
      <UserDetailView
        data={data}
        selectedShopId={shibuyaShopId}
        activeTab="information"
        state={baseState}
        actions={baseActions}
      />
    </>
  );
}

export const ProfileSubscriptionUpdateBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ProfileSubscriptionHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nameInput = canvas.getByRole("textbox", { name: "名前" });
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "保存前の入力");
    await userEvent.click(canvas.getByRole("button", { name: "別の管理者の更新を反映" }));
    await expect(canvas.getByRole("textbox", { name: "名前" })).toHaveValue("田中 花子（別の管理者が更新）");
  },
};

function MembershipRemovalHarness() {
  const [dialog, setDialog] = useState<UserDetailDialog>(null);
  return (
    <UserDetailView
      data={baseData}
      selectedShopId={shibuyaShopId}
      activeTab="settings"
      state={{ ...baseState, membership: { ...baseState.membership, dialog } }}
      actions={{
        ...baseActions,
        onRequestRemoveMembership: () => setDialog({ kind: "removeMembership", membership: shibuyaMembership }),
        onConfirmRemoveMembership: confirmMembershipRemoval,
        onCloseMembershipDialog: () => setDialog(null),
      }}
    />
  );
}

export const MembershipRemovalConfirmationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <MembershipRemovalHarness />,
  play: async ({ canvasElement }) => {
    confirmMembershipRemoval.mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "この店舗から外す" }));
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("alertdialog", { name: "渋谷店から外す" });
    await userEvent.click(within(dialog).getByRole("button", { name: "この店舗から外す" }));
    await expect(confirmMembershipRemoval).toHaveBeenCalledTimes(1);
  },
};

function ManagerRemovalHarness() {
  const [dialog, setDialog] = useState<UserDetailDialog>(null);
  return (
    <UserDetailView
      data={baseData}
      selectedShopId={shibuyaShopId}
      activeTab="settings"
      state={{ ...baseState, manager: { ...baseState.manager, dialog } }}
      actions={{
        ...baseActions,
        onRequestRemoveManagerRole: () => setDialog({ kind: "removeManagerRole" }),
        onConfirmManagerSetting: confirmManagerRemoval,
        onCloseManagerDialog: () => setDialog(null),
      }}
    />
  );
}

export const ManagerRoleRemovalConfirmationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ManagerRemovalHarness />,
  play: async ({ canvasElement }) => {
    confirmManagerRemoval.mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "管理者権限を外す" }));
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("alertdialog", {
      name: "管理者権限を外す",
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "管理者権限を外す" }));
    await expect(confirmManagerRemoval).toHaveBeenCalledTimes(1);
  },
};

function PersonRemovalHarness() {
  const [dialog, setDialog] = useState<UserDetailDialog>(null);
  return (
    <UserDetailView
      data={baseData}
      selectedShopId={shibuyaShopId}
      activeTab="settings"
      state={{ ...baseState, manager: { ...baseState.manager, dialog } }}
      actions={{
        ...baseActions,
        onRequestRemovePerson: () => setDialog({ kind: "removePerson" }),
        onConfirmManagerSetting: confirmPersonRemoval,
        onCloseManagerDialog: () => setDialog(null),
      }}
    />
  );
}

export const PersonRemovalConfirmationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <PersonRemovalHarness />,
  play: async ({ canvasElement }) => {
    confirmPersonRemoval.mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "グループから削除" }));
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("alertdialog", {
      name: "グループからユーザーを削除",
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "グループから削除" }));
    await expect(confirmPersonRemoval).toHaveBeenCalledTimes(1);
  },
};
