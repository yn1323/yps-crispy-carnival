import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import {
  type StaffNotificationHistoryItem,
  StaffNotificationHistoryView,
} from "@/src/components/features/StaffNotificationHistory";
import type { UserDetailData, UserDetailDialog, UserDetailPanel } from "./types";
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

const unlinkedLineData: UserDetailData = {
  ...multipleStoresData,
  memberships: [{ ...shibuyaMembership, line: { isLinked: false, isFollowing: false } }, shinjukuMembership],
};

const notificationItems: StaffNotificationHistoryItem[] = [
  {
    _id: "history-1",
    requestedAt: new Date("2026-07-19T01:00:00Z").getTime(),
    sentAt: new Date("2026-07-19T01:00:10Z").getTime(),
    channel: "line",
    displayTitle: "7月後半のシフト募集のお知らせ",
    displayStatus: "sent",
  },
  {
    _id: "history-2",
    requestedAt: new Date("2026-07-18T01:00:00Z").getTime(),
    sentAt: new Date("2026-07-18T01:00:08Z").getTime(),
    channel: "email",
    displayTitle: "確定シフトのお知らせ",
    displayStatus: "delivered",
  },
];

const notificationHistory = <StaffNotificationHistoryView items={notificationItems} />;

const baseState: UserDetailViewProps["state"] = {
  isUpdatingProfile: false,
  notification: {
    isLoading: false,
    openRecruitments: [
      {
        _id: "recruitment-open",
        periodStart: "2026-07-21",
        periodEnd: "2026-07-31",
        status: "open",
      },
    ],
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

const baseActions: UserDetailViewProps["actions"] = {
  onBack: noop,
  onOpenBasic: noop,
  onOpenAddShop: noop,
  onOpenShop: noop,
  onClosePanel: noop,
  onUpdateProfile: asyncNoop,
  onSendRecruitments: asyncNoop,
  onSendCurrentShift: asyncNoop,
  onShowLineQr: asyncNoop,
  onSendLineInvite: asyncNoop,
  onChangeShiftTarget: asyncNoop,
  onAddMembership: asyncNoop,
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
    data: multipleStoresData,
    selectedShopId: shibuyaShopId,
    notificationHistory,
    state: baseState,
    actions: baseActions,
  },
} satisfies Meta<typeof UserDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MainView: Story = {};

export const BasicInformationDialog: Story = {
  args: { activePanel: "basic" },
};

export const BasicInformationDialogMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: { activePanel: "basic" },
};

export const AddShopDialog: Story = {
  args: { activePanel: "addShop" },
};

export const AssignedShopDialog: Story = {
  args: {
    activePanel: "shop",
    data: unlinkedLineData,
  },
};

export const AssignedShopDialogMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: {
    activePanel: "shop",
    data: unlinkedLineData,
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

export const Loading: Story = {
  render: () => <UserDetailSkeleton />,
};

function PanelNavigationHarness({ data = multipleStoresData }: { data?: UserDetailData }) {
  const [activePanel, setActivePanel] = useState<UserDetailPanel>();
  const [selectedShopId, setSelectedShopId] = useState<string | null>(shibuyaShopId);
  const [addedShopId, setAddedShopId] = useState<Id<"shops"> | null>(null);
  const [addCallCount, setAddCallCount] = useState(0);
  const [membershipDialog, setMembershipDialog] = useState<UserDetailDialog>(null);
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
        selectedShopId={selectedShopId}
        activePanel={activePanel}
        notificationHistory={notificationHistory}
        state={{
          ...baseState,
          membership: { ...baseState.membership, dialog: membershipDialog },
          manager: { ...baseState.manager, dialog: managerDialog },
        }}
        actions={{
          ...baseActions,
          onOpenBasic: () => setActivePanel("basic"),
          onOpenAddShop: () => setActivePanel("addShop"),
          onOpenShop: (shopId) => {
            setSelectedShopId(shopId);
            setActivePanel("shop");
          },
          onClosePanel: () => setActivePanel(undefined),
          onRequestRemoveMembership: () =>
            setMembershipDialog({ kind: "removeMembership", membership: shibuyaMembership }),
          onCloseMembershipDialog: () => setMembershipDialog(null),
          onRequestRemovePerson: () => setManagerDialog({ kind: "removePerson" }),
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
    await userEvent.click(canvas.getByRole("button", { name: "基本情報を開く" }));

    const dialog = await page.findByRole("dialog", { name: "基本情報" });
    const basicDialog = within(dialog);
    await expect(basicDialog.getByRole("textbox", { name: "名前" })).toHaveValue("田中 花子");
    await expect(basicDialog.getByRole("textbox", { name: "メールアドレス" })).toHaveValue("hanako.tanaka@example.com");
    await expect(basicDialog.getByRole("heading", { name: "管理者権限" })).toBeInTheDocument();
  },
};

export const PersonRemovalConfirmationAccessibilityBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <PanelNavigationHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const requestButton = canvas.getByRole("button", { name: "削除" });
    await userEvent.click(requestButton);

    const confirmation = await canvas.findByRole("alertdialog", {
      name: "田中 花子さんをグループから削除しますか？",
    });
    await expect(confirmation).toHaveFocus();
    await userEvent.click(within(confirmation).getByRole("button", { name: "やめる" }));
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

    await userEvent.click(canvas.getByRole("button", { name: "店舗を追加" }));
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

export const AssignedShopFlowBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <PanelNavigationHarness data={unlinkedLineData} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "渋谷店の詳細を開く" }));
    const dialog = await page.findByRole("dialog", { name: "渋谷店" });
    const shopDialog = within(dialog);

    await expect(shopDialog.queryByRole("tablist")).not.toBeInTheDocument();
  },
};

export const MembershipRemovalConfirmationAccessibilityBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <PanelNavigationHarness data={unlinkedLineData} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "渋谷店の詳細を開く" }));
    const dialog = await page.findByRole("dialog", { name: "渋谷店" });
    const shopDialog = within(dialog);
    const requestButton = shopDialog.getByRole("button", { name: "店舗から外す" });
    await userEvent.click(requestButton);

    const confirmation = await shopDialog.findByRole("alertdialog", {
      name: "田中 花子さんを渋谷店から外しますか？",
    });
    await expect(confirmation).toHaveFocus();
    await userEvent.click(within(confirmation).getByRole("button", { name: "やめる" }));
    await expect(requestButton).toHaveFocus();
  },
};
