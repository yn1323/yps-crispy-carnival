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
};

const data: UserShopDetailData = {
  person: {
    id: personId,
    name: "田中 花子",
    email: "hanako.tanaka@example.com",
    hasLinkedAccount: false,
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
  line: {
    status: "unlinked",
    actionShopId: shopId,
    sourceStaffId: staffId,
    sourceShopId: shopId,
    canLink: true,
    canDisconnect: false,
  },
  membershipFingerprint: "membership-fingerprint",
  shops: [{ shopId, shopName: membership.shopName, shopStatus: membership.shopStatus, canChangeMembership: true }],
  memberships: [membership],
};

const notificationItems: StaffNotificationHistoryItem[] = [
  {
    _id: "history-1",
    requestedAt: new Date("2026-07-19T01:00:00Z").getTime(),
    sentAt: new Date("2026-07-19T01:00:10Z").getTime(),
    channel: "line",
    displayTitle: "シフト募集のお知らせ 7/21(火)〜7/31(金)",
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

const notificationHistory = (lineConnectionStatus: "linked" | "unlinked") => (
  <StaffNotificationHistoryView items={notificationItems} lineConnectionStatus={lineConnectionStatus} />
);

const notificationHistoryLoading = (lineConnectionStatus: "linked" | "unlinked") => (
  <StaffNotificationHistoryView items={[]} isLoading lineConnectionStatus={lineConnectionStatus} />
);

const baseState: UserShopDetailViewProps["state"] = {
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
    isCooldownLoading: false,
    isRecruitmentCooldownActive: false,
    isCurrentShiftCooldownActive: false,
  },
  membership: {
    isChangingShiftTarget: false,
  },
};

const noop = () => undefined;
const asyncNoop = async () => undefined;

const baseActions: UserShopDetailViewProps["actions"] = {
  onBack: noop,
  onSendRecruitments: asyncNoop,
  onSendCurrentShift: asyncNoop,
  onChangeShiftTarget: asyncNoop,
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
    notificationHistory: notificationHistory("unlinked"),
    state: baseState,
    actions: baseActions,
  },
} satisfies Meta<typeof UserShopDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const MainViewMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

const initialDataLoadedState: UserShopDetailViewProps["state"] = {
  ...baseState,
  notifications: {
    ...baseState.notifications,
    isLoading: true,
    openRecruitments: [],
    currentRecruitments: [],
  },
};

export const InitialDataLoaded: Story = {
  args: {
    notificationHistory: notificationHistoryLoading("unlinked"),
    state: initialDataLoadedState,
  },
};

export const InitialDataLoadedMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: {
    notificationHistory: notificationHistoryLoading("unlinked"),
    state: initialDataLoadedState,
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: {
    data: {
      ...data,
      line: { ...data.line, status: "linked_unfollowed", canDisconnect: true },
    },
    notificationHistory: notificationHistory("linked"),
  },
};

export const NotificationCooldown: Story = {
  args: {
    state: {
      ...baseState,
      notifications: {
        ...baseState.notifications,
        isRecruitmentCooldownActive: true,
        isCurrentShiftCooldownActive: true,
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const resendButtons = canvas.getAllByRole("button", { name: "再送する" });

    await expect(resendButtons).toHaveLength(2);
    for (const button of resendButtons) await expect(button).toBeDisabled();
  },
};

export const NotificationCooldownMobile: Story = {
  ...NotificationCooldown,
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
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
      shops: [
        {
          shopId,
          shopName: readOnlyMembership.shopName,
          shopStatus: readOnlyMembership.shopStatus,
          canChangeMembership: false,
          membershipChangeDisabledReason: "稼働中の店舗だけ所属を変更できます。",
        },
      ],
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

export const LoadingMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: () => <UserShopDetailSkeleton />,
};

function NotificationLoadingHarness() {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsLoaded(true)}>
        通知情報の取得を完了
      </button>
      <UserShopDetailView
        data={data}
        membership={membership}
        isStoreReadOnly={false}
        notificationHistory={isLoaded ? notificationHistory("unlinked") : notificationHistoryLoading("unlinked")}
        state={{
          ...baseState,
          notifications: {
            ...baseState.notifications,
            isLoading: !isLoaded,
            openRecruitments: isLoaded ? baseState.notifications.openRecruitments : [],
            currentRecruitments: isLoaded ? baseState.notifications.currentRecruitments : [],
          },
        }}
        actions={baseActions}
      />
    </>
  );
}

export const NotificationLoadingBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <NotificationLoadingHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("heading", { name: "通知" })).toBeInTheDocument();
    await expect(canvas.getByLabelText("通知情報を読み込み中")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "通知情報の取得を完了" }));

    const resendButtons = await canvas.findAllByRole("button", { name: "再送する" });
    await expect(resendButtons).toHaveLength(2);
    await expect(resendButtons[0]).toBeEnabled();
    await expect(canvas.queryByLabelText("通知情報を読み込み中")).not.toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "通知" })).toBeInTheDocument();
  },
};

function InteractionHarness() {
  const [isSendingRecruitments, setIsSendingRecruitments] = useState(false);
  const [recruitmentSendCount, setRecruitmentSendCount] = useState(0);

  return (
    <>
      <output hidden data-testid="recruitment-send-count">
        {recruitmentSendCount}
      </output>
      <UserShopDetailView
        data={data}
        membership={membership}
        isStoreReadOnly={false}
        notificationHistory={notificationHistory("unlinked")}
        state={{
          ...baseState,
          notifications: {
            ...baseState.notifications,
            isSendingRecruitments,
          },
          membership: baseState.membership,
        }}
        actions={{
          ...baseActions,
          onSendRecruitments: async () => {
            setRecruitmentSendCount((count) => count + 1);
            setIsSendingRecruitments(true);
          },
        }}
      />
    </>
  );
}

export const LineLinked: Story = {
  args: {
    data: {
      ...data,
      line: { ...data.line, status: "linked_following", canDisconnect: true },
    },
    notificationHistory: notificationHistory("linked"),
  },
};

export const LineUnavailable: Story = {
  args: {
    data: {
      ...data,
      line: { ...data.line, status: "linked_unfollowed", canDisconnect: true },
    },
    notificationHistory: notificationHistory("linked"),
  },
};

export const RecruitmentNotificationSendingBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <InteractionHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sendButton = canvas.getAllByRole("button", { name: "再送する" })[0];

    await expect(sendButton).toBeEnabled();
    await userEvent.click(sendButton);
    await expect(canvas.getByTestId("recruitment-send-count")).toHaveTextContent("1");
    await expect(sendButton).toBeDisabled();
  },
};
