import { useNavigate } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffNotificationHistoryView } from "@/src/components/features/StaffNotificationHistory";
import { type UserDetailData, UserDetailView } from "@/src/components/features/UserDetail";
import {
  type UserShopDetailData,
  type UserShopDetailMembership,
  UserShopDetailView,
} from "@/src/components/features/UserShopDetail";
import { APP_PROTOTYPE_FIXTURE, APP_PROTOTYPE_IDS } from "./fixtures";
import { PrototypePage } from "./PrototypeUI";

const PRIMARY_PERSON = APP_PROTOTYPE_FIXTURE.people[0];
const PERSON_ID = APP_PROTOTYPE_IDS.person as Id<"organizationPeople">;
const PRIMARY_SHOP_ID = APP_PROTOTYPE_IDS.shop as Id<"shops">;
const PRIMARY_STAFF_ID = "sample-staff" as Id<"staffs">;

const REMOVAL_PREVIEW = {
  kind: "ready" as const,
  asOfDate: "2026-08-14",
  assignmentCount: 0,
  fingerprint: "app-navigation-prototype-person",
};

const PRIMARY_MEMBERSHIP: UserDetailData["memberships"][number] = {
  staffId: PRIMARY_STAFF_ID,
  shopId: PRIMARY_SHOP_ID,
  shopName: APP_PROTOTYPE_FIXTURE.shops[0].name,
  shopStatus: "active",
  excludedFromShift: false,
  canRemove: false,
  removeDisabledReason: "管理者は店舗から外せません。先に管理者権限を変更してください。",
  removalPreview: REMOVAL_PREVIEW,
};

const SECONDARY_MEMBERSHIPS: UserDetailData["memberships"] = APP_PROTOTYPE_FIXTURE.shops
  .slice(1)
  .map((shop, index) => ({
    staffId: `sample-staff-${index + 2}` as Id<"staffs">,
    shopId: `sample-shop-${index + 2}` as Id<"shops">,
    shopName: shop.name,
    shopStatus: "active" as const,
    excludedFromShift: false,
    canRemove: false,
    removeDisabledReason: "画面イメージでは所属を変更できません。",
    removalPreview: REMOVAL_PREVIEW,
  }));

const STAFF_DETAIL_DATA: UserDetailData = {
  person: {
    id: PERSON_ID,
    name: PRIMARY_PERSON.name,
    email: PRIMARY_PERSON.email,
    hasLinkedAccount: true,
  },
  isSelf: true,
  managerRole: "active",
  hasManagerInvitation: false,
  managerInvitationState: { kind: "unavailable", reason: "このユーザーはすでに管理者です。" },
  canRemoveManagerRole: true,
  managerRoleRemovalDisabledReason: undefined,
  canRemove: false,
  removeDisabledReason: "管理者は削除できません。先に管理者権限を外してください。",
  removalPreview: REMOVAL_PREVIEW,
  canWrite: true,
  line: {
    status: "unlinked",
    actionShopId: PRIMARY_SHOP_ID,
    sourceStaffId: PRIMARY_STAFF_ID,
    sourceShopId: PRIMARY_SHOP_ID,
    canLink: false,
    linkDisabledReason: "画面イメージではLINE連携を変更できません。",
    canDisconnect: false,
  },
  membershipFingerprint: "app-navigation-prototype-memberships",
  shops: APP_PROTOTYPE_FIXTURE.shops.map((shop, index) => ({
    shopId: (index === 0 ? APP_PROTOTYPE_IDS.shop : `sample-shop-${index + 1}`) as Id<"shops">,
    shopName: shop.name,
    shopStatus: "active" as const,
    canChangeMembership: false,
    membershipChangeDisabledReason: "画面イメージでは所属を変更できません。",
  })),
  memberships: [PRIMARY_MEMBERSHIP, ...SECONDARY_MEMBERSHIPS],
};

const STAFF_DETAIL_STATE: ComponentProps<typeof UserDetailView>["state"] = {
  isUpdatingProfile: false,
  line: {
    authorizeUrl: null,
    showQr: false,
    isQrLoading: false,
    isSendingInvite: false,
    isDisconnecting: false,
  },
  membership: { isChanging: true },
  removal: { dialog: null, isRemoving: false },
};

const SHOP_DETAIL_DATA: UserShopDetailData = STAFF_DETAIL_DATA;
const SHOP_DETAIL_STATE: ComponentProps<typeof UserShopDetailView>["state"] = {
  notifications: {
    isLoading: false,
    openRecruitments: [
      {
        _id: "sample-recruitment-adjusting",
        periodStart: "2026-08-17",
        periodEnd: "2026-08-24",
        deadline: "2026-08-12",
        status: "open",
        confirmedAt: null,
        responseCount: 2,
        totalStaffCount: 3,
      },
      {
        _id: "sample-recruitment-open",
        periodStart: "2026-08-26",
        periodEnd: "2026-08-28",
        deadline: "2026-08-20",
        status: "open",
        confirmedAt: null,
        responseCount: 0,
        totalStaffCount: 3,
      },
    ],
    currentRecruitments: [],
    isSendingRecruitments: false,
    isSendingCurrentShift: false,
  },
  membership: { isChangingShiftTarget: false },
};

const asyncNoop = async () => undefined;

export function PrototypeStaffDetailView() {
  const navigate = useNavigate();

  return (
    <PrototypePage>
      <UserDetailView
        data={STAFF_DETAIL_DATA}
        showShopMembershipAddition
        nonNavigationActionsDisabled
        state={STAFF_DETAIL_STATE}
        actions={{
          onBack: () => void navigate({ to: "/app/staff" }),
          onOpenBasic: () => undefined,
          onOpenLine: () => undefined,
          onOpenAddShop: () => undefined,
          onOpenShop: (shopId) =>
            void navigate({
              to: "/app/staff/$personId/shops/$shopId",
              params: { personId: APP_PROTOTYPE_IDS.person, shopId },
            }),
          onClosePanel: () => undefined,
          onUpdateProfile: asyncNoop,
          onShowLineQr: asyncNoop,
          onSendLineInvite: asyncNoop,
          onDisconnectLine: async () => false,
          onChangeMemberships: asyncNoop,
          onManageManagers: () => void navigate({ to: "/app/manage/managers" }),
          onRequestRemovePerson: () => undefined,
          onConfirmRemovePerson: asyncNoop,
          onCloseRemovalDialog: () => undefined,
        }}
      />
    </PrototypePage>
  );
}

type PrototypeStaffShopDetailViewProps = {
  shopId: string;
};

export function PrototypeStaffShopDetailView({ shopId }: PrototypeStaffShopDetailViewProps) {
  const navigate = useNavigate();
  const membership = STAFF_DETAIL_DATA.memberships.find((item) => item.shopId === shopId) ?? PRIMARY_MEMBERSHIP;

  return (
    <PrototypePage>
      <UserShopDetailView
        data={SHOP_DETAIL_DATA}
        membership={membership as UserShopDetailMembership}
        isStoreReadOnly
        storeDisabledReason="画面イメージでは店舗別設定を変更できません。"
        notificationHistory={
          <StaffNotificationHistoryView
            items={[
              {
                _id: "sample-notification-history",
                requestedAt: Date.UTC(2026, 7, 11, 8),
                sentAt: Date.UTC(2026, 7, 11, 8),
                channel: "line",
                displayTitle: "シフト提出のお願い",
                displayStatus: "sent",
              },
            ]}
            lineConnectionStatus="unlinked"
          />
        }
        state={SHOP_DETAIL_STATE}
        actions={{
          onBack: () =>
            void navigate({
              to: "/app/staff/$personId",
              params: { personId: APP_PROTOTYPE_IDS.person },
            }),
          onSendRecruitments: asyncNoop,
          onSendCurrentShift: asyncNoop,
          onChangeShiftTarget: asyncNoop,
        }}
      />
    </PrototypePage>
  );
}
