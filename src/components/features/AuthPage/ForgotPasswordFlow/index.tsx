import { ForgotPasswordFlowView } from "./ForgotPasswordFlowView";
import { useForgotPasswordFlowController } from "./useForgotPasswordFlowController";

type ForgotPasswordFlowProps = {
  redirectTo: string;
};

export function ForgotPasswordFlow({ redirectTo }: ForgotPasswordFlowProps) {
  const controller = useForgotPasswordFlowController({ redirectTo });

  return <ForgotPasswordFlowView redirectTo={redirectTo} {...controller} />;
}
