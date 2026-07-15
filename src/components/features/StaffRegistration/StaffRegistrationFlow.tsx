import type { StaffRegistrationFormData } from "@/convex/staffRegistration/schemas";
import { StaffRegistrationView } from "./StaffRegistrationView";
import type { StaffRegistrationPageData } from "./types";
import { useStaffRegistrationFormController } from "./useStaffRegistrationFormController";

type Props = {
  data: StaffRegistrationPageData;
  isSubmitting?: boolean;
  isSubmitted?: boolean;
  initialConfirmData?: StaffRegistrationFormData;
  onSubmit: (data: StaffRegistrationFormData) => Promise<void> | void;
};

export function StaffRegistrationFlow({
  data,
  isSubmitting = false,
  isSubmitted = false,
  initialConfirmData,
  onSubmit,
}: Props) {
  const controller = useStaffRegistrationFormController({ initialConfirmData, onSubmit });

  if (data.status === "expired") {
    return <StaffRegistrationView state={{ kind: "expired" }} />;
  }

  if (isSubmitted) {
    return <StaffRegistrationView state={{ kind: "submitted" }} />;
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
