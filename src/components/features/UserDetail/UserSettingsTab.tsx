import { Box, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { useEffect, useId, useRef } from "react";
import { LuShieldMinus, LuShieldPlus } from "react-icons/lu";
import { DeletionActionSection } from "@/src/components/shared/DeletionActionSection";
import { ManagerAssignmentConfirmation } from "@/src/components/shared/ManagerAssignmentConfirmation";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import type { UserDetailData, UserDetailRemovalPreview } from "./types";

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
  if (data.managerInvitationState.kind === "hidden") return null;

  return (
    <Stack gap={4}>
      <Stack gap={1}>
        <Heading as="h3" fontSize="md" fontWeight="semibold" color="gray.900">
          管理者権限
        </Heading>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          シフト調整、店舗の追加・編集、支払いが可能になります。
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
  disabledReason,
  removalPreview,
  isConfirmationOpen,
  isRemoving,
  onRequestRemovePerson,
  onCancelRemovePerson,
  onConfirmRemovePerson,
}: {
  personName: string;
  isDisabled: boolean;
  disabledReason?: string;
  removalPreview: UserDetailRemovalPreview;
  isConfirmationOpen: boolean;
  isRemoving: boolean;
  onRequestRemovePerson: () => void;
  onCancelRemovePerson: () => void;
  onConfirmRemovePerson: () => void | Promise<void>;
}) {
  const disabledReasonId = disabledReason ? "user-detail-group-removal-disabled-reason" : undefined;

  return (
    <>
      <DeletionActionSection
        title="スタッフを完全に削除する"
        description={
          "組織、すべての店舗からこのスタッフを削除します。\n店舗から外す場合、所属店舗ページから「店舗から外す」を押してください。"
        }
        descriptionFontSize="xs"
        actionLabel="削除する"
        actionVariant="solid"
        canDelete={!isDisabled}
        disabledReason={disabledReason}
        disabledReasonId={disabledReasonId}
        onDelete={onRequestRemovePerson}
      />

      {isConfirmationOpen && (
        <Dialog
          title="スタッフを削除"
          isOpen
          role="alertdialog"
          submitLabel="組織から削除"
          submitColorPalette="red"
          closeLabel="やめる"
          isLoading={isRemoving}
          isSubmitDisabled={removalPreview.kind === "tooMany" || isRemoving}
          onOpenChange={({ open }) => {
            if (!open && !isRemoving) onCancelRemovePerson();
          }}
          onClose={() => {
            if (!isRemoving) onCancelRemovePerson();
          }}
          onSubmit={onConfirmRemovePerson}
          maxW={{ base: "calc(100vw - 24px)", md: "560px" }}
        >
          <Stack gap={3} fontSize="sm" color="fg.muted" lineHeight="tall">
            <Text fontWeight="semibold" color="gray.900">
              {personName}さんを完全に削除しますか？
            </Text>
            <Text>組織と所属する全店舗から完全に削除します。</Text>
            {removalPreview.kind === "tooMany" && (
              <Text color="orange.700" fontWeight="medium" whiteSpace="pre-line">
                {getAssignmentRemovalWarning(removalPreview)}
              </Text>
            )}
            <Text color="red.700" fontWeight="semibold">
              この操作はもとに戻せません。
            </Text>
          </Stack>
        </Dialog>
      )}
    </>
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
  const managerRemovalDisabledReasonId = `user-detail-manager-removal-disabled-${data.person.id}`;

  if (data.managerRole === "active") {
    return (
      <Stack gap={3}>
        <Stack gap={2} align="flex-end">
          <Button
            variant="outline"
            gap={1.5}
            disabled={data.shops.length === 0 || !data.canRemoveManagerRole}
            aria-describedby={
              data.shops.length === 0 || !data.canRemoveManagerRole ? managerRemovalDisabledReasonId : undefined
            }
            onClick={onRequestRemoveManagerRole}
          >
            <LuShieldMinus aria-hidden />
            管理者権限を外す
          </Button>
          {(data.shops.length === 0 || !data.canRemoveManagerRole) && (
            <Text id={managerRemovalDisabledReasonId} fontSize="xs" color="orange.700" textAlign="right">
              {data.shops.length === 0
                ? "操作できる店舗がないため、管理者権限を外せません。"
                : (data.managerRoleRemovalDisabledReason ?? "現在、管理者権限を外せません。")}
            </Text>
          )}
        </Stack>
        {isRemovalConfirmationOpen && (
          <InlineDestructiveConfirmation
            title={`${data.person.name}さんの管理者権限を外しますか？`}
            description={
              data.memberships.length > 0
                ? "このユーザーの組織全体に対する管理権限を外します。\nスタッフとしての店舗所属は維持します。\nこのユーザーが発行した未連携のログイン案内は無効になります。"
                : "店舗所属がないため、管理者権限を外すと、この組織へのアクセスも終了します。\n組織のユーザー情報とシフト記録は残ります。\nこのユーザーが発行した未連携のログイン案内は無効になります。"
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
  const canAssign =
    data.canWrite && (invitation.kind === "available" || invitation.kind === "pending") && data.person.email.length > 0;
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
              ? (data.writeDisabledReason ?? "現在、この組織の情報を変更できません。")
              : invitation.kind === "unavailable"
                ? invitation.reason
                : "メールアドレスを登録してから、管理者に設定してください。"}
          </Text>
        )}
      </Stack>

      {isAssignmentConfirmationOpen &&
        canAssign &&
        data.person.email &&
        (invitation.kind === "available" || invitation.kind === "pending") && (
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
  warning,
  confirmLabel,
  isLoading,
  isDisabled = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  warning?: string;
  confirmLabel: string;
  isLoading: boolean;
  isDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const warningId = useId();
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
      aria-describedby={warning ? `${descriptionId} ${warningId}` : descriptionId}
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
          <Text id={descriptionId} fontSize="sm" color="fg.muted" lineHeight="tall" whiteSpace="pre-line">
            {description}
          </Text>
          {warning && (
            <Text id={warningId} fontSize="sm" color="orange.700" lineHeight="tall" fontWeight="medium">
              {warning}
            </Text>
          )}
        </Stack>
        <HStack justify="flex-end" gap={2}>
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            やめる
          </Button>
          <Button colorPalette="red" loading={isLoading} disabled={isDisabled || isLoading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </HStack>
      </Stack>
    </Box>
  );
}

function getAssignmentRemovalWarning(preview: Extract<UserDetailRemovalPreview, { kind: "tooMany" }>) {
  return `今日以降のシフトの割り当てが${preview.limit}件を超えています。
シフトを整理してから削除してください。`;
}
