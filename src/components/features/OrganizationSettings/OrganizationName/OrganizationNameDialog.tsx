import { Field, Input } from "@chakra-ui/react";
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
      title="組織名を変更"
      isOpen
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
      onClose={onClose}
      formId="organization-name-form"
      submitLabel="変更する"
      isLoading={isRunning}
      isSubmitDisabled={!normalizedName || normalizedName === organizationName.trim()}
      mobileActionLayout="inline"
      maxW={{ base: "calc(100vw - 24px)", md: "520px" }}
    >
      <form
        id="organization-name-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (normalizedName) onSubmit(normalizedName);
        }}
      >
        <Field.Root required>
          <Field.Label>組織名</Field.Label>
          <Input
            value={name}
            maxLength={ORGANIZATION_NAME_MAX_LENGTH}
            autoFocus
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </Field.Root>
      </form>
    </Dialog>
  );
}
