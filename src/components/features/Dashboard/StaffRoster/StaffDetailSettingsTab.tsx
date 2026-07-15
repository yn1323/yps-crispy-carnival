import { Box, Flex, Heading, HStack, Stack, Switch, Text, VisuallyHidden } from "@chakra-ui/react";
import { LuTrash2 } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";

type Props = {
  isShiftTarget: boolean;
  isChangingShiftTarget: boolean;
  isManager: boolean;
  isDeleteConfirmationOpen: boolean;
  isDeleting: boolean;
  onChangeShiftTarget: (isShiftTarget: boolean) => void | Promise<void>;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void | Promise<void>;
};

export const StaffDetailSettingsTab = ({
  isShiftTarget,
  isChangingShiftTarget,
  isManager,
  isDeleteConfirmationOpen,
  isDeleting,
  onChangeShiftTarget,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: Props) => (
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
        <DeleteStaffConfirmation isDeleting={isDeleting} onCancel={onCancelDelete} onConfirm={onConfirmDelete} />
      )}
    </Stack>
  </Stack>
);

const DeleteStaffConfirmation = ({
  isDeleting,
  onCancel,
  onConfirm,
}: {
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) => (
  <Box borderWidth="1px" borderColor="red.200" borderRadius="md" p={3}>
    <Stack gap={3}>
      <Stack gap={1}>
        <Text fontWeight="semibold" color="red.700">
          スタッフを削除しますか？
        </Text>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          削除すると元に戻せません。既存のシフト用リンクやLINE連携も使えなくなります。
        </Text>
      </Stack>
      <HStack justify="flex-end" gap={2}>
        <Button variant="outline" onClick={onCancel} disabled={isDeleting}>
          やめる
        </Button>
        <Button colorPalette="red" loading={isDeleting} onClick={onConfirm}>
          スタッフを削除
        </Button>
      </HStack>
    </Stack>
  </Box>
);
