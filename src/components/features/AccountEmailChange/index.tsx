import { AccountEmailChangeView } from "./AccountEmailChangeView";
import { useAccountEmailChangeController } from "./useAccountEmailChangeController";

type Props = {
  isOpen: boolean;
  initialEmail?: string;
  lockTargetEmail?: boolean;
  source?: "app" | "recovery";
  onClose: () => void;
  onFinished: (outcome: AccountEmailChangeOutcome) => void;
};

export type AccountEmailChangeOutcome = "changed" | "rolledBack";

export function AccountEmailChange({
  isOpen,
  initialEmail,
  lockTargetEmail,
  source = "app",
  onClose,
  onFinished,
}: Props) {
  const controller = useAccountEmailChangeController({ source });
  const finish = () => {
    const outcome: AccountEmailChangeOutcome = controller.step === "rolledBack" ? "rolledBack" : "changed";
    controller.reset();
    onFinished(outcome);
  };

  return (
    <AccountEmailChangeView
      isOpen={isOpen}
      controller={controller}
      initialEmail={initialEmail}
      lockTargetEmail={lockTargetEmail}
      onClose={onClose}
      onFinish={finish}
    />
  );
}

export { AccountEmailChangeView } from "./AccountEmailChangeView";
export type { AccountEmailChangeController, AccountEmailChangeStep } from "./useAccountEmailChangeController";
