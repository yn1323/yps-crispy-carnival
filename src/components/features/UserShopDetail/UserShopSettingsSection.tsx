import { Badge, Box, chakra, Grid, Icon, RadioCard, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import { LuCircle, LuX } from "react-icons/lu";
import type { UserShopDetailMembership } from "./types";

type Props = {
  membership: UserShopDetailMembership;
  isManager: boolean;
  isStoreReadOnly: boolean;
  storeDisabledReason?: string;
  isChangingShiftTarget: boolean;
  onChangeShiftTarget: (isShiftTarget: boolean) => void | Promise<void>;
};

type ShiftTargetValue = "target" | "excluded";

const SHIFT_TARGET_OPTIONS: ReadonlyArray<{
  value: ShiftTargetValue;
  title: string;
  isShiftTarget: boolean;
  effects: readonly string[];
}> = [
  { value: "target", title: "参加する", isShiftTarget: true, effects: ["シフト表に表示する", "提出人数に数える"] },
  {
    value: "excluded",
    title: "参加しない",
    isShiftTarget: false,
    effects: ["シフト表に表示しない", "提出人数に数えない"],
  },
];

type NotificationRowContent = {
  label: string;
  description?: string;
  whenExcluded: boolean;
};

const SHIFT_NOTIFICATIONS: readonly NotificationRowContent[] = [
  { label: "希望シフトの提出依頼", whenExcluded: false },
  { label: "シフトの催促", whenExcluded: false },
  { label: "確定シフトのお知らせ", whenExcluded: false },
];

// 管理者宛ての通知はシフト対象かどうかを見ないため、参加しない場合も届く。管理者にだけ行を出す。
const MANAGER_NOTIFICATION: NotificationRowContent = {
  label: "管理者へのお知らせ",
  description: "シフト確定の催促、スタッフ登録申請、送れなかった通知",
  whenExcluded: true,
};

export function UserShopSettingsSection({
  membership,
  isManager,
  isStoreReadOnly,
  storeDisabledReason,
  isChangingShiftTarget,
  onChangeShiftTarget,
}: Props) {
  const shiftTargetDisabledReasonId = `user-shop-detail-shift-target-disabled-${membership.staffId}`;
  const notificationLabelId = `user-shop-detail-shift-target-notifications-${membership.staffId}`;
  const value: ShiftTargetValue = membership.excludedFromShift ? "excluded" : "target";
  const notifications = isManager ? [...SHIFT_NOTIFICATIONS, MANAGER_NOTIFICATION] : SHIFT_NOTIFICATIONS;

  return (
    <Stack gap={5}>
      <RadioCard.Root
        value={value}
        disabled={isStoreReadOnly || isChangingShiftTarget}
        colorPalette="teal"
        aria-describedby={isStoreReadOnly && storeDisabledReason ? shiftTargetDisabledReasonId : undefined}
        onValueChange={(details) => {
          if (details.value === value) return;
          if (details.value === "target" || details.value === "excluded") {
            void onChangeShiftTarget(details.value === "target");
          }
        }}
      >
        <RadioCard.Label asChild>
          <Text as="h2" fontSize="md" fontWeight="semibold" color="gray.900" mb={1}>
            シフトへの参加
          </Text>
        </RadioCard.Label>
        <Grid templateColumns={{ base: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }} gap={3}>
          {SHIFT_TARGET_OPTIONS.map((option) => (
            <RadioCard.Item
              key={option.value}
              value={option.value}
              bg="white"
              cursor="pointer"
              _checked={{ bg: "teal.50" }}
              _disabled={{ cursor: "not-allowed" }}
            >
              <RadioCard.ItemHiddenInput />
              <RadioCard.ItemControl alignItems="flex-start" gap={3} p={{ base: 3, md: 4 }}>
                <RadioCard.ItemIndicator mt={0.5} flexShrink={0} />
                <RadioCard.ItemContent minW={0} gap={2}>
                  <RadioCard.ItemText fontWeight="semibold" color="gray.900">
                    {option.title}
                    {!option.isShiftTarget && (
                      <Badge ms={2} colorPalette="gray" variant="subtle" verticalAlign="middle">
                        シフト対象外
                      </Badge>
                    )}
                  </RadioCard.ItemText>
                  <Stack as="ul" gap={1} listStyleType="none" fontSize="sm" color="gray.800">
                    {option.effects.map((effect) => (
                      <Box as="li" key={effect}>
                        {effect}
                      </Box>
                    ))}
                  </Stack>
                </RadioCard.ItemContent>
              </RadioCard.ItemControl>
            </RadioCard.Item>
          ))}
        </Grid>
      </RadioCard.Root>

      <Stack gap={1}>
        <Text id={notificationLabelId} fontSize="sm" fontWeight="semibold" color="gray.900">
          受け取る通知も変わります
        </Text>
        <chakra.table
          aria-labelledby={notificationLabelId}
          w="full"
          fontSize="sm"
          color="gray.800"
          style={{ borderCollapse: "collapse" }}
        >
          <chakra.thead fontSize="xs" color="fg.muted">
            <chakra.tr>
              <chakra.th scope="col" textAlign="start" fontWeight="normal" py={1.5}>
                通知の種類
              </chakra.th>
              {SHIFT_TARGET_OPTIONS.map((option) => (
                <chakra.th key={option.value} scope="col" w="4.5rem" textAlign="center" fontWeight="normal" py={1.5}>
                  {option.title}
                </chakra.th>
              ))}
            </chakra.tr>
          </chakra.thead>
          <chakra.tbody>
            {notifications.map((notification) => (
              <chakra.tr key={notification.label} borderTopWidth="1px" borderColor="blackAlpha.100">
                <chakra.th scope="row" textAlign="start" fontWeight="normal" py={2}>
                  {notification.label}
                  {notification.description && (
                    <Text as="span" display="block" fontSize="xs" color="fg.muted">
                      {notification.description}
                    </Text>
                  )}
                </chakra.th>
                <DeliveryCell isDelivered />
                <DeliveryCell isDelivered={notification.whenExcluded} />
              </chakra.tr>
            ))}
          </chakra.tbody>
        </chakra.table>
      </Stack>

      {isStoreReadOnly && storeDisabledReason && (
        <Text id={shiftTargetDisabledReasonId} fontSize="xs" color="orange.700">
          {storeDisabledReason}
        </Text>
      )}
    </Stack>
  );
}

function AvailabilityMark({ isAvailable }: { isAvailable: boolean }) {
  return (
    <Icon boxSize={4} flexShrink={0} color={isAvailable ? "gray.800" : "fg.muted"} aria-hidden>
      {isAvailable ? <LuCircle /> : <LuX />}
    </Icon>
  );
}

function DeliveryCell({ isDelivered }: { isDelivered: boolean }) {
  return (
    <chakra.td w="4.5rem" textAlign="center" py={2}>
      <AvailabilityMark isAvailable={isDelivered} />
      <VisuallyHidden>{isDelivered ? "届く" : "届かない"}</VisuallyHidden>
    </chakra.td>
  );
}
