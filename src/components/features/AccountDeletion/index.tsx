import { AccountDeletionDialog } from "./AccountDeletionDialog";
import { AccountDeletionSection } from "./AccountDeletionSection";
import { AccountDeletionTrigger, type AccountDeletionVariant } from "./AccountDeletionTrigger";

export { AccountDeletionSection } from "./AccountDeletionSection";

import { useAccountDeletionController } from "./useAccountDeletionController";

type Props = {
  variant: AccountDeletionVariant;
};

export function AccountDeletion({ variant }: Props) {
  if (variant === "setup") return <AccountDeletionSection />;

  return <LegacyAccountDeletion />;
}

function LegacyAccountDeletion() {
  const controller = useAccountDeletionController();

  return (
    <>
      <AccountDeletionTrigger variant="legacy" onOpen={controller.open} />
      <AccountDeletionDialog {...controller} />
    </>
  );
}
