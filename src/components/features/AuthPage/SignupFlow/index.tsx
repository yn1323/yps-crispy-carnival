import { SignupFlowView } from "./SignupFlowView";
import { useSignupFlowController } from "./useSignupFlowController";

type SignupFlowProps = {
  redirectTo: string;
};

export function SignupFlow({ redirectTo }: SignupFlowProps) {
  const controller = useSignupFlowController({ redirectTo });

  return <SignupFlowView redirectTo={redirectTo} {...controller} />;
}
