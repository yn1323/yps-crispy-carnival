import { Heading, Stack, Text } from "@chakra-ui/react";
import { LuShieldCheck } from "react-icons/lu";
import { DeletionActionSection } from "@/src/components/shared/DeletionActionSection";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import type { UserDetailData, UserDetailRemovalPreview } from "./types";

export function UserManagerSettings({
  data,
  onManageManagers,
  disabledReason,
}: {
  data: UserDetailData;
  onManageManagers: () => void;
  disabledReason?: string;
}) {
  if (data.managerInvitationState.kind === "hidden") return null;

  return (
    <Stack gap={4}>
      <Stack gap={1}>
        <Heading as="h3" fontSize="md" fontWeight="semibold" color="gray.900">
          管理者権限
        </Heading>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          {getManagerRoleDescription(data)}
        </Text>
      </Stack>
      <Button
        variant="outline"
        alignSelf="flex-end"
        gap={1.5}
        disabled={Boolean(disabledReason)}
        aria-describedby={disabledReason ? "user-manager-settings-disabled-reason" : undefined}
        onClick={onManageManagers}
      >
        <LuShieldCheck aria-hidden />
        管理者設定で変更
      </Button>
      {disabledReason && (
        <Text id="user-manager-settings-disabled-reason" fontSize="xs" color="orange.700" textAlign="right">
          {disabledReason}
        </Text>
      )}
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
          submitLabel="削除する"
          submitColorPalette="red"
          closeLabel="やめる"
          isLoading={isRemoving}
          isSubmitDisabled={removalPreview.kind === "tooMany" || isRemoving}
          mobileActionLayout="inline"
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

function getManagerRoleDescription(data: UserDetailData): string {
  if (data.managerRole === "active") return "現在の管理者です。権限の変更は管理者設定から行えます。";
  if (data.managerRole === "readOnly") return "閲覧のみの管理者です。契約状態の復旧後に権限を変更できます。";
  if (data.hasManagerInvitation) return "管理者招待を送信済みです。再送や取り消しは管理者設定から行えます。";
  return "現在は管理者ではありません。招待は管理者設定から行えます。";
}

function getAssignmentRemovalWarning(preview: Extract<UserDetailRemovalPreview, { kind: "tooMany" }>) {
  return `今日以降のシフトの割り当てが${preview.limit}件を超えています。
シフトを整理してから削除してください。`;
}
