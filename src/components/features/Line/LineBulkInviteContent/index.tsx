import { Stack, Text } from "@chakra-ui/react";

type Props = {
  unlinkedCount: number;
};

export const LineBulkInviteContent = ({ unlinkedCount }: Props) => (
  <Stack gap={3}>
    <Text fontSize="sm" color="gray.800">
      未連携スタッフ {unlinkedCount} 名に LINE 連携依頼メールを送ります。
    </Text>
    <Text fontSize="xs" color="fg.muted" lineHeight="tall">
      連携してくれた人はLINEでシフト通知を受け取れます。 未連携のままでもメール通知は今までどおり届きます。
    </Text>
  </Stack>
);
