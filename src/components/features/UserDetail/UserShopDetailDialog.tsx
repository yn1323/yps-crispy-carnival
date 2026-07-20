import { Box, Stack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { ReadOnlyNotice } from "@/src/components/shared/ReadOnlyNotice";
import { Dialog } from "@/src/components/ui/Dialog";
import type { UserDetailData, UserDetailMembership, UserDetailRecruitment } from "./types";
import { UserLineTab } from "./UserLineTab";
import { UserNotificationTab } from "./UserNotificationTab";
import { UserSettingsTab } from "./UserSettingsTab";

type Props = {
  data: UserDetailData;
  membership: UserDetailMembership | null;
  isOpen: boolean;
  isStoreReadOnly: boolean;
  storeDisabledReason?: string;
  notificationHistory: ReactNode;
  notification: {
    isLoading: boolean;
    openRecruitments: UserDetailRecruitment[];
    currentRecruitments: UserDetailRecruitment[];
    isSendingRecruitments: boolean;
    isSendingCurrentShift: boolean;
  };
  line: {
    authorizeUrl: string | null;
    showQr: boolean;
    isQrLoading: boolean;
    isSendingInvite: boolean;
  };
  membershipState: {
    isChangingShiftTarget: boolean;
    isRemovalConfirmationOpen: boolean;
    isRemoving: boolean;
  };
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  onSendRecruitments: () => void | Promise<void>;
  onSendCurrentShift: () => void | Promise<void>;
  onShowLineQr: () => void | Promise<void>;
  onSendLineInvite: () => void | Promise<void>;
  onChangeShiftTarget: (isShiftTarget: boolean) => void | Promise<void>;
  onRequestRemoveMembership: () => void;
  onCancelRemoveMembership: () => void;
  onConfirmRemoveMembership: () => void | Promise<void>;
};

export function UserShopDetailDialog({
  data,
  membership,
  isOpen,
  isStoreReadOnly,
  storeDisabledReason,
  notificationHistory,
  notification,
  line,
  membershipState,
  onOpenChange,
  onClose,
  onSendRecruitments,
  onSendCurrentShift,
  onShowLineQr,
  onSendLineInvite,
  onChangeShiftTarget,
  onRequestRemoveMembership,
  onCancelRemoveMembership,
  onConfirmRemoveMembership,
}: Props) {
  if (!membership) return null;

  return (
    <Dialog
      title={membership.shopName}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={onClose}
      hideFooter
      maxW={{ base: "100vw", lg: "960px" }}
      maxH={{ base: "100dvh", lg: "86dvh" }}
      contentProps={{
        w: "100%",
        h: { base: "100dvh", lg: "86dvh" },
        my: { base: 0, lg: "auto" },
        borderRadius: { base: 0, lg: "l3" },
      }}
      bodyProps={{ px: { base: 4, lg: 6 }, pt: 2, pb: { base: 6, lg: 6 } }}
    >
      <Stack gap={5}>
        {storeDisabledReason && (
          <ReadOnlyNotice title="この店舗は閲覧のみです" description={storeDisabledReason} borderRadius="lg" />
        )}

        <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
          <Box pb={8}>
            <UserLineTab
              data={data}
              membership={membership}
              isReadOnly={isStoreReadOnly}
              authorizeUrl={line.authorizeUrl}
              showQr={line.showQr}
              isQrLoading={line.isQrLoading}
              isSendingInvite={line.isSendingInvite}
              onShowQr={onShowLineQr}
              onSendInvite={onSendLineInvite}
            />
          </Box>

          <Box py={8}>
            <UserNotificationTab
              data={data}
              membership={membership}
              isReadOnly={isStoreReadOnly}
              isLoading={notification.isLoading}
              openRecruitments={notification.openRecruitments}
              currentRecruitments={notification.currentRecruitments}
              notificationHistory={notificationHistory}
              sendRecruitmentsAction={{
                isDisabled: isStoreReadOnly || notification.isSendingRecruitments || notification.isSendingCurrentShift,
                isLoading: notification.isSendingRecruitments,
                onAction: onSendRecruitments,
              }}
              sendCurrentShiftAction={{
                isDisabled: isStoreReadOnly || notification.isSendingRecruitments || notification.isSendingCurrentShift,
                isLoading: notification.isSendingCurrentShift,
                onAction: onSendCurrentShift,
              }}
            />
          </Box>

          <Box pt={8}>
            <UserSettingsTab
              personName={data.person.name}
              membership={membership}
              isStoreReadOnly={isStoreReadOnly}
              storeDisabledReason={storeDisabledReason}
              isChangingShiftTarget={membershipState.isChangingShiftTarget}
              isRemovalConfirmationOpen={membershipState.isRemovalConfirmationOpen}
              isRemovingMembership={membershipState.isRemoving}
              onChangeShiftTarget={onChangeShiftTarget}
              onRequestRemoveMembership={onRequestRemoveMembership}
              onCancelRemoveMembership={onCancelRemoveMembership}
              onConfirmRemoveMembership={onConfirmRemoveMembership}
            />
          </Box>
        </Stack>
      </Stack>
    </Dialog>
  );
}
