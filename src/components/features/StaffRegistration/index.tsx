import { StaffRegistrationFlow } from "./StaffRegistrationFlow";
import type { StaffRegistrationPageData } from "./types";
import { useStaffRegistrationController } from "./useStaffRegistrationController";

type Props = {
  token: string | undefined;
  data: StaffRegistrationPageData;
};

export function StaffRegistration({ token, data }: Props) {
  const controller = useStaffRegistrationController(token);

  return (
    <StaffRegistrationFlow
      data={data}
      isSubmitting={controller.isSubmitting}
      isSubmitted={controller.isSubmitted}
      initialFormValues={controller.initialFormValues}
      codeStep={controller.codeStep}
      onSubmit={controller.handleSubmit}
      turnstile={controller.turnstile}
      verificationError={controller.verificationError}
    />
  );
}

export type { StaffRegistrationPageData } from "./types";
