import { Stack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuStore } from "react-icons/lu";
import { ReadOnlyNotice } from "@/src/components/shared/ReadOnlyNotice";
import { DetailPageHeader } from "@/src/components/ui/DetailPageHeader";
import type { UserShopDetailData, UserShopDetailMembership, UserShopDetailRecruitment } from "./types";
import { UserShopDetailPageSection } from "./UserShopDetailPageSection";
import { UserShopNotificationSection } from "./UserShopNotificationSection";
import { UserShopSettingsSection } from "./UserShopSettingsSection";

type AsyncAction = () => void | Promise<void>;

export type UserShopDetailViewProps = {
  data: UserShopDetailData;
  membership: UserShopDetailMembership;
  isStoreReadOnly: boolean;
  storeDisabledReason?: string;
  notificationHistory: ReactNode;
  state: {
    notifications: {
      isLoading: boolean;
      openRecruitments: UserShopDetailRecruitment[];
      currentRecruitments: UserShopDetailRecruitment[];
      isSendingRecruitments: boolean;
      isSendingCurrentShift: boolean;
    };
    membership: {
      isChangingShiftTarget: boolean;
    };
  };
  actions: {
    onBack: () => void;
    onSendRecruitments: AsyncAction;
    onSendCurrentShift: AsyncAction;
    onChangeShiftTarget: (isShiftTarget: boolean) => void | Promise<void>;
  };
};

export function UserShopDetailView({
  data,
  membership,
  isStoreReadOnly,
  storeDisabledReason,
  notificationHistory,
  state,
  actions,
}: UserShopDetailViewProps) {
  return (
    <Stack gap={{ base: 4, md: 6 }}>
      <DetailPageHeader
        title={`${membership.shopName}：${data.person.name}さん`}
        icon={LuStore}
        backLabel="スタッフ詳細へ戻る"
        onBack={actions.onBack}
      />

      {isStoreReadOnly && (
        <ReadOnlyNotice
          title="この店舗は閲覧のみです"
          description={storeDisabledReason ?? "現在、この店舗の設定を変更できません。"}
        />
      )}

      <UserShopDetailPageSection>
        <UserShopNotificationSection
          data={data}
          membership={membership}
          isReadOnly={isStoreReadOnly}
          isLoading={state.notifications.isLoading}
          openRecruitments={state.notifications.openRecruitments}
          currentRecruitments={state.notifications.currentRecruitments}
          notificationHistory={notificationHistory}
          sendRecruitmentsAction={{
            isDisabled: isStoreReadOnly,
            isLoading: state.notifications.isSendingRecruitments,
            onAction: actions.onSendRecruitments,
          }}
          sendCurrentShiftAction={{
            isDisabled: isStoreReadOnly,
            isLoading: state.notifications.isSendingCurrentShift,
            onAction: actions.onSendCurrentShift,
          }}
        />
      </UserShopDetailPageSection>

      <UserShopDetailPageSection>
        <UserShopSettingsSection
          membership={membership}
          isStoreReadOnly={isStoreReadOnly}
          storeDisabledReason={storeDisabledReason}
          isChangingShiftTarget={state.membership.isChangingShiftTarget}
          onChangeShiftTarget={actions.onChangeShiftTarget}
        />
      </UserShopDetailPageSection>
    </Stack>
  );
}
