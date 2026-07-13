import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { type StaffRegistrationFormData, staffRegistrationFormSchema } from "@/convex/staffRegistration/schemas";
import { suggestEmailTypoFix } from "./emailTypo";

type Params = {
  initialConfirmData?: StaffRegistrationFormData;
  onSubmit: (data: StaffRegistrationFormData) => Promise<void> | void;
};

export function useStaffRegistrationFormController({ initialConfirmData, onSubmit }: Params) {
  const [confirmData, setConfirmData] = useState<StaffRegistrationFormData | null>(initialConfirmData ?? null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<StaffRegistrationFormData>({
    resolver: zodResolver(staffRegistrationFormSchema),
    defaultValues: { name: "", email: "", acceptedLegal: false },
  });
  const acceptedLegal = watch("acceptedLegal");
  const typoSuggestion = suggestEmailTypoFix(watch("email"));

  const handleConfirm = handleSubmit((values) => setConfirmData(values));

  const handleSubmitConfirmed = () => {
    if (!confirmData) return;
    return onSubmit(confirmData);
  };

  const handleAcceptedLegalChange = (checked: boolean) => {
    setValue("acceptedLegal", checked, { shouldDirty: true, shouldValidate: true });
  };

  const handleApplyEmailSuggestion = () => {
    if (!typoSuggestion) return;
    setValue("email", typoSuggestion, { shouldDirty: true, shouldValidate: true });
  };

  return {
    confirmData,
    nameRegistration: register("name"),
    emailRegistration: register("email"),
    acceptedLegal,
    nameError: errors.name?.message,
    emailError: errors.email?.message,
    acceptedLegalError: errors.acceptedLegal?.message,
    typoSuggestion,
    handleConfirm,
    handleRevise: () => setConfirmData(null),
    handleSubmitConfirmed,
    handleAcceptedLegalChange,
    handleApplyEmailSuggestion,
  };
}
