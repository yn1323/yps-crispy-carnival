import { Alert, Link, Stack, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { Dialog } from "@/src/components/ui/Dialog";
import type { AccountDeletionErrorState } from "./types";

type Props = {
  isOpen: boolean;
  isRunning: boolean;
  error: AccountDeletionErrorState | null;
  onClose: () => void;
  onOpenChange: (details: { open: boolean }) => void;
  onSubmit: () => void;
};

export function AccountDeletionDialog({ isOpen, isRunning, error, onClose, onOpenChange, onSubmit }: Props) {
  return (
    <Dialog
      title="アカウントを削除"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={onClose}
      formId="account-deletion-form"
      submitLabel="アカウントを削除"
      submitColorPalette="red"
      isLoading={isRunning}
      isSubmitDisabled={isRunning}
      role="alertdialog"
      maxW={{ base: "calc(100vw - 24px)", md: "600px" }}
    >
      <form
        id="account-deletion-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isRunning) onSubmit();
        }}
      >
        <Stack gap={4}>
          <Text fontWeight="bold">この操作は元に戻せません。</Text>
          <Stack gap={2} fontSize="sm" color="fg" lineHeight="tall">
            <Text>Clerkのログイン情報を削除し、このログインではシフトリを利用できない状態にします。</Text>
            <Text>
              シフトリ内の氏名、メールアドレス、店舗名、過去のシフト・同意・請求などの履歴は、業務記録として残ります。
            </Text>
            <Text>同じメールアドレスで登録し直しても、削除前の履歴を新しいアカウントへ自動で紐付けません。</Text>
          </Stack>
          {error ? (
            <Alert.Root status="error" borderRadius="lg" alignItems="flex-start">
              <Alert.Indicator mt={0.5} />
              <Alert.Content gap={2}>
                <Alert.Description>{error.message}</Alert.Description>
                {error.showContactLink ? (
                  <Link asChild alignSelf="flex-start" color="red.700" fontSize="sm" fontWeight="semibold">
                    <RouterLink to="/contact">お問い合わせへ</RouterLink>
                  </Link>
                ) : null}
              </Alert.Content>
            </Alert.Root>
          ) : null}
        </Stack>
      </form>
    </Dialog>
  );
}
