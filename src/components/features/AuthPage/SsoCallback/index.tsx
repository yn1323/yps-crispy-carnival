import { FullPageSpinner } from "@/src/components/templates/FullPageSpinner";
import { LoginFlow } from "../LoginFlow";
import { useSsoCallbackController } from "./useSsoCallbackController";

export function SsoCallbackPage() {
  const { errorMessage, isProcessing } = useSsoCallbackController();

  if (isProcessing && !errorMessage) {
    return <FullPageSpinner />;
  }

  return <LoginFlow redirectTo="/dashboard" initialErrorMessage={errorMessage} />;
}
