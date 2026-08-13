import { Alert, Stack, Text } from "@chakra-ui/react";
import type { UserShopDetailData, UserShopDetailMembership } from "./types";

type Props = {
  data: UserShopDetailData;
  membership: UserShopDetailMembership;
};

export function UserShopLineSection({ data, membership }: Props) {
  const presentation = getShopLineNotificationPresentation(data, membership);

  return (
    <Stack gap={3}>
      <Stack gap={1}>
        <Text as="h2" fontSize="md" fontWeight="semibold" color="gray.900">
          LINE通知
        </Text>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          LINE連携はスタッフ詳細で管理し、同じ組織の所属店舗で共通に使います。
        </Text>
      </Stack>

      <Alert.Root status={presentation.alertStatus} borderRadius="md" alignItems="center" p={3}>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{presentation.label}</Alert.Title>
          <Alert.Description fontSize="sm" lineHeight="tall">
            {presentation.description}
          </Alert.Description>
        </Alert.Content>
      </Alert.Root>
    </Stack>
  );
}

function getShopLineNotificationPresentation(data: UserShopDetailData, membership: UserShopDetailMembership) {
  if (membership.shopStatus !== "active") {
    return {
      label: "この店舗からはLINE通知を送れません",
      description: "停止中の店舗では通知を送信できません。組織のLINE連携はそのまま残ります。",
      alertStatus: "warning" as const,
    };
  }
  if (membership.excludedFromShift) {
    return {
      label: "この店舗ではシフト通知の対象外です",
      description: "シフト対象へ戻すと、組織で共通のLINE連携をこの店舗でも利用できます。",
      alertStatus: "info" as const,
    };
  }
  if (data.line.status === "linked_following") {
    return {
      label: "この店舗ではLINEで通知できます",
      description: "組織で共通のLINE連携を使って、この店舗のシフト通知を送ります。",
      alertStatus: "success" as const,
    };
  }
  if (data.line.status === "linked_unfollowed") {
    return {
      label: "現在はLINEで通知できません",
      description: "LINE連携は残っています。再連携はスタッフ詳細の「LINE連携」から行ってください。",
      alertStatus: "warning" as const,
    };
  }
  return {
    label: "LINE未連携",
    description: "LINE連携はスタッフ詳細の「LINE連携」から設定してください。",
    alertStatus: "info" as const,
  };
}
