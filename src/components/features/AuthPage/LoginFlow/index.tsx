import { LoginFlowView } from "./LoginFlowView";
import { useLoginFlowController } from "./useLoginFlowController";

type LoginFlowProps = {
  redirectTo: string;
  initialErrorMessage?: string;
};

export function LoginFlow({ redirectTo, initialErrorMessage }: LoginFlowProps) {
  const controller = useLoginFlowController({ redirectTo, initialErrorMessage });

  return <LoginFlowView redirectTo={redirectTo} {...controller} />;
}
