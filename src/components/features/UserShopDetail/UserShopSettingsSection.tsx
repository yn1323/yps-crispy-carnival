import { Box, Flex, Heading, Stack, Switch, Text } from "@chakra-ui/react";
import type { UserShopDetailMembership } from "./types";

type Props = {
  membership: UserShopDetailMembership;
  isStoreReadOnly: boolean;
  storeDisabledReason?: string;
  isChangingShiftTarget: boolean;
  onChangeShiftTarget: (isShiftTarget: boolean) => void | Promise<void>;
};

export function UserShopSettingsSection({
  membership,
  isStoreReadOnly,
  storeDisabledReason,
  isChangingShiftTarget,
  onChangeShiftTarget,
}: Props) {
  const shiftTargetDisabledReasonId = `user-shop-detail-shift-target-disabled-${membership.staffId}`;

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Flex align="center" justify="space-between" gap={4}>
          <Heading as="h2" fontSize="md" fontWeight="semibold" color="gray.900">
            このユーザーをシフト対象とする
          </Heading>
          <Switch.Root
            checked={!membership.excludedFromShift}
            disabled={isStoreReadOnly || isChangingShiftTarget}
            colorPalette="teal"
            onCheckedChange={(details) => onChangeShiftTarget(details.checked)}
          >
            <Switch.HiddenInput
              aria-label="このユーザーをシフト対象とする"
              aria-describedby={isStoreReadOnly && storeDisabledReason ? shiftTargetDisabledReasonId : undefined}
            />
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Root>
        </Flex>
        <Stack gap={1} fontSize="sm" color="fg.muted" lineHeight="tall">
          <Text>シフトに含めない管理者専用ユーザーは、「このユーザーをシフト対象とする」をオフにしてください。</Text>
          <Text>オフにすると次の状態になります。</Text>
          <Box as="ul" ps={5}>
            <Box as="li">シフト募集、確定を通知しない</Box>
            <Box as="li">シフト調整画面でこのユーザーを表示しない</Box>
          </Box>
        </Stack>
        {isStoreReadOnly && storeDisabledReason && (
          <Text id={shiftTargetDisabledReasonId} fontSize="xs" color="orange.700">
            {storeDisabledReason}
          </Text>
        )}
      </Stack>
    </Stack>
  );
}
