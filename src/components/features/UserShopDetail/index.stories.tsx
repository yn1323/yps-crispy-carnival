import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import {
  type StaffNotificationHistoryItem,
  StaffNotificationHistoryView,
} from "@/src/components/features/StaffNotificationHistory";
import type { UserShopDetailData, UserShopDetailMembership } from "./types";
import { UserShopDetailSkeleton } from "./UserShopDetailSkeleton";
import { UserShopDetailView, type UserShopDetailViewProps } from "./UserShopDetailView";

const personId = "person-tanaka" as Id<"organizationPeople">;
const staffId = "staff-shibuya" as Id<"staffs">;
const shopId = "shop-shibuya" as Id<"shops">;

const removalPreview = {
  kind: "ready" as const,
  asOfDate: "2026-07-30",
  assignmentCount: 2,
  fingerprint: "user-shop-detail-story-preview",
};

const membership: UserShopDetailMembership = {
  staffId,
  shopId,
  shopName: "渋谷店",
  shopStatus: "active",
  excludedFromShift: false,
  canRemove: true,
  removalPreview,
  line: { isLinked: false, isFollowing: false },
};

const data: UserShopDetailData = {
  person: {
    id: personId,
    name: "田中 花子",
    email: "hanako.tanaka@example.com",
  },
  isSelf: false,
  managerRole: "none",
  hasManagerInvitation: false,
  managerInvitationState: { kind: "available", mode: "addition", replacesStaleInvitation: false },
  canRemoveManagerRole: false,
  managerRoleRemovalDisabledReason: undefined,
  canRemove: true,
  removeDisabledReason: undefined,
  removalPreview,
  canWrite: true,
  shops: [{ shopId, shopName: membership.shopName, shopStatus: membership.shopStatus }],
  memberships: [membership],
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

const notificationHistory = (
  <StaffNotificationHistoryView items={notificationItems} canLoadMore onLoadMore={() => undefined} />
);

const baseState: UserShopDetailViewProps["state"] = {
  line: {
    authorizeUrl: null,
    showQr: false,
    isQrLoading: false,
    isSendingInvite: false,
  },
  notifications: {
    isLoading: false,
    openRecruitments: [
      {
        _id: "recruitment-open",
        periodStart: "2026-07-21",
        periodEnd: "2026-07-31",
        deadline: "2026-07-28",
        status: "open",
        confirmedAt: null,
        responseCount: 3,
        totalStaffCount: 8,
      },
    ],
    currentRecruitments: [
      {
        _id: "recruitment-current",
        periodStart: "2026-07-11",
        periodEnd: "2026-07-20",
        deadline: "2026-07-08",
        status: "confirmed",
        confirmedAt: new Date("2026-07-09T01:00:00Z").getTime(),
        responseCount: 8,
        totalStaffCount: 8,
      },
    ],
    isSendingRecruitments: false,
    isSendingCurrentShift: false,
  },
  membership: {
    isChangingShiftTarget: false,
    isRemovalConfirmationOpen: false,
    isRemoving: false,
  },
};

const noop = () => undefined;
const asyncNoop = async () => undefined;

const baseActions: UserShopDetailViewProps["actions"] = {
  onBack: noop,
  onShowLineQr: asyncNoop,
  onSendLineInvite: asyncNoop,
  onSendRecruitments: asyncNoop,
  onSendCurrentShift: asyncNoop,
  onChangeShiftTarget: asyncNoop,
  onRequestRemoveMembership: noop,
  onCancelRemoveMembership: noop,
  onConfirmRemoveMembership: asyncNoop,
};

const meta = {
  title: "Features/UserShopDetail",
  component: UserShopDetailView,
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
    data,
    membership,
    isStoreReadOnly: false,
    showMembershipRemoval: true,
    notificationHistory,
    state: baseState,
    actions: baseActions,
  },
} satisfies Meta<typeof UserShopDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: {
    state: {
      ...baseState,
      line: {
        ...baseState.line,
        authorizeUrl: "https://example.com/line/authorize",
        showQr: true,
      },
    },
  },
};

const readOnlyMembership: UserShopDetailMembership = {
  ...membership,
  shopStatus: "planSuspended",
};

export const ReadOnly: Story = {
  args: {
    data: {
      ...data,
      canWrite: false,
      writeDisabledReason: "Proの利用上限を超えているため、契約制限中です。",
      shops: [{ shopId, shopName: readOnlyMembership.shopName, shopStatus: readOnlyMembership.shopStatus }],
      memberships: [readOnlyMembership],
    },
    membership: readOnlyMembership,
    isStoreReadOnly: true,
    storeDisabledReason: "この店舗は契約制限中のため、設定を変更できません。",
  },
};

export const Loading: Story = {
  render: () => <UserShopDetailSkeleton />,
};

function InteractionHarness() {
  const [showQr, setShowQr] = useState(false);
  const [isSendingRecruitments, setIsSendingRecruitments] = useState(false);
  const [recruitmentSendCount, setRecruitmentSendCount] = useState(0);
  const [isRemovalConfirmationOpen, setIsRemovalConfirmationOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removalCount, setRemovalCount] = useState(0);

  return (
    <>
      <output hidden data-testid="recruitment-send-count">
        {recruitmentSendCount}
      </output>
      <output hidden data-testid="membership-removal-count">
        {removalCount}
      </output>
      <UserShopDetailView
        data={data}
        membership={membership}
        isStoreReadOnly={false}
        showMembershipRemoval
        notificationHistory={notificationHistory}
        state={{
          ...baseState,
          line: {
            ...baseState.line,
            authorizeUrl: showQr ? "https://example.com/line/authorize" : null,
            showQr,
          },
          notifications: {
            ...baseState.notifications,
            isSendingRecruitments,
          },
          membership: {
            ...baseState.membership,
            isRemovalConfirmationOpen,
            isRemoving,
          },
        }}
        actions={{
          ...baseActions,
          onShowLineQr: async () => setShowQr(true),
          onSendRecruitments: async () => {
            setRecruitmentSendCount((count) => count + 1);
            setIsSendingRecruitments(true);
          },
          onRequestRemoveMembership: () => setIsRemovalConfirmationOpen(true),
          onCancelRemoveMembership: () => setIsRemovalConfirmationOpen(false),
          onConfirmRemoveMembership: async () => {
            setRemovalCount((count) => count + 1);
            setIsRemoving(true);
          },
        }}
      />
    </>
  );
}

export const LineQrDisplayBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractionHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const showQrButton = canvas.getByRole("button", { name: "LINE連携リンクを表示" });

    await expect(canvas.queryByText("田中 花子専用のURL（QRコード）です。")).not.toBeInTheDocument();
    await expect(showQrButton).toBeEnabled();
    await userEvent.click(showQrButton);
    await expect(await canvas.findByText("田中 花子専用のURL（QRコード）です。")).toBeInTheDocument();
    await expect(await canvas.findByRole("img", { name: "LINE連携用QRコード" })).toBeInTheDocument();
    await expect(showQrButton).toBeDisabled();
  },
};

export const RecruitmentNotificationSendingBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractionHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sendButton = canvas.getByRole("button", { name: "募集中のシフトを送る" });

    await expect(sendButton).toBeEnabled();
    await userEvent.click(sendButton);
    await expect(canvas.getByTestId("recruitment-send-count")).toHaveTextContent("1");
    await expect(sendButton).toBeDisabled();
  },
};

export const MembershipRemovalConfirmationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractionHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "店舗から外す" }));
    const confirmation = await page.findByRole("alertdialog", { name: "店舗から外す" });
    const confirmationContent = within(confirmation);

    await expect(confirmationContent.getByText("田中 花子さんを渋谷店から外しますか？")).toBeInTheDocument();
    const confirmButton = confirmationContent.getByRole("button", { name: "店舗から外す" });
    await userEvent.click(confirmButton);
    await expect(canvas.getByTestId("membership-removal-count")).toHaveTextContent("1");
    await expect(confirmButton).toBeDisabled();
  },
};
