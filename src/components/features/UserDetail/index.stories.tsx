import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import { AuthenticatedAppShell } from "@/src/components/templates/AuthenticatedAppShell";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import type { UserDetailData, UserDetailDialog, UserDetailPanel, UserMembershipChangeInput } from "./types";
import { UserDetailSkeleton } from "./UserDetailSkeleton";
import { UserDetailView, type UserDetailViewProps } from "./UserDetailView";

const personId = "person-tanaka" as Id<"organizationPeople">;
const shibuyaStaffId = "staff-shibuya" as Id<"staffs">;
const shibuyaShopId = "shop-shibuya" as Id<"shops">;
const shinjukuStaffId = "staff-shinjuku" as Id<"staffs">;
const shinjukuShopId = "shop-shinjuku" as Id<"shops">;

const removalPreview = (assignmentCount: number, fingerprint = `preview-${assignmentCount}`) => ({
  kind: "ready" as const,
  asOfDate: "2026-07-22",
  assignmentCount,
  fingerprint,
});

const shibuyaMembership: UserDetailData["memberships"][number] = {
  staffId: shibuyaStaffId,
  shopId: shibuyaShopId,
  shopName: "渋谷店",
  shopStatus: "active",
  excludedFromShift: false,
  canRemove: true,
  removalPreview: removalPreview(2, "shibuya-preview"),
};

const shinjukuMembership: UserDetailData["memberships"][number] = {
  staffId: shinjukuStaffId,
  shopId: shinjukuShopId,
  shopName: "新宿店",
  shopStatus: "active",
  excludedFromShift: true,
  canRemove: true,
  removalPreview: removalPreview(0, "shinjuku-preview"),
};

const shibuyaShop: UserDetailData["shops"][number] = {
  shopId: shibuyaShopId,
  shopName: "渋谷店",
  shopStatus: "active",
  canChangeMembership: true,
};

const shinjukuShop: UserDetailData["shops"][number] = {
  shopId: shinjukuShopId,
  shopName: "新宿店",
  shopStatus: "active",
  canChangeMembership: true,
};

const ikebukuroShop: UserDetailData["shops"][number] = {
  shopId: "shop-ikebukuro" as Id<"shops">,
  shopName: "池袋店",
  shopStatus: "active",
  canChangeMembership: true,
};

const yokohamaShop: UserDetailData["shops"][number] = {
  shopId: "shop-yokohama" as Id<"shops">,
  shopName: "横浜店",
  shopStatus: "active",
  canChangeMembership: true,
};
const storyRequestId = "00000000-0000-4000-8000-000000000001";

const baseData: UserDetailData = {
  person: {
    id: personId,
    name: "田中 花子",
    email: "hanako.tanaka@example.com",
    hasLinkedAccount: true,
  },
  isSelf: false,
  managerRole: "active",
  hasManagerInvitation: false,
  canRemoveManagerRole: true,
  managerRoleRemovalDisabledReason: undefined,
  canRemove: false,
  removeDisabledReason: "管理者は削除できません。先に管理者権限を外してください。",
  removalPreview: removalPreview(2),
  canWrite: true,
  line: {
    status: "linked_following",
    actionShopId: shibuyaShopId,
    sourceStaffId: shibuyaStaffId,
    sourceShopId: shibuyaShopId,
    canLink: true,
    canDisconnect: true,
  },
  membershipFingerprint: "membership-fingerprint",
  shops: [shibuyaShop],
  memberships: [shibuyaMembership],
};

const multipleStoresData: UserDetailData = {
  ...baseData,
  managerRole: "none",
  canRemoveManagerRole: false,
  canRemove: true,
  removeDisabledReason: undefined,
  shops: [shibuyaShop, shinjukuShop, ikebukuroShop, yokohamaShop],
  memberships: [shibuyaMembership, shinjukuMembership],
};

const activeManagerMultipleStoresData: UserDetailData = {
  ...multipleStoresData,
  managerRole: "active",
  canRemoveManagerRole: true,
  canRemove: false,
  removeDisabledReason: "管理者は削除できません。先に管理者権限を外してください。",
};

const lineUnlinkedData: UserDetailData = {
  ...multipleStoresData,
  line: { ...multipleStoresData.line, status: "unlinked", canDisconnect: false },
};

const lineUnfollowedData: UserDetailData = {
  ...multipleStoresData,
  line: { ...multipleStoresData.line, status: "linked_unfollowed" },
};

const lineWithoutEmailData: UserDetailData = {
  ...lineUnlinkedData,
  person: { ...lineUnlinkedData.person, email: "" },
};

const lineBillingReadOnlyData: UserDetailData = {
  ...multipleStoresData,
  canWrite: false,
  writeDisabledReason: "契約状態を確認できるまで、ユーザー情報を変更できません。",
  line: {
    ...multipleStoresData.line,
    canLink: false,
    linkDisabledReason: "契約状態を確認できるまで、ユーザー情報を変更できません。",
    canDisconnect: true,
  },
};

const lineWithoutMembershipData: UserDetailData = {
  ...multipleStoresData,
  memberships: [],
  line: {
    ...multipleStoresData.line,
    sourceStaffId: null,
    sourceShopId: null,
    canLink: false,
    linkDisabledReason: "LINE連携を設定するには、稼働中の店舗へ所属を追加してください。",
  },
};

const unlinkedData: UserDetailData = {
  ...multipleStoresData,
  person: { ...multipleStoresData.person, hasLinkedAccount: false },
  managerRole: "none",
};

const selfManagerData: UserDetailData = {
  ...baseData,
  isSelf: true,
};

const selfStaffData: UserDetailData = {
  ...multipleStoresData,
  isSelf: true,
};

const baseState: UserDetailViewProps["state"] = {
  isUpdatingProfile: false,
  line: {
    authorizeUrl: null,
    showQr: false,
    isQrLoading: false,
    isSendingInvite: false,
    isLineInviteCooldownActive: false,
    isLineInviteCooldownLoading: false,
    isDisconnecting: false,
  },
  membership: {
    isChanging: false,
  },
  removal: {
    dialog: null,
    isRemoving: false,
  },
};

const noop = () => undefined;
const asyncNoop = async () => undefined;

const settleBasicInformationDialogFocus = async () => {
  const dialog = await screen.findByRole("dialog", { name: "スタッフ情報" });
  const nameInput = within(dialog).getByRole("textbox", { name: "名前" });

  await waitFor(() => expect(nameInput).toHaveFocus());
  dialog.focus();
  await expect(dialog).toHaveFocus();
};

const baseActions: UserDetailViewProps["actions"] = {
  onBack: noop,
  onOpenBasic: noop,
  onOpenLine: noop,
  onOpenAddShop: noop,
  onOpenShop: noop,
  onClosePanel: noop,
  onUpdateProfile: asyncNoop,
  onShowLineQr: asyncNoop,
  onSendLineInvite: asyncNoop,
  onDisconnectLine: async () => false,
  onChangeMemberships: asyncNoop,
  onRequestRemovePerson: noop,
  onConfirmRemovePerson: asyncNoop,
  onCloseRemovalDialog: noop,
};

const meta = {
  title: "Features/UserDetail",
  component: UserDetailView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, context) =>
      context.parameters.appComposition ? (
        <Story />
      ) : (
        <Box bg="gray.50" minH="100dvh" p={{ base: 4, md: 8 }}>
          <Box maxW="1024px" mx="auto">
            <Story />
          </Box>
        </Box>
      ),
  ],
  args: {
    data: multipleStoresData,
    state: baseState,
    actions: baseActions,
  },
} satisfies Meta<typeof UserDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MainView: Story = {};

export const NoShopMemberships: Story = {
  args: { data: lineWithoutMembershipData },
};

export const MainViewMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const AppCompositionDesktop: Story = {
  name: "スタッフ詳細・新shell・デスクトップ",
  parameters: { appComposition: true, vrt: { releaseFixedHeader: true } },
  render: (args) => (
    <AuthenticatedAppShell activeKey="staff" activeOrganizationId="organization-preview">
      <AuthenticatedPageContent includeMobileNavigation>
        <UserDetailView {...args} />
      </AuthenticatedPageContent>
    </AuthenticatedAppShell>
  ),
};

export const AppCompositionMobile: Story = {
  ...AppCompositionDesktop,
  name: "スタッフ詳細・新shell・モバイル414px",
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const BasicInformationDialog: Story = {
  args: { activePanel: "basic" },
  play: settleBasicInformationDialogFocus,
};

export const ManagerSettingsRemoved: Story = {
  parameters: { screenshot: { skip: true } },
  args: { activePanel: "basic" },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "スタッフ情報" });
    await expect(within(dialog).queryByRole("heading", { name: "管理者権限" })).not.toBeInTheDocument();
    await expect(within(dialog).queryByText(/権限の変更は管理者設定から行えます/)).not.toBeInTheDocument();
  },
};

export const LinkedStaffContactEditable: Story = {
  args: { activePanel: "basic", data: multipleStoresData },
  parameters: { screenshot: { skip: true } },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "スタッフ情報" });
    await expect(within(dialog).getByRole("textbox", { name: "シフト通知先メールアドレス" })).toHaveValue(
      "hanako.tanaka@example.com",
    );
  },
};

export const UnlinkedStaffContactEditable: Story = {
  args: { activePanel: "basic", data: unlinkedData },
  parameters: { screenshot: { skip: true } },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "スタッフ情報" });
    await expect(within(dialog).getByRole("textbox", { name: "シフト通知先メールアドレス" })).toHaveValue(
      "hanako.tanaka@example.com",
    );
  },
};

export const SelfContactGuidance: Story = {
  args: { activePanel: "basic", data: selfManagerData },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "スタッフ情報" });

    await expect(await within(dialog).findByText(/シフト通知先のメールアドレスです。/)).toBeInTheDocument();
    await expect(within(dialog).findByRole("link", { name: "アカウント設定" })).resolves.toHaveAttribute(
      "href",
      "/account",
    );
  },
};

export const SelfContactGuidanceMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  args: { activePanel: "basic", data: selfManagerData },
};

export const SelfStaffContactWithoutLoginGuidance: Story = {
  parameters: { screenshot: { skip: true } },
  args: { activePanel: "basic", data: selfStaffData },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "スタッフ情報" });

    await expect(within(dialog).queryByText("シフト通知先のメールアドレスです。")).not.toBeInTheDocument();
    await expect(within(dialog).queryByRole("link", { name: "アカウント設定" })).not.toBeInTheDocument();
  },
};

export const BasicInformationDialogMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: { activePanel: "basic" },
  play: settleBasicInformationDialogFocus,
};

export const LineLinkedDialog: Story = {
  args: { activePanel: "line", data: multipleStoresData },
};

export const LineUnlinkedDialog: Story = {
  args: { activePanel: "line", data: lineUnlinkedData },
};

export const LineInviteCooldownDialog: Story = {
  args: {
    activePanel: "line",
    data: lineUnlinkedData,
    state: {
      ...baseState,
      line: {
        ...baseState.line,
        isLineInviteCooldownActive: true,
      },
    },
  },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "LINE連携" });
    const content = within(dialog);

    await expect(content.getByRole("button", { name: "メールでLINE連携リンクを送る" })).toBeDisabled();
    await expect(content.getByRole("button", { name: "LINE連携リンクを表示" })).toBeEnabled();
  },
};

export const LineInviteCooldownDialogMobile: Story = {
  ...LineInviteCooldownDialog,
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const LineUnfollowedDialog: Story = {
  args: { activePanel: "line", data: lineUnfollowedData },
};

export const LineWithoutEmailDialog: Story = {
  args: { activePanel: "line", data: lineWithoutEmailData },
};

export const LineBillingReadOnlyDialog: Story = {
  args: { activePanel: "line", data: lineBillingReadOnlyData },
};

export const LineWithoutMembershipDialog: Story = {
  args: { activePanel: "line", data: lineWithoutMembershipData },
};

export const LineUnlinkedDialogMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: { activePanel: "line", data: lineUnlinkedData },
};

export const LineLinkedDialogMobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: { activePanel: "line", data: multipleStoresData },
};

export const ReadOnlyInformationDialog: Story = {
  args: {
    activePanel: "basic",
    data: {
      ...multipleStoresData,
      canWrite: false,
      writeDisabledReason: "現在、この組織の情報を変更できません。",
    },
  },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "スタッフ情報" });
    await expect(within(dialog).queryByRole("button", { name: "変更を保存" })).not.toBeInTheDocument();
    await expect(within(dialog).getAllByRole("button", { name: "閉じる" })).toHaveLength(2);
  },
};

export const ShopMembershipDialog: Story = {
  args: { activePanel: "addShop" },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "所属店舗を変更" });
    const currentMembership = within(dialog).getByRole("checkbox", { name: /渋谷店/ });

    await waitFor(() => expect(currentMembership).toHaveFocus());
    dialog.focus();
    await expect(dialog).toHaveFocus();
  },
};

export const ShopMembershipDialogMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: { activePanel: "addShop" },
};

export const ShopMembershipRemoval: Story = {
  args: { activePanel: "addShop", data: activeManagerMultipleStoresData },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "所属店舗を変更" });
    const content = within(dialog);

    await userEvent.click(content.getByRole("checkbox", { name: /渋谷店/ }));
    await content.findByText("店舗から外す");
    await expect(content.getByText("店舗から外れるスタッフがいます")).toBeInTheDocument();
    await expect(content.getByText(/今日以降のシフトから削除されます/)).toBeInTheDocument();
    await expect(content.getByText(/外した店舗のシフト通知は届かなくなります/)).toBeInTheDocument();
  },
};

export const ShopMembershipRemovalMobile: Story = {
  ...ShopMembershipRemoval,
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const ShopMembershipChangeUnavailable: Story = {
  args: {
    activePanel: "addShop",
    data: {
      ...multipleStoresData,
      canWrite: false,
      writeDisabledReason: "現在の契約状態では、所属店舗を変更できません。",
    },
  },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "所属店舗を変更" });
    const content = within(dialog);
    for (const checkbox of content.getAllByRole("checkbox")) {
      await expect(checkbox).toBeDisabled();
    }
    await expect(content.getByRole("button", { name: "変更する" })).toBeDisabled();
    await expect(content.getByText("現在の契約状態では、所属店舗を変更できません。")).toBeInTheDocument();
  },
};

export const PersonRemovalZeroAssignments: Story = createPersonRemovalStory(0);
export const PersonRemovalOneAssignment: Story = createPersonRemovalStory(1);
export const PersonRemovalMultipleAssignments: Story = createPersonRemovalStory(3);

export const PersonRemovalUnavailable: Story = {
  args: {
    data: {
      ...baseData,
      canRemove: false,
      removeDisabledReason: "管理者は削除できません。",
    },
  },
};

export const RestrictedRecoveryRemoval: Story = {
  args: {
    data: {
      ...multipleStoresData,
      canWrite: false,
      writeDisabledReason:
        "プラン上限を超過しているため、利用人数・店舗・管理者を上限内に減らすか、プランを変更してください。",
      canRemove: true,
      removeDisabledReason: undefined,
    },
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
      shops: [
        {
          ...shibuyaShop,
          shopName: "渋谷駅新南口商業施設フードコート第一店舗",
        },
      ],
      memberships: [
        {
          ...shibuyaMembership,
          shopName: "渋谷駅新南口商業施設フードコート第一店舗",
        },
      ],
    },
  },
};

function createPersonRemovalStory(assignmentCount: number): Story {
  const preview = removalPreview(assignmentCount, `story-preview-${assignmentCount}`);
  return {
    args: {
      data: { ...multipleStoresData, removalPreview: preview },
      state: {
        ...baseState,
        removal: {
          ...baseState.removal,
          dialog: {
            kind: "removePerson",
            personId,
            shopId: shibuyaShopId,
            removalPreview: preview,
            requestId: storyRequestId,
          },
        },
      },
    },
  };
}

export const Loading: Story = {
  render: () => <UserDetailSkeleton />,
};

export const LoadingMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: () => <UserDetailSkeleton />,
};

function PanelNavigationHarness({
  data = unlinkedData,
  onMembershipChange,
}: {
  data?: UserDetailData;
  onMembershipChange?: (input: UserMembershipChangeInput) => void;
}) {
  const [activePanel, setActivePanel] = useState<UserDetailPanel>();
  const [membershipChangeInput, setMembershipChangeInput] = useState<UserMembershipChangeInput | null>(null);
  const [membershipChangeCallCount, setMembershipChangeCallCount] = useState(0);
  const [removalDialog, setRemovalDialog] = useState<UserDetailDialog>(null);

  return (
    <>
      <output hidden data-testid="membership-change-input">
        {membershipChangeInput ? JSON.stringify(membershipChangeInput) : ""}
      </output>
      <output hidden data-testid="membership-change-call-count">
        {membershipChangeCallCount}
      </output>
      <UserDetailView
        data={data}
        activePanel={activePanel}
        state={{
          ...baseState,
          removal: { ...baseState.removal, dialog: removalDialog },
        }}
        actions={{
          ...baseActions,
          onOpenBasic: () => setActivePanel("basic"),
          onOpenLine: () => setActivePanel("line"),
          onOpenAddShop: () => setActivePanel("addShop"),
          onClosePanel: () => setActivePanel(undefined),
          onRequestRemovePerson: () =>
            setRemovalDialog({
              kind: "removePerson",
              personId: data.person.id,
              shopId: shibuyaShopId,
              removalPreview: data.removalPreview,
              requestId: storyRequestId,
            }),
          onCloseRemovalDialog: () => setRemovalDialog(null),
          onChangeMemberships: async (input) => {
            setMembershipChangeInput(input);
            setMembershipChangeCallCount((count) => count + 1);
            onMembershipChange?.(input);
          },
        }}
      />
    </>
  );
}

function LinePanelHarness({ data = lineUnlinkedData }: { data?: UserDetailData }) {
  const [activePanel, setActivePanel] = useState<UserDetailPanel>();
  const [showQr, setShowQr] = useState(false);
  const [disconnectCount, setDisconnectCount] = useState(0);

  return (
    <>
      <output hidden data-testid="line-disconnect-count">
        {disconnectCount}
      </output>
      <UserDetailView
        data={data}
        activePanel={activePanel}
        state={{
          ...baseState,
          line: {
            ...baseState.line,
            showQr,
            authorizeUrl: showQr ? "https://example.com/line/authorize" : null,
          },
        }}
        actions={{
          ...baseActions,
          onOpenLine: () => setActivePanel("line"),
          onClosePanel: () => setActivePanel(undefined),
          onShowLineQr: async () => setShowQr(true),
          onDisconnectLine: async () => {
            setDisconnectCount((count) => count + 1);
            return true;
          },
        }}
      />
    </>
  );
}

export const BasicInformationFlowBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <PanelNavigationHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await expect(canvas.queryByRole("textbox", { name: "名前" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "スタッフ情報を開く" }));

    const dialog = await page.findByRole("dialog", { name: "スタッフ情報" });
    const basicDialog = within(dialog);
    await expect(basicDialog.getByRole("textbox", { name: "名前" })).toHaveValue("田中 花子");
    await expect(basicDialog.getByRole("textbox", { name: "シフト通知先メールアドレス" })).toHaveValue(
      "hanako.tanaka@example.com",
    );
    await expect(basicDialog.queryByRole("heading", { name: "管理者権限" })).not.toBeInTheDocument();
    await userEvent.click(basicDialog.getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "スタッフ情報" })).not.toBeInTheDocument());
  },
};

export const LineQrDisplayBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <LinePanelHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "LINE連携を開く" }));
    const dialog = await page.findByRole("dialog", { name: "LINE連携" });
    const content = within(dialog);
    await userEvent.click(content.getByRole("button", { name: "LINE連携リンクを表示" }));

    await expect(await content.findByRole("img", { name: "LINE連携用QRコード" })).toBeInTheDocument();
    await expect(content.getByText("田中 花子さん専用のURL（QRコード）です。")).toBeInTheDocument();
    await expect(content.getByText("ほかのスタッフには共有しないでください。")).toBeInTheDocument();
  },
};

export const LineDisconnectInlineConfirmationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <LinePanelHarness data={multipleStoresData} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "LINE連携を開く" }));
    const dialog = await page.findByRole("dialog", { name: "LINE連携" });
    await userEvent.click(within(dialog).getByRole("button", { name: "LINE連携を解除" }));

    const confirmation = await page.findByRole("alertdialog", { name: "LINE連携を解除" });
    const confirmationContent = within(confirmation);
    await expect(
      confirmationContent.getByText("この組織のすべての所属店舗でLINE通知が停止します。"),
    ).toBeInTheDocument();
    await expect(confirmationContent.getByText("ほかの組織のLINE連携には影響しません。")).toBeInTheDocument();
    await expect(confirmationContent.getByRole("button", { name: "戻る" })).toHaveFocus();

    await userEvent.click(confirmationContent.getByRole("button", { name: "戻る" }));
    const reopenedDialog = await page.findByRole("dialog", { name: "LINE連携" });
    const disconnectTrigger = within(reopenedDialog).getByRole("button", { name: "LINE連携を解除" });
    await waitFor(() => expect(disconnectTrigger).toHaveFocus());
    await userEvent.click(disconnectTrigger);
    const reopenedConfirmation = await page.findByRole("alertdialog", { name: "LINE連携を解除" });
    await userEvent.click(within(reopenedConfirmation).getByRole("button", { name: "LINE連携を解除する" }));

    await expect(canvas.getByTestId("line-disconnect-count")).toHaveTextContent("1");
    await expect(page.queryByRole("alertdialog", { name: "LINE連携を解除" })).not.toBeInTheDocument();
  },
};

export const PersonRemovalConfirmationAccessibilityBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <PanelNavigationHarness data={{ ...multipleStoresData, removalPreview: removalPreview(0) }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const confirmationQuestion = "田中 花子さんを完全に削除しますか？";
    const requestButton = canvas.getByRole("button", { name: "削除する" });

    await expect(canvas.queryByText(confirmationQuestion)).not.toBeInTheDocument();
    await userEvent.click(requestButton);

    const confirmation = await page.findByRole("alertdialog", { name: "スタッフを削除" });
    const confirmationContent = within(confirmation);
    await expect(confirmationContent.getByText(confirmationQuestion)).toBeInTheDocument();
    await expect(confirmationContent.getByText("組織と所属する全店舗から完全に削除します。")).toBeInTheDocument();
    await expect(confirmationContent.getByText("この操作はもとに戻せません。")).toBeInTheDocument();
    await expect(confirmationContent.queryByText("過去のシフト履歴は保持されます。")).not.toBeInTheDocument();
    await expect(
      confirmationContent.queryByText("今日以降のシフトには割り当てられていないため、シフトへの影響はありません。"),
    ).not.toBeInTheDocument();
    await userEvent.click(within(confirmation).getByRole("button", { name: "やめる" }));
    await expect(page.queryByRole("alertdialog", { name: "スタッフを削除" })).not.toBeInTheDocument();
    await expect(requestButton).toHaveFocus();
  },
};

export const UnassignedShopVisibilityBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <PanelNavigationHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("button", { name: "渋谷店の詳細を開く" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "新宿店の詳細を開く" })).toBeInTheDocument();
    await expect(canvas.queryByText("池袋店")).not.toBeInTheDocument();
    await expect(canvas.queryByText("横浜店")).not.toBeInTheDocument();
    await expect(canvas.queryByText("現在の店舗")).not.toBeInTheDocument();
  },
};

export const ShopMembershipChangeFlowBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <PanelNavigationHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "所属店舗を変更する" }));
    const dialog = await page.findByRole("dialog", { name: "所属店舗を変更" });
    const membershipDialog = within(dialog);
    const shibuyaCheckbox = membershipDialog.getByRole("checkbox", { name: /渋谷店/ });
    const shinjukuCheckbox = membershipDialog.getByRole("checkbox", { name: /新宿店/ });
    const ikebukuroCheckbox = membershipDialog.getByRole("checkbox", { name: /池袋店/ });
    const yokohamaCheckbox = membershipDialog.getByRole("checkbox", { name: /横浜店/ });
    const submitButton = membershipDialog.getByRole("button", { name: "変更する" });

    await expect(membershipDialog.queryByText("変更内容")).not.toBeInTheDocument();
    await expect(shibuyaCheckbox).toBeChecked();
    await expect(shinjukuCheckbox).toBeChecked();
    await expect(shinjukuCheckbox).toBeEnabled();
    await expect(ikebukuroCheckbox).not.toBeChecked();
    await expect(yokohamaCheckbox).not.toBeChecked();
    await expect(yokohamaCheckbox).toBeEnabled();
    await expect(submitButton).toBeDisabled();

    await userEvent.click(ikebukuroCheckbox);
    await expect(canvas.getByTestId("membership-change-call-count")).toHaveTextContent("0");
    await expect(submitButton).toBeEnabled();
    await expect(membershipDialog.getByText("店舗に追加")).toBeInTheDocument();
    await expect(membershipDialog.getAllByText("店舗に追加")).toHaveLength(1);
    await expect(
      membershipDialog.getByText("追加した店舗の募集中シフトを、このスタッフへ送信します。"),
    ).toBeInTheDocument();
    await expect(membershipDialog.queryByText("店舗から外れるスタッフがいます")).not.toBeInTheDocument();

    await userEvent.click(submitButton);
    await expect(canvas.getByTestId("membership-change-call-count")).toHaveTextContent("1");
    await expect(canvas.getByTestId("membership-change-input")).toHaveTextContent(`"shopId":"${ikebukuroShop.shopId}"`);
    await expect(canvas.getByTestId("membership-change-input")).toHaveTextContent(
      `"desiredActiveShopIds":["${shibuyaShopId}","${shinjukuShop.shopId}","${ikebukuroShop.shopId}"]`,
    );
  },
};

export const ShopMembershipRemovalBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <PanelNavigationHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "所属店舗を変更する" }));
    const dialog = await page.findByRole("dialog", { name: "所属店舗を変更" });
    const membershipDialog = within(dialog);
    const shibuyaCheckbox = membershipDialog.getByRole("checkbox", { name: /渋谷店/ });

    await expect(membershipDialog.queryByText("店舗から外れるスタッフがいます")).not.toBeInTheDocument();
    await userEvent.click(membershipDialog.getByRole("checkbox", { name: /池袋店/ }));
    await expect(membershipDialog.getByText("店舗に追加")).toBeInTheDocument();
    await expect(membershipDialog.queryByText("店舗から外れるスタッフがいます")).not.toBeInTheDocument();

    await userEvent.click(shibuyaCheckbox);
    await expect(membershipDialog.getByText("店舗から外す")).toBeInTheDocument();
    await expect(membershipDialog.getByText("店舗から外れるスタッフがいます")).toBeInTheDocument();
    await expect(membershipDialog.getByText(/今日以降のシフトから削除されます/)).toBeInTheDocument();
    await expect(membershipDialog.getByText(/外した店舗のシフト通知は届かなくなります/)).toBeInTheDocument();
    await expect(shibuyaCheckbox).toHaveAccessibleDescription(
      /店舗から外れるスタッフがいます.*今日以降のシフトから削除されます.*シフト通知は届かなくなります/,
    );
    await expect(membershipDialog.queryByText(/過去のシフト記録/)).not.toBeInTheDocument();
    await expect(membershipDialog.queryByText(/シフト割り当て.*件/)).not.toBeInTheDocument();
    await expect(membershipDialog.getByRole("button", { name: "変更する" })).toBeEnabled();

    await userEvent.click(shibuyaCheckbox);
    await waitFor(() => expect(membershipDialog.queryByText("店舗から外れるスタッフがいます")).not.toBeInTheDocument());
    await userEvent.click(shibuyaCheckbox);
    await expect(canvas.getByTestId("membership-change-call-count")).toHaveTextContent("0");
    await userEvent.click(membershipDialog.getByRole("button", { name: "変更する" }));

    await expect(canvas.getByTestId("membership-change-call-count")).toHaveTextContent("1");
    await expect(canvas.getByTestId("membership-change-input")).toHaveTextContent(`"staffId":"${shibuyaStaffId}"`);
    await expect(canvas.getByTestId("membership-change-input")).toHaveTextContent(
      `"desiredActiveShopIds":["${shinjukuShop.shopId}","${ikebukuroShop.shopId}"]`,
    );
    await expect(page.queryAllByRole("alertdialog")).toHaveLength(0);
  },
};

export const ShopMembershipFullRemovalWarningBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => (
    <PanelNavigationHarness data={{ ...multipleStoresData, shops: [shibuyaShop], memberships: [shibuyaMembership] }} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "所属店舗を変更する" }));
    const dialog = await page.findByRole("dialog", { name: "所属店舗を変更" });
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /渋谷店/ }));
    const membershipDialog = within(dialog);
    await expect(membershipDialog.getByText("変更後、このスタッフの所属店舗は0店舗になります")).toBeInTheDocument();
    await expect(membershipDialog.getByText("組織への所属や利用人数のカウントは残ります。")).toBeInTheDocument();
  },
};

export const ShopMembershipNoShopBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    activePanel: "addShop",
    data: {
      ...multipleStoresData,
      shops: [],
      memberships: [],
    },
  },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "所属店舗を変更" });
    const content = within(dialog);
    await expect(content.queryByRole("checkbox")).not.toBeInTheDocument();
    await expect(content.getByRole("button", { name: "変更する" })).toBeDisabled();
    await expect(content.getByText("店舗がないため、所属店舗を変更できません。")).toBeInTheDocument();
  },
};

const aggregateRemovalLimitData: UserDetailData = {
  ...baseData,
  managerRole: "none",
  shops: [
    shibuyaShop,
    {
      ...shinjukuShop,
      shopStatus: "active",
      canChangeMembership: true,
      membershipChangeDisabledReason: undefined,
    },
  ],
  memberships: [
    {
      ...shibuyaMembership,
      removalPreview: removalPreview(251, "shibuya-large-preview"),
    },
    {
      ...shinjukuMembership,
      shopStatus: "active",
      canRemove: true,
      removeDisabledReason: undefined,
      removalPreview: removalPreview(250, "shinjuku-large-preview"),
    },
  ],
};

export const ShopMembershipAggregateRemovalLimitBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <PanelNavigationHarness data={aggregateRemovalLimitData} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "所属店舗を変更する" }));
    const dialog = await page.findByRole("dialog", { name: "所属店舗を変更" });
    const membershipDialog = within(dialog);
    await userEvent.click(membershipDialog.getByRole("checkbox", { name: /渋谷店/ }));
    await userEvent.click(membershipDialog.getByRole("checkbox", { name: /新宿店/ }));

    await expect(membershipDialog.getAllByText("店舗から外す")).toHaveLength(2);
    await expect(membershipDialog.getAllByText("店舗から外れるスタッフがいます")).toHaveLength(1);
    await expect(membershipDialog.getAllByText(/今日以降のシフトから削除されます/)).toHaveLength(1);
    await expect(membershipDialog.getAllByText(/外した店舗のシフト通知は届かなくなります/)).toHaveLength(1);
    await userEvent.click(membershipDialog.getByRole("button", { name: "変更する" }));

    await expect(membershipDialog.getByText(/この画面では変更できません/)).toBeInTheDocument();
    await expect(membershipDialog.getByText(/先にシフトを整理して/)).toBeInTheDocument();
    await expect(membershipDialog.getByRole("button", { name: "変更する" })).toBeDisabled();
    await expect(canvas.getByTestId("membership-change-call-count")).toHaveTextContent("0");
  },
};

function MembershipChangeRetryHarness() {
  const [data, setData] = useState(multipleStoresData);
  const [inputs, setInputs] = useState<UserMembershipChangeInput[]>([]);

  return (
    <>
      <output hidden data-testid="membership-change-retry-inputs">
        {JSON.stringify(inputs)}
      </output>
      <UserDetailView
        data={data}
        activePanel="addShop"
        state={baseState}
        actions={{
          ...baseActions,
          onChangeMemberships: async (input) => {
            setInputs((current) => [...current, input]);
            setData((current) =>
              current.membershipFingerprint === "membership-fingerprint-after-unknown-result"
                ? current
                : {
                    ...current,
                    membershipFingerprint: "membership-fingerprint-after-unknown-result",
                    memberships: current.memberships.filter((membership) => membership.shopId !== shibuyaShopId),
                  },
            );
          },
        }}
      />
    </>
  );
}

export const ShopMembershipUnknownResultRetryBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <MembershipChangeRetryHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "所属店舗を変更" });
    const membershipDialog = within(dialog);
    const shibuyaCheckbox = membershipDialog.getByRole("checkbox", { name: /渋谷店/ });

    await userEvent.click(shibuyaCheckbox);
    await userEvent.click(membershipDialog.getByRole("button", { name: "変更する" }));
    await expect(membershipDialog.getByText(/前回の結果が不明な場合は同じ内容で再試行できます。/)).toBeInTheDocument();

    await userEvent.click(membershipDialog.getByRole("button", { name: "変更する" }));
    await waitFor(() => {
      const serializedInputs = canvas.getByTestId("membership-change-retry-inputs").textContent ?? "[]";
      const submittedInputs = JSON.parse(serializedInputs) as UserMembershipChangeInput[];
      expect(submittedInputs).toHaveLength(2);
      expect(submittedInputs[1]).toEqual(submittedInputs[0]);
      expect(submittedInputs[0]?.removalPreviews).toEqual([
        {
          shopId: shibuyaShopId,
          staffId: shibuyaStaffId,
          assignmentCount: 2,
          fingerprint: "shibuya-preview",
        },
      ]);
    });
  },
};
