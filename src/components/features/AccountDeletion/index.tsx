import { AccountDeletionDialog } from "./AccountDeletionDialog";
import { AccountDeletionTrigger, type AccountDeletionVariant } from "./AccountDeletionTrigger";

export { AccountDeletionSection } from "./AccountDeletionSection";

import { useAccountDeletionController } from "./useAccountDeletionController";

type Props = {
  variant: AccountDeletionVariant;
};

export function AccountDeletion({ variant }: Props) {
  const controller = useAccountDeletionController();

  return (
    <>
      <AccountDeletionTrigger variant={variant} onOpen={controller.open} />
      <AccountDeletionDialog {...controller} />
    </>
  );
}
