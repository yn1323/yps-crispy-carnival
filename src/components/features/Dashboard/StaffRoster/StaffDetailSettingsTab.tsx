import { Flex, Heading, Stack, Switch, Text, VisuallyHidden } from "@chakra-ui/react";
import { LuShieldCheck, LuTrash2 } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import type { StaffManagerInvitationState } from "../types";

type Props = {
  isReadOnly: boolean;
  isShiftTarget: boolean;
  isChangingShiftTarget: boolean;
  isManager: boolean;
  managerInvitationState: StaffManagerInvitationState;
  onChangeShiftTarget: (isShiftTarget: boolean) => void | Promise<void>;
  onManageManagers: () => void;
  onRequestDelete: () => void;
};

export const StaffDetailSettingsTab = ({
  isReadOnly,
  isShiftTarget,
  isChangingShiftTarget,
  isManager,
  managerInvitationState,
  onChangeShiftTarget,
  onManageManagers,
  onRequestDelete,
}: Props) => (
  <Stack gap={6}>
    <Stack gap={2}>
      <Flex align="center" justify="space-between" gap={4}>
        <Heading as="h3" fontSize="sm" fontWeight="semibold" color="gray.900">
          シフト対象
        </Heading>
        <Switch.Root
          checked={isShiftTarget}
          disabled={isReadOnly || isChangingShiftTarget}
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
        <Stack gap={1}>
          <Heading as="h3" fontSize="sm" fontWeight="semibold" color="gray.900">
            管理者権限
          </Heading>
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            {isManager
              ? "現在の管理者です。権限の変更は管理者設定から行えます。"
              : managerInvitationState.kind === "pending"
                ? "管理者招待を送信済みです。再送や取り消しは管理者設定から行えます。"
                : "招待や権限の変更は管理者設定から行えます。"}
          </Text>
        </Stack>
        <Flex justify="flex-end">
          <Button variant="outline" gap={1.5} onClick={onManageManagers}>
            <LuShieldCheck aria-hidden />
            管理者設定で変更
          </Button>
        </Flex>
      </Stack>
    )}

    <Stack gap={3}>
      <Flex justify="flex-end">
        <Button
          data-staff-detail-confirmation-trigger="delete"
          colorPalette="red"
          gap={1.5}
          disabled={isReadOnly || isManager}
          onClick={onRequestDelete}
        >
          <LuTrash2 aria-hidden />
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
