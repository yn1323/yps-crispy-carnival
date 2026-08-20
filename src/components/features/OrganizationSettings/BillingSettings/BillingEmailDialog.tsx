import { Field, Input, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { EMAIL_MAX_LENGTH } from "@/convex/constants";
import { Dialog } from "@/src/components/ui/Dialog";

type Props = {
  isOpen: boolean;
  billingEmail: string;
  isRunning: boolean;
  onClose: () => void;
  onSubmit: (email: string) => void;
};

export function BillingEmailDialog({ isOpen, billingEmail, isRunning, onClose, onSubmit }: Props) {
  const [email, setEmail] = useState(billingEmail);
  useEffect(() => {
    if (isOpen) setEmail(billingEmail);
  }, [billingEmail, isOpen]);

  if (!isOpen) return null;
  const normalized = email.trim();

  return (
    <Dialog
      title="請求先メールアドレスを変更"
      isOpen
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
      onClose={onClose}
      formId="billing-email-form"
      submitLabel="変更する"
      isLoading={isRunning}
      isSubmitDisabled={!isEmail(normalized) || normalized.toLowerCase() === billingEmail.trim().toLowerCase()}
      maxW={{ base: "calc(100vw - 24px)", md: "520px" }}
    >
      <form
        id="billing-email-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (isEmail(normalized)) onSubmit(normalized);
        }}
      >
        <Stack gap={4}>
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            請求先は、通知の宛先です。
            <br />
            契約操作の権限は付与されません。
            <br />
            変更すると、現在の管理者へメールで通知します。
          </Text>
          <Field.Root required>
            <Field.Label>新しい請求先メールアドレス</Field.Label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              maxLength={EMAIL_MAX_LENGTH}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
          </Field.Root>
        </Stack>
      </form>
    </Dialog>
  );
}

function isEmail(value: string): boolean {
  return value.length <= EMAIL_MAX_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
