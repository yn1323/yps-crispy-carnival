import { Stack, Text } from "@chakra-ui/react";

type Props = {
  unlinkedCount: number;
};

export const LineBulkInviteContent = ({ unlinkedCount }: Props) => (
  <Stack gap={3}>
    <Text fontSize="sm" color="gray.800">
      未連携スタッフ {unlinkedCount} 名にLINE連携リンクをメールで送ります。
    </Text>
    <Text fontSize="xs" color="fg.muted" lineHeight="tall">
      連携したスタッフには、次回からシフト通知がLINEに届きます。
    </Text>
  </Stack>
);
