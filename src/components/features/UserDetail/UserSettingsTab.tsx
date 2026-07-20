import { Box, Flex, Heading, HStack, Stack, Switch, Text, VisuallyHidden } from "@chakra-ui/react";
import { useEffect, useId, useRef } from "react";
import { LuShieldMinus, LuShieldPlus, LuTrash2 } from "react-icons/lu";
import { ManagerAssignmentConfirmation } from "@/src/components/shared/ManagerAssignmentConfirmation";
import { Button } from "@/src/components/ui/Button";
import type { UserDetailData, UserDetailMembership } from "./types";

type Props = {
  personName: string;
  membership: UserDetailMembership;
  isStoreReadOnly: boolean;
  storeDisabledReason?: string;
  isChangingShiftTarget: boolean;
  isRemovalConfirmationOpen: boolean;
  isRemovingMembership: boolean;
  onChangeShiftTarget: (isShiftTarget: boolean) => void | Promise<void>;
  onRequestRemoveMembership: () => void;
  onCancelRemoveMembership: () => void;
  onConfirmRemoveMembership: () => void | Promise<void>;
};

export function UserSettingsTab({
  personName,
  membership,
  isStoreReadOnly,
  storeDisabledReason,
  isChangingShiftTarget,
  isRemovalConfirmationOpen,
  isRemovingMembership,
  onChangeShiftTarget,
  onRequestRemoveMembership,
  onCancelRemoveMembership,
  onConfirmRemoveMembership,
}: Props) {
  const storeActionDisabledReasonId = `user-detail-store-action-disabled-${membership.staffId}`;
  const membershipRemovalDisabled = isStoreReadOnly || !membership.canRemove;
  const membershipRemovalDisabledReason = membershipRemovalDisabled
    ? isStoreReadOnly
      ? storeDisabledReason
      : membership.removeDisabledReason
    : undefined;
  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Flex align="center" justify="space-between" gap={4}>
          <Heading as="h3" fontSize="sm" fontWeight="semibold" color="gray.900">
            シフト対象
          </Heading>
          <Switch.Root
            checked={!membership.excludedFromShift}
            disabled={isStoreReadOnly || isChangingShiftTarget}
            colorPalette="teal"
            onCheckedChange={(details) => onChangeShiftTarget(details.checked)}
          >
            <Switch.HiddenInput
              aria-describedby={isStoreReadOnly && storeDisabledReason ? storeActionDisabledReasonId : undefined}
            />
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Switch.Label>
              <VisuallyHidden>シフト対象</VisuallyHidden>
            </Switch.Label>
          </Switch.Root>
        </Flex>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          OFFにするとシフト表から非表示になり、シフト募集、確定通知も来なくなります。
        </Text>
      </Stack>

      <Box borderTopWidth="1px" borderColor="blackAlpha.100" pt={6}>
        <Stack gap={3}>
          <Heading as="h3" fontSize="sm" fontWeight="semibold" color="gray.900">
            このスタッフを店舗から外す
          </Heading>
          <Stack gap={2} align="flex-end">
            <Button
              colorPalette="red"
              variant="solid"
              gap={1.5}
              disabled={membershipRemovalDisabled}
              aria-describedby={membershipRemovalDisabledReason ? storeActionDisabledReasonId : undefined}
              onClick={onRequestRemoveMembership}
            >
              <LuTrash2 aria-hidden />
              店舗から外す
            </Button>
            {membershipRemovalDisabledReason && (
              <Text id={storeActionDisabledReasonId} fontSize="xs" color="orange.700" textAlign="right">
                {membershipRemovalDisabledReason}
              </Text>
            )}
          </Stack>
          {isRemovalConfirmationOpen && (
            <InlineDestructiveConfirmation
              title={`${personName}さんを${membership.shopName}から外しますか？`}
              description="この店舗のスタッフ所属、既存のシフト用リンク、LINE連携を終了します。グループのユーザー情報、ほかの店舗所属、管理者権限は変更しません。将来のシフトに割り当てられている場合は削除できません。"
              confirmLabel="店舗から外す"
              isLoading={isRemovingMembership}
              onCancel={onCancelRemoveMembership}
              onConfirm={onConfirmRemoveMembership}
            />
          )}
        </Stack>
      </Box>
    </Stack>
  );
}

export function UserManagerSettings({
  data,
  isAssignmentConfirmationOpen,
  isAssigningManager,
  onRequestManagerAssignment,
  onCancelManagerAssignment,
  onAssignManager,
  onRequestRemoveManagerRole,
  isRemovalConfirmationOpen,
  isRemovingManagerRole,
  onCancelRemoveManagerRole,
  onConfirmRemoveManagerRole,
}: {
  data: UserDetailData;
  isAssignmentConfirmationOpen: boolean;
  isAssigningManager: boolean;
  onRequestManagerAssignment: () => void;
  onCancelManagerAssignment: () => void;
  onAssignManager: () => void | Promise<void>;
  onRequestRemoveManagerRole: () => void;
  isRemovalConfirmationOpen: boolean;
  isRemovingManagerRole: boolean;
  onCancelRemoveManagerRole: () => void;
  onConfirmRemoveManagerRole: () => void | Promise<void>;
}) {
  return (
    <Stack gap={4}>
      <Stack gap={1}>
        <Heading as="h3" fontSize="md" fontWeight="semibold" color="gray.900">
          管理者権限
        </Heading>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          シフト調整、店舗追加編集、支払いが可能になります。
        </Text>
      </Stack>
      <ManagerRoleAction
        {...{
          data,
          isAssignmentConfirmationOpen,
          isAssigningManager,
          onRequestManagerAssignment,
          onCancelManagerAssignment,
          onAssignManager,
          onRequestRemoveManagerRole,
          isRemovalConfirmationOpen,
          isRemovingManagerRole,
          onCancelRemoveManagerRole,
          onConfirmRemoveManagerRole,
        }}
      />
    </Stack>
  );
}

export function UserGroupRemovalSection({
  personName,
  isDisabled,
  isConfirmationOpen,
  isRemoving,
  onRequestRemovePerson,
  onCancelRemovePerson,
  onConfirmRemovePerson,
}: {
  personName: string;
  isDisabled: boolean;
  isConfirmationOpen: boolean;
  isRemoving: boolean;
  onRequestRemovePerson: () => void;
  onCancelRemovePerson: () => void;
  onConfirmRemovePerson: () => void | Promise<void>;
}) {
  return (
    <Box as="section" borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
      <Box p={{ base: 4, md: 5 }}>
        <Stack gap={4}>
          <Stack gap={1}>
            <Heading as="h2" fontSize="md" fontWeight="semibold" color="red.700">
              ユーザーを削除する
            </Heading>
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              このグループからユーザーを削除します。ほかのグループへの所属には影響しません。この操作は元に戻せません。
            </Text>
          </Stack>
          <Flex justify="flex-end">
            <Button colorPalette="red" variant="solid" gap={1.5} disabled={isDisabled} onClick={onRequestRemovePerson}>
              <LuTrash2 aria-hidden />
              削除
            </Button>
          </Flex>
          {isConfirmationOpen && (
            <InlineDestructiveConfirmation
              title={`${personName}さんをグループから削除しますか？`}
              description="このグループのすべての店舗所属、管理権限、スタッフ権限、閲覧権限を終了します。ほかのグループへの所属には影響しません。過去のシフト履歴は保持します。この操作は元に戻せません。"
              confirmLabel="グループから削除"
              isLoading={isRemoving}
              onCancel={onCancelRemovePerson}
              onConfirm={onConfirmRemovePerson}
            />
          )}
        </Stack>
      </Box>
    </Box>
  );
}

function ManagerRoleAction({
  data,
  isAssignmentConfirmationOpen,
  isAssigningManager,
  onRequestManagerAssignment,
  onCancelManagerAssignment,
  onAssignManager,
  onRequestRemoveManagerRole,
  isRemovalConfirmationOpen,
  isRemovingManagerRole,
  onCancelRemoveManagerRole,
  onConfirmRemoveManagerRole,
}: {
  data: UserDetailData;
  isAssignmentConfirmationOpen: boolean;
  isAssigningManager: boolean;
  onRequestManagerAssignment: () => void;
  onCancelManagerAssignment: () => void;
  onAssignManager: () => void | Promise<void>;
  onRequestRemoveManagerRole: () => void;
  isRemovalConfirmationOpen: boolean;
  isRemovingManagerRole: boolean;
  onCancelRemoveManagerRole: () => void;
  onConfirmRemoveManagerRole: () => void | Promise<void>;
}) {
  const managerInvitationDisabledReasonId = `user-detail-manager-invitation-disabled-${data.person.id}`;

  if (data.managerRole === "active") {
    return (
      <Stack gap={3}>
        <Flex justify="flex-end">
          <Button
            variant="outline"
            gap={1.5}
            disabled={data.shops.length === 0 || (!data.canWrite && !data.canRemoveManagerRole)}
            onClick={onRequestRemoveManagerRole}
          >
            <LuShieldMinus aria-hidden />
            管理者権限を外す
          </Button>
        </Flex>
        {isRemovalConfirmationOpen && (
          <InlineDestructiveConfirmation
            title={`${data.person.name}さんの管理者権限を外しますか？`}
            description={
              data.memberships.length > 0
                ? "グループ全体の管理権限を終了します。スタッフとしての店舗所属は維持します。このユーザーが発行した未連携のログイン案内は無効になります。"
                : "店舗所属がないため、管理者権限を外すと、このグループへのアクセスも終了します。このユーザーが発行した未連携のログイン案内は無効になります。"
            }
            confirmLabel="管理者権限を外す"
            isLoading={isRemovingManagerRole}
            onCancel={onCancelRemoveManagerRole}
            onConfirm={onConfirmRemoveManagerRole}
          />
        )}
      </Stack>
    );
  }

  if (data.managerRole === "readOnly") {
    return (
      <Stack gap={1}>
        <Text fontSize="sm" fontWeight="semibold" color="gray.900">
          閲覧のみの管理者です
        </Text>
        <Text fontSize="sm" color="fg.muted">
          現在の契約状態では、この画面から管理者権限を変更できません。
        </Text>
      </Stack>
    );
  }

  const invitation = data.managerInvitationState;
  const canAssign = data.canWrite && invitation.kind !== "unavailable" && data.person.email.length > 0;
  const isResend = invitation.kind === "pending";
  const buttonLabel =
    invitation.kind === "pending"
      ? "ログイン案内を再送"
      : invitation.kind === "available" && invitation.replacesStaleInvitation
        ? "新しいメールへ案内を送り直す"
        : invitation.kind === "available" && invitation.mode === "freeManagerExchange"
          ? "次の管理者として招待"
          : "管理者として招待";

  return (
    <Stack gap={3}>
      <Stack gap={2} align="flex-end">
        <Button
          colorPalette="teal"
          variant={isResend ? "outline" : "solid"}
          gap={1.5}
          loading={isAssigningManager}
          disabled={!canAssign || isAssigningManager}
          aria-describedby={!canAssign ? managerInvitationDisabledReasonId : undefined}
          onClick={onRequestManagerAssignment}
        >
          <LuShieldPlus aria-hidden />
          {buttonLabel}
        </Button>
        {!canAssign && (
          <Text id={managerInvitationDisabledReasonId} fontSize="xs" color="orange.700" textAlign="right">
            {!data.canWrite
              ? (data.writeDisabledReason ?? "現在、このグループの情報を変更できません。")
              : invitation.kind === "unavailable"
                ? invitation.reason
                : "メールアドレスを登録してから管理者にしてください。"}
          </Text>
        )}
      </Stack>

      {isAssignmentConfirmationOpen && canAssign && data.person.email && (
        <ManagerAssignmentConfirmation
          personName={data.person.name}
          personEmail={data.person.email}
          mode={invitation.mode}
          replacesStaleInvitation={invitation.kind === "available" && invitation.replacesStaleInvitation}
          isResend={isResend}
          isRunning={isAssigningManager}
          onCancel={onCancelManagerAssignment}
          onConfirm={onAssignManager}
        />
      )}
    </Stack>
  );
}

function InlineDestructiveConfirmation({
  title,
  description,
  confirmLabel,
  isLoading,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  isLoading: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const confirmationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmationRef.current?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <Box
      ref={confirmationRef}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      borderWidth="1px"
      borderColor="red.200"
      borderRadius="md"
      p={3}
      w="full"
    >
      <Stack gap={3}>
        <Stack gap={1}>
          <Text id={titleId} fontWeight="semibold" color="red.700">
            {title}
          </Text>
          <Text id={descriptionId} fontSize="sm" color="fg.muted" lineHeight="tall">
            {description}
          </Text>
        </Stack>
        <HStack justify="flex-end" gap={2}>
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            やめる
          </Button>
          <Button colorPalette="red" loading={isLoading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </HStack>
      </Stack>
    </Box>
  );
}
