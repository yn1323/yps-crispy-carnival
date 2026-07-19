import { Box, Flex, Heading, Stack, Switch, Text, VisuallyHidden } from "@chakra-ui/react";
import { LuShieldMinus, LuShieldPlus, LuTrash2 } from "react-icons/lu";
import { ManagerAssignmentConfirmation } from "@/src/components/shared/ManagerAssignmentConfirmation";
import { Button } from "@/src/components/ui/Button";
import type { UserDetailData, UserDetailMembership } from "./types";

type Props = {
  membership: UserDetailMembership | null;
  isStoreReadOnly: boolean;
  storeDisabledReason?: string;
  isChangingShiftTarget: boolean;
  onChangeShiftTarget: (isShiftTarget: boolean) => void | Promise<void>;
  onRequestRemoveMembership: () => void;
};

export function UserSettingsTab({
  membership,
  isStoreReadOnly,
  storeDisabledReason,
  isChangingShiftTarget,
  onChangeShiftTarget,
  onRequestRemoveMembership,
}: Props) {
  const storeActionDisabledReasonId = membership
    ? `user-detail-store-action-disabled-${membership.staffId}`
    : undefined;
  const membershipRemovalDisabled = Boolean(membership && (isStoreReadOnly || !membership.canRemove));
  const membershipRemovalDisabledReason = membershipRemovalDisabled
    ? isStoreReadOnly
      ? storeDisabledReason
      : membership?.removeDisabledReason
    : undefined;
  return (
    <Stack gap={8}>
      <SettingsSection
        title={membership ? `${membership.shopName}のスタッフ設定` : "店舗のスタッフ設定"}
        description="シフト対象や、この店舗だけのスタッフ所属を管理します。"
      >
        {membership ? (
          <Stack gap={6}>
            <Stack gap={2}>
              <Flex align="center" justify="space-between" gap={4}>
                <Heading as="h4" fontSize="sm" fontWeight="semibold" color="gray.900">
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

            <Stack gap={2} align="flex-end">
              <Button
                colorPalette="red"
                variant="outline"
                gap={1.5}
                disabled={membershipRemovalDisabled}
                aria-describedby={membershipRemovalDisabledReason ? storeActionDisabledReasonId : undefined}
                onClick={onRequestRemoveMembership}
              >
                <LuTrash2 aria-hidden />
                この店舗から外す
              </Button>
              {membershipRemovalDisabledReason && (
                <Text id={storeActionDisabledReasonId} fontSize="xs" color="orange.700" textAlign="right">
                  {membershipRemovalDisabledReason}
                </Text>
              )}
            </Stack>
          </Stack>
        ) : (
          <Text fontSize="sm" color="fg.muted">
            このユーザーは、現在選択している店舗にはスタッフとして所属していません。
          </Text>
        )}
      </SettingsSection>
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
}: {
  data: UserDetailData;
  isAssignmentConfirmationOpen: boolean;
  isAssigningManager: boolean;
  onRequestManagerAssignment: () => void;
  onCancelManagerAssignment: () => void;
  onAssignManager: () => void | Promise<void>;
  onRequestRemoveManagerRole: () => void;
}) {
  return (
    <Stack gap={4}>
      <Stack gap={1}>
        <Heading as="h3" fontSize="md" fontWeight="semibold" color="gray.900">
          グループの管理権限
        </Heading>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          このグループの設定や店舗情報を管理できる権限です。
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
        }}
      />
    </Stack>
  );
}

export function UserGroupRemovalSection({
  data,
  onRequestRemovePerson,
}: {
  data: UserDetailData;
  onRequestRemovePerson: () => void;
}) {
  const disabledReasonId = `user-detail-person-removal-disabled-${data.person.id}`;
  return (
    <Stack gap={3}>
      <Heading
        as="h2"
        fontSize={{ base: "lg", lg: "xl" }}
        lineHeight={{ base: "1.75rem", lg: "1.875rem" }}
        fontWeight="bold"
        color="red.700"
      >
        グループから削除
      </Heading>
      <Box borderWidth="1px" borderColor="red.100" borderRadius="lg" bg="white" p={{ base: 4, md: 5 }}>
        <Stack gap={4}>
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            すべての店舗所属と管理権限を終了します。過去のシフト履歴は保持します。
          </Text>
          <Stack gap={2} align="flex-end">
            <Button
              colorPalette="red"
              gap={1.5}
              disabled={!data.canRemove}
              aria-describedby={!data.canRemove && data.removeDisabledReason ? disabledReasonId : undefined}
              onClick={onRequestRemovePerson}
            >
              <LuTrash2 aria-hidden />
              グループから削除
            </Button>
            {!data.canRemove && data.removeDisabledReason && (
              <Text id={disabledReasonId} fontSize="xs" color="orange.700" textAlign="right">
                {data.removeDisabledReason}
              </Text>
            )}
          </Stack>
        </Stack>
      </Box>
    </Stack>
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
}: {
  data: UserDetailData;
  isAssignmentConfirmationOpen: boolean;
  isAssigningManager: boolean;
  onRequestManagerAssignment: () => void;
  onCancelManagerAssignment: () => void;
  onAssignManager: () => void | Promise<void>;
  onRequestRemoveManagerRole: () => void;
}) {
  const managerRemovalDisabledReasonId = `user-detail-manager-removal-disabled-${data.person.id}`;
  const managerInvitationDisabledReasonId = `user-detail-manager-invitation-disabled-${data.person.id}`;

  if (data.managerRole === "active") {
    return (
      <Stack gap={2} align="flex-end">
        <Button
          variant="outline"
          gap={1.5}
          disabled={!data.canRemoveManagerRole}
          aria-describedby={
            !data.canRemoveManagerRole && data.managerRoleRemovalDisabledReason
              ? managerRemovalDisabledReasonId
              : undefined
          }
          onClick={onRequestRemoveManagerRole}
        >
          <LuShieldMinus aria-hidden />
          管理者権限を外す
        </Button>
        {!data.canRemoveManagerRole && data.managerRoleRemovalDisabledReason && (
          <Text id={managerRemovalDisabledReasonId} fontSize="xs" color="orange.700" textAlign="right">
            {data.managerRoleRemovalDisabledReason}
          </Text>
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

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="lg" bg="white" p={{ base: 4, md: 5 }}>
      <Stack gap={4}>
        <Stack gap={1}>
          <Heading as="h3" fontSize="md" fontWeight="semibold" color="gray.900">
            {title}
          </Heading>
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            {description}
          </Text>
        </Stack>
        {children}
      </Stack>
    </Box>
  );
}
