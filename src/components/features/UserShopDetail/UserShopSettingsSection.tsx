import { Box, Flex, Heading, Stack, Switch, Text } from "@chakra-ui/react";
import { DeletionActionSection } from "@/src/components/shared/DeletionActionSection";
import { Dialog } from "@/src/components/ui/Dialog";
import type { UserShopDetailMembership, UserShopDetailRemovalPreview } from "./types";

type Props = {
  personName: string;
  membership: UserShopDetailMembership;
  removalPreview: UserShopDetailRemovalPreview;
  isStoreReadOnly: boolean;
  storeDisabledReason?: string;
  isChangingShiftTarget: boolean;
  showMembershipRemoval: boolean;
  isRemovalConfirmationOpen: boolean;
  isRemovingMembership: boolean;
  onChangeShiftTarget: (isShiftTarget: boolean) => void | Promise<void>;
  onRequestRemoveMembership: () => void;
  onCancelRemoveMembership: () => void;
  onConfirmRemoveMembership: () => void | Promise<void>;
};

export function UserShopSettingsSection({
  personName,
  membership,
  removalPreview,
  isStoreReadOnly,
  storeDisabledReason,
  isChangingShiftTarget,
  showMembershipRemoval,
  isRemovalConfirmationOpen,
  isRemovingMembership,
  onChangeShiftTarget,
  onRequestRemoveMembership,
  onCancelRemoveMembership,
  onConfirmRemoveMembership,
}: Props) {
  const shiftTargetDisabledReasonId = `user-shop-detail-shift-target-disabled-${membership.staffId}`;
  const membershipRemovalDisabledReasonId = `user-shop-detail-removal-disabled-${membership.staffId}`;
  const membershipRemovalDisabled = isStoreReadOnly || !membership.canRemove;
  const membershipRemovalDisabledReason = membershipRemovalDisabled
    ? isStoreReadOnly
      ? storeDisabledReason
      : "この店舗から外せません。"
    : undefined;

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Flex align="center" justify="space-between" gap={4}>
          <Heading as="h2" fontSize="md" fontWeight="semibold" color="gray.900">
            このユーザーをシフト対象とする
          </Heading>
          <Switch.Root
            checked={!membership.excludedFromShift}
            disabled={isStoreReadOnly || isChangingShiftTarget}
            colorPalette="teal"
            onCheckedChange={(details) => onChangeShiftTarget(details.checked)}
          >
            <Switch.HiddenInput
              aria-label="このユーザーをシフト対象とする"
              aria-describedby={isStoreReadOnly && storeDisabledReason ? shiftTargetDisabledReasonId : undefined}
            />
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Root>
        </Flex>
        <Stack gap={1} fontSize="sm" color="fg.muted" lineHeight="tall">
          <Text>シフトに含めない管理者専用ユーザーは、「このユーザーをシフト対象とする」をオフにしてください。</Text>
          <Text>オフにすると次の状態になります。</Text>
          <Box as="ul" ps={5}>
            <Box as="li">シフト募集、確定を通知しない</Box>
            <Box as="li">シフト調整画面でこのユーザーを表示しない</Box>
          </Box>
        </Stack>
        {isStoreReadOnly && storeDisabledReason && (
          <Text id={shiftTargetDisabledReasonId} fontSize="xs" color="orange.700">
            {storeDisabledReason}
          </Text>
        )}
      </Stack>

      {showMembershipRemoval && (
        <DeletionActionSection
          title="このスタッフを店舗から外す"
          description={
            "このスタッフを店舗から外します。\n組織への登録は残るため、別店舗に移動する際などに利用してください。"
          }
          descriptionFontSize="xs"
          actionLabel="削除する"
          actionVariant="solid"
          canDelete={!membershipRemovalDisabled}
          disabledReason={membershipRemovalDisabledReason}
          disabledReasonId={membershipRemovalDisabledReasonId}
          onDelete={onRequestRemoveMembership}
        />
      )}

      {isRemovalConfirmationOpen && showMembershipRemoval && (
        <Dialog
          title="店舗から外す"
          isOpen
          role="alertdialog"
          submitLabel="店舗から外す"
          submitColorPalette="red"
          closeLabel="やめる"
          isLoading={isRemovingMembership}
          isSubmitDisabled={removalPreview.kind === "tooMany" || isRemovingMembership}
          onOpenChange={({ open }) => {
            if (!open && !isRemovingMembership) onCancelRemoveMembership();
          }}
          onClose={() => {
            if (!isRemovingMembership) onCancelRemoveMembership();
          }}
          onSubmit={onConfirmRemoveMembership}
          maxW={{ base: "calc(100vw - 24px)", md: "560px" }}
        >
          <Stack gap={3}>
            <Text fontWeight="semibold">
              {personName}さんを{membership.shopName}から外しますか？
            </Text>
            <Stack gap={1.5} fontSize="sm" color="fg.muted" lineHeight="tall">
              <Text whiteSpace="pre-line">
                {
                  "この店舗からのシフト通知、LINE連携を削除します。\n別店舗の所属はそのままです。\nすべての店舗から外れた場合、未所属として組織に残り続けます。"
                }
              </Text>
              <Text color="orange.700" fontWeight="medium" whiteSpace="pre-line">
                {getAssignmentRemovalDescription(removalPreview)}
              </Text>
            </Stack>
          </Stack>
        </Dialog>
      )}
    </Stack>
  );
}

function getAssignmentRemovalDescription(preview: UserShopDetailRemovalPreview) {
  if (preview.kind === "tooMany") {
    return `今日以降のシフトの割り当てが${preview.limit}件を超えています。
シフトを整理してから削除してください。`;
  }
  if (preview.assignmentCount === 0) return "今日以降のシフトで外れる割り当てはありません。";
  return `今日以降のシフト${preview.assignmentCount}件からも外れます。`;
}
