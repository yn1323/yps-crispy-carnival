import { Heading, Stack, Text } from "@chakra-ui/react";
import { LuShieldMinus, LuShieldPlus } from "react-icons/lu";
import { DeletionActionSection } from "@/src/components/shared/DeletionActionSection";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import type { UserDetailData, UserDetailRemovalPreview } from "./types";

export function UserManagerSettings({
  data,
  isAssigningManager,
  onRequestManagerAssignment,
  onRequestRemoveManagerRole,
}: {
  data: UserDetailData;
  isAssigningManager: boolean;
  onRequestManagerAssignment: () => void;
  onRequestRemoveManagerRole: () => void;
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
          isAssigningManager,
          onRequestManagerAssignment,
          onRequestRemoveManagerRole,
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
          "組織、すべての店舗からこのスタッフを削除します。\n店舗から外す場合、このページの所属店舗を変更するから外してください。"
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
          mobileActionLayout="stacked"
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
  isAssigningManager,
  onRequestManagerAssignment,
  onRequestRemoveManagerRole,
}: {
  data: UserDetailData;
  isAssigningManager: boolean;
  onRequestManagerAssignment: () => void;
  onRequestRemoveManagerRole: () => void;
}) {
  const managerInvitationDisabledReasonId = `user-detail-manager-invitation-disabled-${data.person.id}`;
  const managerRemovalDisabledReasonId = `user-detail-manager-removal-disabled-${data.person.id}`;
  if (data.managerRole === "active") {
    return (
      <Stack gap={3}>
        <Stack gap={2} align="flex-end">
          <Button
            data-user-manager-confirmation-trigger="remove"
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
          data-user-manager-confirmation-trigger="assign"
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
    </Stack>
  );
}

function getAssignmentRemovalWarning(preview: Extract<UserDetailRemovalPreview, { kind: "tooMany" }>) {
  return `今日以降のシフトの割り当てが${preview.limit}件を超えています。
シフトを整理してから削除してください。`;
}
