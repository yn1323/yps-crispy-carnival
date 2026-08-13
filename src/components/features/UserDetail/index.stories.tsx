import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
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
  line: { isLinked: true, isFollowing: true },
};

const shinjukuMembership: UserDetailData["memberships"][number] = {
  staffId: shinjukuStaffId,
  shopId: shinjukuShopId,
  shopName: "新宿店",
  shopStatus: "planSuspended",
  excludedFromShift: true,
  canRemove: false,
  removeDisabledReason: "稼働中の店舗だけ所属を変更できます。",
  removalPreview: removalPreview(0, "shinjuku-preview"),
  line: { isLinked: true, isFollowing: false },
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
  shopStatus: "planSuspended",
  canChangeMembership: false,
  membershipChangeDisabledReason: "稼働中の店舗だけ所属を変更できます。",
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
  shopStatus: "archived",
  canChangeMembership: false,
  membershipChangeDisabledReason: "稼働中の店舗だけ所属を変更できます。",
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
  managerInvitationState: { kind: "unavailable", reason: "このユーザーはすでに管理者です。" },
  canRemoveManagerRole: true,
  managerRoleRemovalDisabledReason: undefined,
  canRemove: false,
  removeDisabledReason: "管理者は削除できません。先に管理者権限を外してください。",
  removalPreview: removalPreview(2),
  canWrite: true,
  membershipFingerprint: "membership-fingerprint",
  shops: [
    {
      ...shibuyaShop,
      canChangeMembership: false,
      membershipChangeDisabledReason: "管理者は店舗から外せません。先に管理者権限を外してください。",
    },
  ],
  memberships: [
    {
      ...shibuyaMembership,
      canRemove: false,
      removeDisabledReason: "管理者は店舗から外せません。先に管理者権限を外してください。",
    },
  ],
};

const multipleStoresData: UserDetailData = {
  ...baseData,
  managerRole: "none",
  managerInvitationState: { kind: "available", mode: "addition", replacesStaleInvitation: false },
  canRemoveManagerRole: false,
  canRemove: true,
  removeDisabledReason: undefined,
  shops: [shibuyaShop, shinjukuShop, ikebukuroShop, yokohamaShop],
  memberships: [shibuyaMembership, shinjukuMembership],
};

const managerInvitationHiddenData: UserDetailData = {
  ...multipleStoresData,
  hasManagerInvitation: true,
  managerInvitationState: { kind: "hidden" },
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
  onOpenAddShop: noop,
  onOpenShop: noop,
  onClosePanel: noop,
  onUpdateProfile: asyncNoop,
  onChangeMemberships: asyncNoop,
  onManageManagers: noop,
  onRequestRemovePerson: noop,
  onConfirmRemovePerson: asyncNoop,
  onCloseRemovalDialog: noop,
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
    data: multipleStoresData,
    showShopMembershipAddition: true,
    state: baseState,
    actions: baseActions,
  },
} satisfies Meta<typeof UserDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MainView: Story = {};

export const MainViewMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const BasicInformationDialog: Story = {
  args: { activePanel: "basic" },
  play: settleBasicInformationDialogFocus,
};

export const LinkedStaffContactEditable: Story = {
  args: { activePanel: "basic", data: multipleStoresData },
  parameters: { screenshot: { skip: true } },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "スタッフ情報" });
    await expect(within(dialog).getByRole("textbox", { name: "シフト連絡先メールアドレス" })).toHaveValue(
      "hanako.tanaka@example.com",
    );
  },
};

export const UnlinkedStaffContactEditable: Story = {
  args: { activePanel: "basic", data: unlinkedData },
  parameters: { screenshot: { skip: true } },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "スタッフ情報" });
    await expect(within(dialog).getByRole("textbox", { name: "シフト連絡先メールアドレス" })).toHaveValue(
      "hanako.tanaka@example.com",
    );
  },
};

export const SelfContactGuidance: Story = {
  args: { activePanel: "basic", data: selfManagerData },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "スタッフ情報" });

    await expect(await within(dialog).findByText(/シフト通知用先のメールアドレスです。/)).toBeInTheDocument();
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

    await expect(within(dialog).queryByText("シフト通知用先のメールアドレスです。")).not.toBeInTheDocument();
    await expect(within(dialog).queryByRole("link", { name: "アカウント設定" })).not.toBeInTheDocument();
  },
};

export const ManagerInvitationDarkLaunchBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: { activePanel: "basic", data: managerInvitationHiddenData },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "スタッフ情報" });
    await expect(within(dialog).getByRole("textbox", { name: "名前" })).toBeInTheDocument();
    await expect(within(dialog).queryByRole("heading", { name: "管理者権限" })).not.toBeInTheDocument();
    await expect(screen.queryByText("管理者招待中")).not.toBeInTheDocument();
  },
};

export const BasicInformationDialogMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: { activePanel: "basic" },
  play: settleBasicInformationDialogFocus,
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
  args: { activePanel: "addShop" },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "所属店舗を変更" });
    const content = within(dialog);

    await userEvent.click(content.getByRole("checkbox", { name: /渋谷店/ }));
    await content.findByText("今日以降のシフト割り当てから削除します。");
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
      writeDisabledReason: "契約制限中のため、所属店舗を変更できません。",
    },
  },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "所属店舗を変更" });
    const content = within(dialog);
    for (const checkbox of content.getAllByRole("checkbox")) {
      await expect(checkbox).toBeDisabled();
    }
    await expect(content.getByRole("button", { name: "変更する" })).toBeDisabled();
    await expect(content.getByText("契約制限中のため、所属店舗を変更できません。")).toBeInTheDocument();
  },
};

export const ShopMembershipAdditionDarkLaunchBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    activePanel: "addShop",
    data: { ...multipleStoresData, memberships: [] },
    showShopMembershipAddition: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.queryByRole("button", { name: "所属店舗を変更する" })).not.toBeInTheDocument();
    await expect(screen.queryByRole("dialog", { name: "所属店舗を変更" })).not.toBeInTheDocument();
    await expect(canvas.getByText("所属している店舗はありません。")).toBeInTheDocument();
    await expect(
      canvas.queryByText("「所属店舗を変更する」から、このユーザーの所属を変更できます。"),
    ).not.toBeInTheDocument();
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
      writeDisabledReason: "Proの利用上限を超えているため、契約制限中です。",
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
        showShopMembershipAddition
        activePanel={activePanel}
        state={{
          ...baseState,
          removal: { ...baseState.removal, dialog: removalDialog },
        }}
        actions={{
          ...baseActions,
          onOpenBasic: () => setActivePanel("basic"),
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
    await expect(basicDialog.getByRole("textbox", { name: "シフト連絡先メールアドレス" })).toHaveValue(
      "hanako.tanaka@example.com",
    );
    await expect(basicDialog.getByRole("heading", { name: "管理者権限" })).toBeInTheDocument();
    await userEvent.click(basicDialog.getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "スタッフ情報" })).not.toBeInTheDocument());
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
    const submitButton = membershipDialog.getByRole("button", { name: "変更する" });

    await expect(membershipDialog.queryByText("変更内容")).not.toBeInTheDocument();
    await expect(shibuyaCheckbox).toBeChecked();
    await expect(shinjukuCheckbox).toBeChecked();
    await expect(shinjukuCheckbox).toBeDisabled();
    await expect(ikebukuroCheckbox).not.toBeChecked();
    await expect(membershipDialog.queryByRole("checkbox", { name: /横浜店/ })).not.toBeInTheDocument();
    await expect(submitButton).toBeDisabled();

    await userEvent.click(ikebukuroCheckbox);
    await expect(canvas.getByTestId("membership-change-call-count")).toHaveTextContent("0");
    await expect(submitButton).toBeEnabled();
    await expect(membershipDialog.queryByText("今日以降のシフト割り当てから削除します。")).not.toBeInTheDocument();

    await userEvent.click(submitButton);
    await expect(canvas.getByTestId("membership-change-call-count")).toHaveTextContent("1");
    await expect(canvas.getByTestId("membership-change-input")).toHaveTextContent(`"shopId":"${ikebukuroShop.shopId}"`);
    await expect(canvas.getByTestId("membership-change-input")).toHaveTextContent(
      `"desiredActiveShopIds":["${shibuyaShopId}","${ikebukuroShop.shopId}"]`,
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

    await expect(membershipDialog.queryByText("今日以降のシフト割り当てから削除します。")).not.toBeInTheDocument();
    await userEvent.click(membershipDialog.getByRole("checkbox", { name: /池袋店/ }));
    await expect(membershipDialog.queryByText("今日以降のシフト割り当てから削除します。")).not.toBeInTheDocument();

    await userEvent.click(shibuyaCheckbox);
    await expect(membershipDialog.getByText("店舗から外す")).toBeInTheDocument();
    await expect(membershipDialog.getByText("今日以降のシフト割り当てから削除します。")).toBeInTheDocument();
    await expect(membershipDialog.getByText("LINE連携解除、通知がされなくなります。")).toBeInTheDocument();
    await expect(shibuyaCheckbox).toHaveAccessibleDescription(
      /今日以降のシフト割り当てから削除します。.*LINE連携解除、通知がされなくなります。/,
    );
    await expect(membershipDialog.queryByText(/過去のシフト記録/)).not.toBeInTheDocument();
    await expect(membershipDialog.queryByText(/シフト割り当て.*件/)).not.toBeInTheDocument();
    await expect(membershipDialog.getByRole("button", { name: "変更する" })).toBeEnabled();

    await userEvent.click(shibuyaCheckbox);
    await waitFor(() =>
      expect(membershipDialog.queryByText("今日以降のシフト割り当てから削除します。")).not.toBeInTheDocument(),
    );
    await userEvent.click(shibuyaCheckbox);
    await expect(canvas.getByTestId("membership-change-call-count")).toHaveTextContent("0");
    await userEvent.click(membershipDialog.getByRole("button", { name: "変更する" }));

    await expect(canvas.getByTestId("membership-change-call-count")).toHaveTextContent("1");
    await expect(canvas.getByTestId("membership-change-input")).toHaveTextContent(`"staffId":"${shibuyaStaffId}"`);
    await expect(canvas.getByTestId("membership-change-input")).toHaveTextContent(
      `"desiredActiveShopIds":["${ikebukuroShop.shopId}"]`,
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
    await expect(
      membershipDialog.getByText("全店舗から外した場合でも、無所属としてスタッフは残り続けます。"),
    ).toBeInTheDocument();
  },
};

export const ShopMembershipNoActiveShopBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    activePanel: "addShop",
    data: {
      ...multipleStoresData,
      shops: [shinjukuShop, yokohamaShop],
      memberships: [shinjukuMembership],
    },
  },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "所属店舗を変更" });
    const content = within(dialog);
    await expect(content.getByRole("checkbox", { name: /新宿店/ })).toBeChecked();
    await expect(content.getByRole("checkbox", { name: /新宿店/ })).toBeDisabled();
    await expect(content.queryByRole("checkbox", { name: /横浜店/ })).not.toBeInTheDocument();
    await expect(content.getByRole("button", { name: "変更する" })).toBeDisabled();
    await expect(content.getByText("稼働中の店舗がないため、所属店舗を変更できません。")).toBeInTheDocument();
  },
};

const aggregateRemovalLimitData: UserDetailData = {
  ...baseData,
  managerRole: "none",
  managerInvitationState: { kind: "available", mode: "addition", replacesStaleInvitation: false },
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
        showShopMembershipAddition
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
