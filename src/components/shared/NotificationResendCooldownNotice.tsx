import { Stack, Text } from "@chakra-ui/react";
import { toaster } from "@/src/components/ui/toaster";

export const NOTIFICATION_RESEND_COOLDOWN_TITLE = "送信済みです";
export const NOTIFICATION_RESEND_COOLDOWN_DESCRIPTION = "送信から10分後に再送できるようになります。";

export function showNotificationResendCooldownToast() {
  toaster.create({
    title: NOTIFICATION_RESEND_COOLDOWN_TITLE,
    description: NOTIFICATION_RESEND_COOLDOWN_DESCRIPTION,
    type: "info",
  });
}

export function NotificationResendCooldownNotice() {
  return (
    <Stack gap={0.5} color="fg.muted" fontSize="xs" lineHeight="tall">
      <Text color="gray.700" fontWeight="semibold">
        {NOTIFICATION_RESEND_COOLDOWN_TITLE}。
      </Text>
      <Text>{NOTIFICATION_RESEND_COOLDOWN_DESCRIPTION}</Text>
    </Stack>
  );
}
