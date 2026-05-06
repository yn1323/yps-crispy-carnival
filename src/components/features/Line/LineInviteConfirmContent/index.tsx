import { Stack, Text } from "@chakra-ui/react";

type Props = {
  staffName: string;
  staffEmail: string;
};

export const LineInviteConfirmContent = ({ staffName, staffEmail }: Props) => (
  <Stack gap={3}>
    <Text fontSize="sm" color="gray.800">
      {staffName}さん（{staffEmail}）にLINE連携リンクをメールで送ります。
    </Text>
    <Text fontSize="xs" color="fg.muted" lineHeight="tall">
      メール本文には連携リンク（72時間有効・1回利用）が記載されます。連携すると、次回からシフト通知はLINEに届きます。
    </Text>
  </Stack>
);
