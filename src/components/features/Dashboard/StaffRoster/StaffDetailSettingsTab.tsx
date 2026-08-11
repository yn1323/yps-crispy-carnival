import { Flex, Heading, Stack, Switch, Text, VisuallyHidden } from "@chakra-ui/react";
import { LuTrash2 } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import type { StaffManagerInvitationState } from "../types";

type Props = {
  isShiftTarget: boolean;
  isChangingShiftTarget: boolean;
  isManager: boolean;
  managerInvitationState: StaffManagerInvitationState;
  isInvitingManager: boolean;
  onChangeShiftTarget: (isShiftTarget: boolean) => void | Promise<void>;
  onRequestManagerInvitation: () => void;
  onRequestDelete: () => void;
};

export const StaffDetailSettingsTab = ({
  isShiftTarget,
  isChangingShiftTarget,
  isManager,
  managerInvitationState,
  isInvitingManager,
  onChangeShiftTarget,
  onRequestManagerInvitation,
  onRequestDelete,
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
        <Text fontSize="sm" color="fg.muted" lineHeight="tall" whiteSpace="pre-line">
          OFFにするとシフト表に表示されなくなり、シフト募集や確定通知の対象からも外れます。
        </Text>
      </Stack>

      {managerInvitationState.kind !== "hidden" && (
        <Stack gap={3}>
          <Heading as="h3" fontSize="sm" fontWeight="semibold" color="gray.900">
            管理者権限
          </Heading>

          {isManager ? (
            <Stack gap={2} align="flex-end">
              <Button aria-describedby="staff-manager-invitation-already-manager-reason" disabled>
                {invitationButtonLabel}
              </Button>
              <Text
                id="staff-manager-invitation-already-manager-reason"
                fontSize="sm"
                color="fg.muted"
                textAlign="right"
              >
                すでに管理者です
              </Text>
            </Stack>
          ) : managerInvitationState.kind === "pending" ? (
            <Flex justify="flex-end">
              <Button
                data-staff-detail-confirmation-trigger="managerInvitation"
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
                data-staff-detail-confirmation-trigger="managerInvitation"
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
        </Stack>
      )}

      <Stack gap={3}>
        <Flex justify="flex-end">
          <Button
            data-staff-detail-confirmation-trigger="delete"
            colorPalette="red"
            gap={1.5}
            disabled={isManager}
            onClick={onRequestDelete}
          >
            <LuTrash2 />
            スタッフを削除
          </Button>
        </Flex>
        {isManager && (
          <Text fontSize="xs" color="fg.muted" textAlign="right">
            管理者は削除できません
          </Text>
        )}
      </Stack>
    </Stack>
  );
};
