import { Box, Stack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { ReadOnlyNotice } from "@/src/components/shared/ReadOnlyNotice";
import { DetailPageHeader } from "@/src/components/ui/DetailPageHeader";
import type { UserShopDetailData, UserShopDetailMembership, UserShopDetailRecruitment } from "./types";
import { UserShopLineSection } from "./UserShopLineSection";
import { UserShopNotificationSection } from "./UserShopNotificationSection";
import { UserShopSettingsSection } from "./UserShopSettingsSection";

type AsyncAction = () => void | Promise<void>;

export type UserShopDetailViewProps = {
  data: UserShopDetailData;
  membership: UserShopDetailMembership;
  isStoreReadOnly: boolean;
  storeDisabledReason?: string;
  showMembershipRemoval: boolean;
  notificationHistory: ReactNode;
  state: {
    line: {
      authorizeUrl: string | null;
      showQr: boolean;
      isQrLoading: boolean;
      isSendingInvite: boolean;
    };
    notifications: {
      isLoading: boolean;
      openRecruitments: UserShopDetailRecruitment[];
      currentRecruitments: UserShopDetailRecruitment[];
      isSendingRecruitments: boolean;
      isSendingCurrentShift: boolean;
    };
    membership: {
      isChangingShiftTarget: boolean;
      isRemovalConfirmationOpen: boolean;
      isRemoving: boolean;
    };
  };
  actions: {
    onBack: () => void;
    onShowLineQr: AsyncAction;
    onSendLineInvite: AsyncAction;
    onSendRecruitments: AsyncAction;
    onSendCurrentShift: AsyncAction;
    onChangeShiftTarget: (isShiftTarget: boolean) => void | Promise<void>;
    onRequestRemoveMembership: () => void;
    onCancelRemoveMembership: () => void;
    onConfirmRemoveMembership: AsyncAction;
  };
};

export function UserShopDetailView({
  data,
  membership,
  isStoreReadOnly,
  storeDisabledReason,
  showMembershipRemoval,
  notificationHistory,
  state,
  actions,
}: UserShopDetailViewProps) {
  return (
    <Stack gap={{ base: 4, md: 6 }}>
      <DetailPageHeader
        title={`${membership.shopName}：${data.person.name}さん`}
        backLabel="スタッフ詳細へ戻る"
        onBack={actions.onBack}
      />

      {isStoreReadOnly && (
        <ReadOnlyNotice
          title="この店舗は閲覧のみです"
          description={storeDisabledReason ?? "現在、この店舗の設定を変更できません。"}
        />
      )}

      <PageSection>
        <UserShopLineSection
          data={data}
          membership={membership}
          isReadOnly={isStoreReadOnly}
          {...state.line}
          onShowQr={actions.onShowLineQr}
          onSendInvite={actions.onSendLineInvite}
        />
      </PageSection>

      <PageSection>
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
      </PageSection>

      <PageSection>
        <UserShopSettingsSection
          personName={data.person.name}
          membership={membership}
          removalPreview={membership.removalPreview}
          isStoreReadOnly={isStoreReadOnly}
          storeDisabledReason={storeDisabledReason}
          isChangingShiftTarget={state.membership.isChangingShiftTarget}
          showMembershipRemoval={showMembershipRemoval}
          isRemovalConfirmationOpen={state.membership.isRemovalConfirmationOpen}
          isRemovingMembership={state.membership.isRemoving}
          onChangeShiftTarget={actions.onChangeShiftTarget}
          onRequestRemoveMembership={actions.onRequestRemoveMembership}
          onCancelRemoveMembership={actions.onCancelRemoveMembership}
          onConfirmRemoveMembership={actions.onConfirmRemoveMembership}
        />
      </PageSection>
    </Stack>
  );
}

function PageSection({ children }: { children: ReactNode }) {
  return (
    <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" p={{ base: 4, md: 6 }}>
      {children}
    </Box>
  );
}
