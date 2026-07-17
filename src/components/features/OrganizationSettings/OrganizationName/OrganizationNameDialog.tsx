import { Field, Input, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { ORGANIZATION_NAME_MAX_LENGTH } from "@/convex/constants";
import { Dialog } from "@/src/components/ui/Dialog";

type Props = {
  isOpen: boolean;
  organizationName: string;
  isRunning: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
};

export function OrganizationNameDialog({ isOpen, organizationName, isRunning, onClose, onSubmit }: Props) {
  const [name, setName] = useState(organizationName);
  useEffect(() => {
    if (isOpen) setName(organizationName);
  }, [isOpen, organizationName]);
  const normalizedName = name.trim();

  if (!isOpen) return null;

  return (
    <Dialog
      title="グループ名を変更"
      isOpen
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
      onClose={onClose}
      formId="organization-name-form"
      submitLabel="変更する"
      isLoading={isRunning}
      isSubmitDisabled={!normalizedName || normalizedName === organizationName.trim()}
      maxW={{ base: "calc(100vw - 24px)", md: "520px" }}
    >
      <form
        id="organization-name-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (normalizedName) onSubmit(normalizedName);
        }}
      >
        <Stack gap={4}>
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            グループ名は、グループ設定や招待メールに表示されます。店舗名は変更されません。
          </Text>
          <Field.Root required>
            <Field.Label>グループ名</Field.Label>
            <Input
              value={name}
              maxLength={ORGANIZATION_NAME_MAX_LENGTH}
              autoFocus
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </Field.Root>
        </Stack>
      </form>
    </Dialog>
  );
}
