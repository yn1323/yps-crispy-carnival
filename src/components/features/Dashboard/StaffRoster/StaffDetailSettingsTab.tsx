import { Box, Flex, Heading, HStack, Stack, Switch, Text, VisuallyHidden } from "@chakra-ui/react";
import { LuTrash2 } from "react-icons/lu";
import { ManagerAssignmentConfirmation } from "@/src/components/shared/ManagerAssignmentConfirmation";
import { Button } from "@/src/components/ui/Button";
import type { StaffManagerInvitationState } from "../types";

type Props = {
  isShiftTarget: boolean;
  isChangingShiftTarget: boolean;
  isManager: boolean;
  staffName: string;
  staffEmail: string;
  managerInvitationState: StaffManagerInvitationState;
  isManagerInvitationConfirmationOpen: boolean;
  isInvitingManager: boolean;
  isOrganizationLinked: boolean;
  isDeleteConfirmationOpen: boolean;
  isDeleting: boolean;
  onChangeShiftTarget: (isShiftTarget: boolean) => void | Promise<void>;
  onRequestManagerInvitation: () => void;
  onCancelManagerInvitation: () => void;
  onConfirmManagerInvitation: () => void | Promise<void>;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void | Promise<void>;
};

export const StaffDetailSettingsTab = ({
  isShiftTarget,
  isChangingShiftTarget,
  isManager,
  staffName,
  staffEmail,
  managerInvitationState,
  isManagerInvitationConfirmationOpen,
  isInvitingManager,
  isOrganizationLinked,
  isDeleteConfirmationOpen,
  isDeleting,
  onChangeShiftTarget,
  onRequestManagerInvitation,
  onCancelManagerInvitation,
  onConfirmManagerInvitation,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: Props) => {
  const invitationButtonLabel =
    managerInvitationState.kind === "available"
      ? managerInvitationState.replacesStaleInvitation
        ? "新しいメールへ案内を送り直す"
        : managerInvitationState.mode === "freeManagerExchange"
          ? "次の管理者として招待"
          : "管理者として招待"
      : "管理者として招待";

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Flex align="center" justify="space-between" gap={4}>
          <Heading as="h3" fontSize="sm" fontWeight="semibold" color="gray.900">
            シフト対象
          </Heading>
          <Switch.Root
            checked={isShiftTarget}
            disabled={isChangingShiftTarget}
            colorPalette="teal"
            onCheckedChange={(details) => onChangeShiftTarget(details.checked)}
          >
            <Switch.HiddenInput />
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

      <Stack gap={3}>
        <Heading as="h3" fontSize="sm" fontWeight="semibold" color="gray.900">
          管理者権限
        </Heading>

        {isManager ? (
          <Stack gap={2} align="flex-end">
            <Button aria-describedby="staff-manager-invitation-already-manager-reason" disabled>
              {invitationButtonLabel}
            </Button>
            <Text id="staff-manager-invitation-already-manager-reason" fontSize="sm" color="fg.muted" textAlign="right">
              すでに管理者です
            </Text>
          </Stack>
        ) : managerInvitationState.kind === "pending" ? (
          <Flex justify="flex-end">
            <Button
              colorPalette="teal"
              variant="outline"
              loading={isInvitingManager}
              disabled={isInvitingManager}
              onClick={onRequestManagerInvitation}
            >
              ログイン案内を再送
            </Button>
          </Flex>
        ) : managerInvitationState.kind === "available" ? (
          <Flex justify="flex-end">
            <Button
              colorPalette="teal"
              loading={isInvitingManager}
              disabled={isInvitingManager}
              onClick={onRequestManagerInvitation}
            >
              {invitationButtonLabel}
            </Button>
          </Flex>
        ) : (
          <Stack gap={2} align="flex-end">
            <Button aria-describedby="staff-manager-invitation-unavailable-reason" disabled>
              {invitationButtonLabel}
            </Button>
            <Text
              id="staff-manager-invitation-unavailable-reason"
              maxW="560px"
              fontSize="sm"
              color="fg.muted"
              lineHeight="tall"
              textAlign="right"
            >
              {managerInvitationState.reason}
            </Text>
          </Stack>
        )}

        {isManagerInvitationConfirmationOpen && managerInvitationState.kind !== "unavailable" && (
          <ManagerAssignmentConfirmation
            personName={staffName}
            personEmail={staffEmail}
            mode={managerInvitationState.mode}
            replacesStaleInvitation={
              managerInvitationState.kind === "available" && managerInvitationState.replacesStaleInvitation
            }
            isResend={managerInvitationState.kind === "pending"}
            isRunning={isInvitingManager}
            onCancel={onCancelManagerInvitation}
            onConfirm={onConfirmManagerInvitation}
          />
        )}
      </Stack>

      <Stack gap={3}>
        <Flex justify="flex-end">
          <Button colorPalette="red" gap={1.5} disabled={isManager} onClick={onRequestDelete}>
            <LuTrash2 />
            スタッフを削除
          </Button>
        </Flex>
        {isManager && (
          <Text fontSize="xs" color="fg.muted" textAlign="right">
            管理者は削除できません
          </Text>
        )}
        {isDeleteConfirmationOpen && (
          <DeleteStaffConfirmation
            isDeleting={isDeleting}
            isOrganizationLinked={isOrganizationLinked}
            onCancel={onCancelDelete}
            onConfirm={onConfirmDelete}
          />
        )}
      </Stack>
    </Stack>
  );
};

const DeleteStaffConfirmation = ({
  isDeleting,
  isOrganizationLinked,
  onCancel,
  onConfirm,
}: {
  isDeleting: boolean;
  isOrganizationLinked: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) => (
  <Box borderWidth="1px" borderColor="red.200" borderRadius="md" p={3}>
    <Stack gap={3}>
      <Stack gap={1}>
        <Text fontWeight="semibold" color="red.700">
          {isOrganizationLinked ? "この店舗のスタッフ所属を削除しますか？" : "スタッフを削除しますか？"}
        </Text>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          {isOrganizationLinked
            ? "この店舗の所属と既存のシフト用リンク、LINE連携を終了します。グループの人物情報、ほかの店舗所属、管理者権限は変更せず、利用人数にも引き続き含まれます。将来のシフトに割り当てられている場合は削除できません。"
            : "削除すると元に戻せません。既存のシフト用リンクやLINE連携も使えなくなります。"}
        </Text>
      </Stack>
      <HStack justify="flex-end" gap={2}>
        <Button variant="outline" onClick={onCancel} disabled={isDeleting}>
          やめる
        </Button>
        <Button colorPalette="red" loading={isDeleting} onClick={onConfirm}>
          {isOrganizationLinked ? "店舗から削除" : "スタッフを削除"}
        </Button>
      </HStack>
    </Stack>
  </Box>
);
