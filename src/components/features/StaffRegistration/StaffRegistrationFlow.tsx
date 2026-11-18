import type { StaffRegistrationFormData } from "@/convex/staffRegistration/schemas";
import { StaffRegistrationView } from "./StaffRegistrationView";
import type { StaffRegistrationCodeStep, StaffRegistrationPageData } from "./types";
import { useStaffRegistrationCodeFormController } from "./useStaffRegistrationCodeFormController";
import { useStaffRegistrationFormController } from "./useStaffRegistrationFormController";

type Props = {
  data: StaffRegistrationPageData;
  isSubmitting?: boolean;
  isSubmitted?: boolean;
  initialConfirmData?: StaffRegistrationFormData;
  initialFormValues?: Pick<StaffRegistrationFormData, "name" | "email">;
  /** 確認コードの入力待ち。nullの間は入力または確認の画面を表示する。 */
  codeStep?: StaffRegistrationCodeStep | null;
  onSubmit: (data: StaffRegistrationFormData) => Promise<void> | void;
  turnstile?: {
    widgetKey: number;
    siteKey: string;
    onError: (errorCode?: string) => void;
    onVerify: (token: string) => void;
  } | null;
  verificationError?: string | null;
};

export function StaffRegistrationFlow({
  data,
  isSubmitting = false,
  isSubmitted = false,
  initialConfirmData,
  initialFormValues,
  codeStep = null,
  onSubmit,
  turnstile = null,
  verificationError = null,
}: Props) {
  const controller = useStaffRegistrationFormController({ initialConfirmData, initialFormValues, onSubmit });

  if (data.status === "expired") {
    return <StaffRegistrationView state={{ kind: "expired" }} />;
  }

  if (isSubmitted) {
    return <StaffRegistrationView state={{ kind: "submitted" }} />;
  }

  if (codeStep) {
    return (
      <StaffRegistrationCodeStepView
        codeStep={codeStep}
        onReviseEmail={() => {
          // 確認画面ではなく入力画面へ戻し、メールアドレスをすぐ直せるようにする。
          controller.handleRevise();
          codeStep.onReviseEmail();
        }}
      />
    );
  }

  if (controller.confirmData) {
    return (
      <StaffRegistrationView
        state={{
          kind: "confirmation",
          confirmData: {
            name: controller.confirmData.name,
            email: controller.confirmData.email,
          },
          isSubmitting,
          onRevise: controller.handleRevise,
          onSubmit: controller.handleSubmitConfirmed,
          turnstile,
          verificationError,
        }}
      />
    );
  }

  return (
    <StaffRegistrationView
      state={{
        kind: "form",
        termsPath: data.documents.terms.path,
        privacyPath: data.documents.privacy.path,
        isSubmitting,
        nameRegistration: controller.nameRegistration,
        emailRegistration: controller.emailRegistration,
        acceptedLegal: controller.acceptedLegal,
        nameError: controller.nameError,
        emailError: controller.emailError,
        acceptedLegalError: controller.acceptedLegalError,
        typoSuggestion: controller.typoSuggestion,
        onConfirm: controller.handleConfirm,
        onAcceptedLegalChange: controller.handleAcceptedLegalChange,
        onApplyEmailSuggestion: controller.handleApplyEmailSuggestion,
      }}
    />
  );
}

function StaffRegistrationCodeStepView({
  codeStep,
  onReviseEmail,
}: {
  codeStep: StaffRegistrationCodeStep;
  onReviseEmail: () => void;
}) {
  const controller = useStaffRegistrationCodeFormController({
    resendAvailableAt: codeStep.resendAvailableAt,
    onConfirmCode: codeStep.onConfirmCode,
    onCodeChange: codeStep.onCodeChange,
  });

  return (
    <StaffRegistrationView
      state={{
        kind: "code",
        email: codeStep.email,
        codeRegistration: controller.codeRegistration,
        // 形式の誤りは送信前に画面で止まるため、serverの照合結果より先に表示する。
        codeError: controller.codeFormatError ?? codeStep.codeError ?? undefined,
        isConfirming: codeStep.isConfirming,
        isResending: codeStep.isResending,
        resendRemainingSeconds: controller.resendRemainingSeconds,
        onConfirmCode: controller.handleConfirmCode,
        onResend: codeStep.onResend,
        onReviseEmail,
      }}
    />
  );
}
