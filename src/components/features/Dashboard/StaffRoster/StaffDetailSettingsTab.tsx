import { Badge, Box, Flex, Heading, HStack, Stack, Switch, Text, VisuallyHidden } from "@chakra-ui/react";
import { LuTrash2 } from "react-icons/lu";
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
        ? "新しいメールへ招待し直す"
        : managerInvitationState.mode === "freeManagerExchange"
          ? "管理者交代を依頼"
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
          <HStack gap={2} align="center" wrap="wrap">
            <Badge colorPalette="teal" variant="subtle">
              管理者
            </Badge>
            <Text fontSize="sm" color="fg.muted">
              このスタッフは管理者です
            </Text>
          </HStack>
        ) : managerInvitationState.kind === "pending" ? (
          <Stack gap={1.5}>
            <HStack>
              <Badge colorPalette="orange" variant="subtle">
                招待中
              </Badge>
            </HStack>
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              このスタッフへの招待は承認待ちです。再送や取り消しはグループ設定で行えます。
            </Text>
          </Stack>
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

        {isManagerInvitationConfirmationOpen && managerInvitationState.kind === "available" && (
          <ManagerInvitationConfirmation
            staffName={staffName}
            staffEmail={staffEmail}
            invitationState={managerInvitationState}
            isInviting={isInvitingManager}
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

const ManagerInvitationConfirmation = ({
  staffName,
  staffEmail,
  invitationState,
  isInviting,
  onCancel,
  onConfirm,
}: {
  staffName: string;
  staffEmail: string;
  invitationState: Extract<StaffManagerInvitationState, { kind: "available" }>;
  isInviting: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) => {
  const isFreeManagerExchange = invitationState.mode === "freeManagerExchange";
  return (
    <Box borderWidth="1px" borderColor={isFreeManagerExchange ? "orange.200" : "teal.200"} borderRadius="md" p={3}>
      <Stack gap={3}>
        <Stack gap={1}>
          <Heading as="h4" fontSize="sm" fontWeight="semibold" color="gray.900">
            {isFreeManagerExchange
              ? `${staffName}さんへ管理者を交代しますか？`
              : `${staffName}さんを管理者として招待しますか？`}
          </Heading>
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            {isFreeManagerExchange
              ? `承認されると、${staffName}さんが新しい管理者になります。現在の管理者は、このグループのすべての店舗とグループ設定を開けなくなります。スタッフとしての所属と、シフト対象・通知の設定は変更されません。`
              : `${staffEmail}に招待メールを送ります。承認後、このグループのすべての店舗と、プランと支払いを含む契約設定を管理できるようになります。`}
          </Text>
          {invitationState.replacesStaleInvitation && (
            <Text fontSize="sm" color="orange.700" lineHeight="tall">
              以前の招待を無効にして、現在のメールアドレスへ招待を送ります。
            </Text>
          )}
          {isFreeManagerExchange && (
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              招待が承認されるまでは、現在の管理者が引き続き利用できます。
            </Text>
          )}
        </Stack>
        <HStack justify="flex-end" gap={2}>
          <Button variant="outline" onClick={onCancel} disabled={isInviting}>
            やめる
          </Button>
          <Button colorPalette="teal" loading={isInviting} onClick={onConfirm}>
            {isFreeManagerExchange ? "交代の招待を送る" : "招待メールを送る"}
          </Button>
        </HStack>
      </Stack>
    </Box>
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
