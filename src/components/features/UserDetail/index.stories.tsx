import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import type { UserDetailData, UserDetailDialog, UserDetailPanel } from "./types";
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
  canRemove: true,
  removalPreview: removalPreview(0, "shinjuku-preview"),
  line: { isLinked: true, isFollowing: false },
};

const shibuyaShop: UserDetailData["shops"][number] = {
  shopId: shibuyaShopId,
  shopName: "渋谷店",
  shopStatus: "active",
};

const shinjukuShop: UserDetailData["shops"][number] = {
  shopId: shinjukuShopId,
  shopName: "新宿店",
  shopStatus: "planSuspended",
};

const ikebukuroShop: UserDetailData["shops"][number] = {
  shopId: "shop-ikebukuro" as Id<"shops">,
  shopName: "池袋店",
  shopStatus: "active",
};

const yokohamaShop: UserDetailData["shops"][number] = {
  shopId: "shop-yokohama" as Id<"shops">,
  shopName: "横浜店",
  shopStatus: "archived",
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
  canRemove: true,
  removeDisabledReason: undefined,
  removalPreview: removalPreview(2),
  canWrite: true,
  shops: [shibuyaShop],
  memberships: [shibuyaMembership],
};

const multipleStoresData: UserDetailData = {
  ...baseData,
  managerRole: "none",
  managerInvitationState: { kind: "available", mode: "addition", replacesStaleInvitation: false },
  canRemoveManagerRole: false,
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
    isAdding: false,
    addingShopId: null,
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
  onAddMembership: asyncNoop,
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
    data: multipleStoresData,
    showShopMembershipAddition: true,
    state: baseState,
    actions: baseActions,
  },
} satisfies Meta<typeof UserDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MainView: Story = {};

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

export const AddShopDialog: Story = {
  args: { activePanel: "addShop" },
  play: async () => {
    const dialog = await screen.findByRole("dialog", { name: "店舗を追加" });
    const candidate = within(dialog).getByRole("button", { name: "池袋店に追加" });

    await waitFor(() => expect(candidate).toHaveFocus());
    dialog.focus();
    await expect(dialog).toHaveFocus();
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

    await expect(canvas.queryByRole("button", { name: "所属を追加する" })).not.toBeInTheDocument();
    await expect(screen.queryByRole("dialog", { name: "店舗を追加" })).not.toBeInTheDocument();
    await expect(canvas.getByText("所属している店舗はありません。")).toBeInTheDocument();
    await expect(
      canvas.queryByText("「所属を追加する」から、このユーザーを店舗に追加できます。"),
    ).not.toBeInTheDocument();
  },
};

export const PersonRemovalZeroAssignments: Story = createPersonRemovalStory(0);
export const PersonRemovalOneAssignment: Story = createPersonRemovalStory(1);
export const PersonRemovalMultipleAssignments: Story = createPersonRemovalStory(3);

export const ManagerOnlyRoleRemovalConfirmation: Story = {
  args: {
    activePanel: "basic",
    data: { ...baseData, memberships: [] },
    state: {
      ...baseState,
      manager: {
        ...baseState.manager,
        dialog: { kind: "removeManagerRole", personId, shopId: shibuyaShopId, requestId: storyRequestId },
      },
    },
  },
};

export const ManagerRoleRemovalUnavailable: Story = {
  args: {
    activePanel: "basic",
    data: {
      ...baseData,
      canRemoveManagerRole: false,
      managerRoleRemovalDisabledReason: "最後の有効管理者の管理者権限は外せません。",
    },
  },
};

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
      ...baseData,
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
        manager: {
          ...baseState.manager,
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

function PanelNavigationHarness({ data = unlinkedData }: { data?: UserDetailData }) {
  const [activePanel, setActivePanel] = useState<UserDetailPanel>();
  const [addedShopId, setAddedShopId] = useState<Id<"shops"> | null>(null);
  const [addCallCount, setAddCallCount] = useState(0);
  const [managerDialog, setManagerDialog] = useState<UserDetailDialog>(null);

  return (
    <>
      <output hidden data-testid="added-shop-id">
        {addedShopId}
      </output>
      <output hidden data-testid="add-call-count">
        {addCallCount}
      </output>
      <UserDetailView
        data={data}
        showShopMembershipAddition
        activePanel={activePanel}
        state={{
          ...baseState,
          manager: { ...baseState.manager, dialog: managerDialog },
        }}
        actions={{
          ...baseActions,
          onOpenBasic: () => setActivePanel("basic"),
          onOpenAddShop: () => setActivePanel("addShop"),
          onClosePanel: () => setActivePanel(undefined),
          onRequestRemovePerson: () =>
            setManagerDialog({
              kind: "removePerson",
              personId: data.person.id,
              shopId: shibuyaShopId,
              removalPreview: data.removalPreview,
              requestId: storyRequestId,
            }),
          onCloseManagerDialog: () => setManagerDialog(null),
          onAddMembership: async (shopId) => {
            setAddedShopId(shopId);
            setAddCallCount((count) => count + 1);
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

export const AddShopFlowBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <PanelNavigationHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "所属を追加する" }));
    const dialog = await page.findByRole("dialog", { name: "店舗を追加" });
    const additionDialog = within(dialog);

    await expect(additionDialog.getByRole("button", { name: "池袋店に追加" })).toBeInTheDocument();
    await expect(additionDialog.queryByText("渋谷店")).not.toBeInTheDocument();
    await expect(additionDialog.queryByText("新宿店")).not.toBeInTheDocument();
    await expect(additionDialog.queryByText("横浜店")).not.toBeInTheDocument();

    await userEvent.click(additionDialog.getByRole("button", { name: "池袋店に追加" }));
    await expect(canvas.getByTestId("added-shop-id")).toHaveTextContent(ikebukuroShop.shopId);
    await expect(canvas.getByTestId("add-call-count")).toHaveTextContent("1");
  },
};
